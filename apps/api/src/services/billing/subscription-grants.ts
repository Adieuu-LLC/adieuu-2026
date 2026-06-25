/**
 * Split-key encrypted subscription/entitlement grants for identity sessions.
 *
 * At identity login the server builds a grant payload (tier/entitlement ->
 * Unix expiration timestamp), encrypts it with a random AES-256-GCM key,
 * stores the ciphertext on the Mongo session document, and embeds the key
 * in the session cookie. This ensures:
 *
 *   - DB compromise cannot read subscription dates.
 *   - Cookie compromise cannot read subscription dates.
 *   - The evaluate function ONLY returns status enums, never raw dates.
 *
 * @module services/billing/subscription-grants
 */

import {
  encryptAES256GCM,
  decryptAES256GCM,
  randomBytes,
  toBase64,
  fromBase64,
  SYMMETRIC_KEY_SIZE,
  AES_GCM_NONCE_SIZE,
} from '@adieuu/crypto';
import { SUBSCRIPTION_TIER_IDS, type SubscriptionTierId } from '@adieuu/shared';
import type { UserBilling } from '../../models/user';
import elog from '../../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GrantStatus = 'current' | 'expired' | 'expiring_soon';

export interface EvaluatedGrants {
  subscriptions: Partial<Record<SubscriptionTierId, GrantStatus>>;
  entitlements: Record<string, GrantStatus>;
  isLifetime: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_ID_SET: ReadonlySet<string> = new Set(SUBSCRIPTION_TIER_IDS);

/**
 * Reserved payload key for the lifetime flag. Stored inside the encrypted
 * grant blob so it travels with the rest of the billing data without
 * ever appearing in plaintext on the session document.
 */
const LIFETIME_FLAG_KEY = '_lifetime';

/** 24 hours in milliseconds — threshold for `expiring_soon`. */
const EXPIRING_SOON_MS = 24 * 60 * 60 * 1000;

/** ~25 years in seconds — far-future base for lifetime grants. */
const LIFETIME_OFFSET_SECONDS = 25 * 365.25 * 24 * 60 * 60;

/**
 * Maximum random jitter added to lifetime timestamps to prevent all
 * lifetime users from sharing an identical far-future value.
 * +/- up to 7 days.
 */
const LIFETIME_JITTER_SECONDS = 7 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Grant payload construction
// ---------------------------------------------------------------------------

/**
 * Internal grant payload: flat map of grant key -> Unix expiration timestamp.
 * NEVER exposed outside this module.
 */
type GrantPayload = Record<string, number>;

function jitteredLifetimeTimestamp(): number {
  const jitter = Math.floor(Math.random() * LIFETIME_JITTER_SECONDS * 2) - LIFETIME_JITTER_SECONDS;
  return Math.floor(Date.now() / 1000) + LIFETIME_OFFSET_SECONDS + jitter;
}

/**
 * Builds the grant payload from billing state.
 *
 * Subscription tiers and entitlements are treated uniformly. Lifetime
 * grants get a far-future timestamp with random jitter (no null sentinels)
 * to preserve the anonymity set.
 */
export function buildGrantPayload(billing: UserBilling): GrantPayload {
  const payload: GrantPayload = {};

  const periodEndUnix = billing.currentPeriodEnd
    ? Math.floor(billing.currentPeriodEnd.getTime() / 1000)
    : undefined;

  for (const tier of billing.activeSubscriptions) {
    if (billing.isLifetime) {
      payload[tier] = jitteredLifetimeTimestamp();
    } else if (periodEndUnix !== undefined) {
      payload[tier] = periodEndUnix;
    }
  }

  for (const ent of billing.entitlements) {
    if (billing.isLifetime) {
      payload[ent] = jitteredLifetimeTimestamp();
    } else if (periodEndUnix !== undefined) {
      payload[ent] = periodEndUnix;
    }
  }

  if (billing.isLifetime) {
    payload[LIFETIME_FLAG_KEY] = 1;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Encryption / decryption
// ---------------------------------------------------------------------------

/** Maximum JSON payload size encodable in the 2-byte big-endian length prefix. */
const MAX_GRANT_JSON_BYTES = 0xffff;

/**
 * Minimum padded plaintext size. Payloads are padded to the smallest
 * power-of-2 bucket that fits `2 + jsonLength`. This limits the number
 * of distinguishable ciphertext sizes to a handful of buckets (256, 512,
 * 1024, 2048 …) instead of potentially leaking the exact grant count.
 *
 * Layout: [2-byte BE payload length][JSON bytes][random fill to bucket size]
 */
const GRANT_MIN_PADDED_SIZE = 256;

/**
 * Rounds up to the next power-of-2 that is >= GRANT_MIN_PADDED_SIZE.
 * e.g. 100 -> 256, 300 -> 512, 600 -> 1024, 1200 -> 2048.
 */
function paddedBucketSize(needed: number): number {
  let size = GRANT_MIN_PADDED_SIZE;
  while (size < needed) size *= 2;
  return size;
}

/**
 * Encrypts a grant payload.
 *
 * The JSON plaintext is padded with random bytes to the next power-of-2
 * bucket (minimum 256 bytes), so ciphertext length reveals at most which
 * bucket the payload falls into — not the exact number of grants.
 * 
 * Since we only have ~10 possible entitlements presently, pretty much everyone will be in the smallest bucket for now.
 *
 * @returns `{ ciphertext, key }` — ciphertext is base64 (store in Mongo),
 *          key is base64 (embed in the session cookie).
 */
export function encryptGrants(payload: GrantPayload): { ciphertext: string; key: string } {
  const key = randomBytes(SYMMETRIC_KEY_SIZE);
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (jsonBytes.length > MAX_GRANT_JSON_BYTES) {
    throw new Error(
      `Grant payload too large: ${jsonBytes.length} bytes (max ${MAX_GRANT_JSON_BYTES})`,
    );
  }

  const bucketSize = paddedBucketSize(2 + jsonBytes.length);
  const padded = new Uint8Array(bucketSize);
  // 2-byte big-endian length prefix
  padded[0] = (jsonBytes.length >> 8) & 0xff;
  padded[1] = jsonBytes.length & 0xff;
  padded.set(jsonBytes, 2);
  // Fill remainder with random bytes (not zeros — avoids leaking structure)
  const fillLength = bucketSize - 2 - jsonBytes.length;
  if (fillLength > 0) {
    padded.set(randomBytes(fillLength), 2 + jsonBytes.length);
  }

  const { ciphertext, nonce } = encryptAES256GCM(key, padded);

  // Pack nonce + ciphertext into a single buffer for storage
  const packed = new Uint8Array(AES_GCM_NONCE_SIZE + ciphertext.length);
  packed.set(nonce, 0);
  packed.set(ciphertext, AES_GCM_NONCE_SIZE);

  return {
    ciphertext: toBase64(packed),
    key: toBase64(key),
  };
}

function decryptGrants(encryptedBase64: string, keyBase64: string): GrantPayload | null {
  try {
    const packed = fromBase64(encryptedBase64);
    if (packed.length <= AES_GCM_NONCE_SIZE) return null;

    const nonce = packed.slice(0, AES_GCM_NONCE_SIZE);
    const ciphertext = packed.slice(AES_GCM_NONCE_SIZE);
    const key = fromBase64(keyBase64);

    const plaintext = decryptAES256GCM(key, ciphertext, nonce);

    // Try padded format first: [2-byte BE length][JSON][random fill]
    const parsed = parsePaddedPayload(plaintext) ?? parseLegacyPayload(plaintext);

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as GrantPayload;
  } catch {
    return null;
  }
}

/** New format: 2-byte BE length prefix + JSON + random padding. */
function parsePaddedPayload(buf: Uint8Array): unknown | null {
  if (buf.length < 4) return null;
  const jsonLength = (buf[0]! << 8) | buf[1]!;
  if (jsonLength < 2 || 2 + jsonLength > buf.length) return null;
  try {
    return JSON.parse(new TextDecoder().decode(buf.slice(2, 2 + jsonLength)));
  } catch {
    return null;
  }
}

/** Legacy format: raw JSON bytes (no padding). Supports pre-migration sessions. */
function parseLegacyPayload(buf: Uint8Array): unknown | null {
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluation (the only public decryption path)
// ---------------------------------------------------------------------------

function evaluateTimestamp(expirationUnix: number, nowMs: number): GrantStatus {
  const expirationMs = expirationUnix * 1000;
  if (expirationMs <= nowMs) return 'expired';
  if (expirationMs - nowMs <= EXPIRING_SOON_MS) return 'expiring_soon';
  return 'current';
}

/**
 * Decrypts and evaluates subscription grants.
 *
 * **This is the only public decryption entry point.** It NEVER returns raw
 * dates — only `GrantStatus` enums. If decryption fails (wrong key,
 * tampered ciphertext, malformed data), returns empty maps.
 */
export function evaluateSubscriptionGrants(
  encryptedGrants: string,
  decryptionKey: string,
): EvaluatedGrants {
  const empty: EvaluatedGrants = { subscriptions: {}, entitlements: {}, isLifetime: false };

  if (!encryptedGrants || !decryptionKey) return empty;

  const payload = decryptGrants(encryptedGrants, decryptionKey);
  if (!payload) return empty;

  const result: EvaluatedGrants = { subscriptions: {}, entitlements: {}, isLifetime: false };
  const nowMs = Date.now();

  if (payload[LIFETIME_FLAG_KEY] === 1) {
    result.isLifetime = true;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (key === LIFETIME_FLAG_KEY) continue;
    if (typeof value !== 'number') continue;

    const status = evaluateTimestamp(value, nowMs);

    if (TIER_ID_SET.has(key)) {
      (result.subscriptions as Record<string, GrantStatus>)[key] = status;
    } else {
      result.entitlements[key] = status;
    }
  }

  return result;
}

/**
 * Tier or entitlement grant that still describes access for session/UI (`current`
 * or `expiring_soon` grace window).
 */
function grantIsActive(status: GrantStatus): boolean {
  return status === 'current' || status === 'expiring_soon';
}

/**
 * Builds subscription tier and entitlement labels suitable for exposing on
 * `SessionInfo` — only non-expired grants (current or renewing within grace).
 *
 * Prefer this over denormalizing tier arrays on the session Mongo document:
 * ciphertext + cookie key remains authoritative; this derives labels from it.
 */
export function activeLabelsFromEvaluatedGrants(grants: EvaluatedGrants): {
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
} {
  const subscriptions: SubscriptionTierId[] = [];
  const entitlements: string[] = [];

  for (const [tier, st] of Object.entries(grants.subscriptions)) {
    if (st && grantIsActive(st)) {
      subscriptions.push(tier as SubscriptionTierId);
    }
  }
  for (const [ent, st] of Object.entries(grants.entitlements)) {
    if (st && grantIsActive(st)) {
      entitlements.push(ent);
    }
  }

  return { subscriptions, entitlements };
}

// ---------------------------------------------------------------------------
// Convenience: build + encrypt in one call
// ---------------------------------------------------------------------------

/**
 * Builds and encrypts grant data from billing state.
 *
 * @returns `{ ciphertext, key }` ready for session storage and cookie.
 *          Returns `null` if the billing state has no active grants to encode.
 */
export function buildAndEncryptGrants(billing: UserBilling | undefined): {
  ciphertext: string;
  key: string;
} | null {
  if (!billing || (billing.activeSubscriptions.length === 0 && billing.entitlements.length === 0)) {
    return null;
  }
  const payload = buildGrantPayload(billing);
  if (Object.keys(payload).length === 0) return null;
  return encryptGrants(payload);
}

/**
 * Tier grant that still allows retaining the identity session (`current` or
 * `expiring_soon`).
 */
function tierAllowsIdentitySession(status: GrantStatus | undefined): boolean {
  return status !== undefined && grantIsActive(status);
}

/**
 * Checks whether the evaluated grants indicate the user should retain
 * their identity session (at least one of `access` or `insider` is active).
 */
export function hasActiveSubscriptionGrant(grants: EvaluatedGrants): boolean {
  return (
    tierAllowsIdentitySession(grants.subscriptions.access) ||
    tierAllowsIdentitySession(grants.subscriptions.insider)
  );
}
