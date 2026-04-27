/**
 * @fileoverview Account Token Service
 *
 * Provides three capabilities for the account-identity session separation:
 *
 * 1. **generateAccountHash** — deterministic, non-reversible HMAC-SHA256 of
 *    the account's `_id + createdAt`, keyed by ACCOUNT_HASH_SECRET. The output
 *    is used as the Argon2id salt for identity hashing and as the key in the
 *    `identity_counts` collection.
 *
 * 2. **createSignedToken** — compact HS256 JWT carrying `{ sub: accountHash,
 *    maxIdentities, maxVideoDurationSeconds, iat, exp }`. Short-lived (15 min);
 *    refreshed on every `GET /api/auth/session` call.
 *
 * 3. **verifySignedToken** — validates signature, expiry, and structure.
 *
 * @module services/account-token
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../config';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '../constants/media-limits';
import type { SubscriptionTierId } from '@adieuu/shared';

/** Token lifetime in seconds (15 minutes). */
const TOKEN_TTL_SECONDS = 15 * 60;

// ---------------------------------------------------------------------------
// Account Hash
// ---------------------------------------------------------------------------

/**
 * Derives a deterministic, non-reversible hash for an account.
 *
 * `HMAC-SHA256(accountId + ':' + createdAt.getTime(), ACCOUNT_HASH_SECRET)`
 *
 * Output: 64-char lowercase hex string.
 */
export function generateAccountHash(
  accountId: string,
  createdAt: Date,
): string {
  const message = `${accountId}:${createdAt.getTime()}`;
  return createHmac('sha256', config.security.accountHashSecret)
    .update(message)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// JWT helpers (compact HS256, no external library)
// ---------------------------------------------------------------------------

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

/** Static HS256 header, pre-encoded. */
const JWT_HEADER = base64UrlEncode(
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
);

function hmacSha256(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

// ---------------------------------------------------------------------------
// Token payload
// ---------------------------------------------------------------------------

export interface AccountTokenPayload {
  /** accountHash (HMAC of account ID) */
  sub: string;
  /** Maximum identities the account may create */
  maxIdentities: number;
  /**
   * Effective max video duration (seconds) for this account at token mint time
   * (platform ceiling and optional per-account cap). Copied onto identity session at login.
   */
  maxVideoDurationSeconds: number;
  /** Active subscription tier ids (empty array for free users) */
  subscriptions: SubscriptionTierId[];
  /** Feature entitlements (reserved; always empty for now) */
  entitlements: string[];
  /** Subscription period end (Unix seconds), used to build encrypted grants at identity login. */
  currentPeriodEnd?: number;
  /** Whether the user holds a lifetime purchase. */
  isLifetime?: boolean;
  /** Issued-at (epoch seconds) */
  iat: number;
  /** Expiration (epoch seconds) */
  exp: number;
}

// ---------------------------------------------------------------------------
// Sign / Verify
// ---------------------------------------------------------------------------

/**
 * Creates a short-lived HS256 JWT for bridging account→identity transitions.
 */
export function createSignedToken(
  accountHash: string,
  maxIdentities: number,
  maxVideoDurationSeconds: number,
  subscriptions: SubscriptionTierId[] = [],
  entitlements: string[] = [],
  billingMeta?: { currentPeriodEnd?: number; isLifetime?: boolean },
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccountTokenPayload = {
    sub: accountHash,
    maxIdentities,
    maxVideoDurationSeconds,
    subscriptions,
    entitlements,
    currentPeriodEnd: billingMeta?.currentPeriodEnd,
    isLifetime: billingMeta?.isLifetime,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
  };

  const encodedPayload = base64UrlEncode(
    Buffer.from(JSON.stringify(payload)),
  );

  const signingInput = `${JWT_HEADER}.${encodedPayload}`;
  const signature = base64UrlEncode(
    hmacSha256(signingInput, config.security.tokenSigningKey),
  );

  return `${signingInput}.${signature}`;
}

/**
 * Verifies an HS256 JWT and returns the parsed payload.
 *
 * Returns `null` if the token is malformed, tampered, or expired.
 */
export function verifySignedToken(token: string): AccountTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, encodedPayload, signature] = parts as [string, string, string];

  // Verify signature (constant-time)
  const signingInput = `${header}.${encodedPayload}`;
  const expectedSig = hmacSha256(signingInput, config.security.tokenSigningKey);

  let receivedSig: Buffer;
  try {
    receivedSig = base64UrlDecode(signature);
  } catch {
    return null;
  }

  if (expectedSig.length !== receivedSig.length) return null;
  if (!timingSafeEqual(expectedSig, receivedSig)) return null;

  // Decode payload
  let payload: AccountTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  } catch {
    return null;
  }

  // Validate structure
  if (
    typeof payload.sub !== 'string' ||
    typeof payload.maxIdentities !== 'number' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    return null;
  }

  let maxVideoDurationSeconds = payload.maxVideoDurationSeconds;
  if (typeof maxVideoDurationSeconds !== 'number' || !Number.isFinite(maxVideoDurationSeconds)) {
    maxVideoDurationSeconds = DEFAULT_MAX_VIDEO_DURATION_SECONDS;
  } else if (maxVideoDurationSeconds < 1) {
    maxVideoDurationSeconds = DEFAULT_MAX_VIDEO_DURATION_SECONDS;
  }

  // Default new array fields for tokens minted before this addition
  const subscriptions = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
  const entitlements = Array.isArray(payload.entitlements) ? payload.entitlements : [];

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;

  return { ...payload, maxVideoDurationSeconds, subscriptions, entitlements };
}
