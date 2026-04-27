/**
 * Split-key encrypted subscription/entitlement grants for identity sessions.
 *
 * At identity login the server builds a grant payload (tier/entitlement ->
 * Unix expiration timestamp), encrypts it with a random AES-256-GCM key,
 * stores the ciphertext on the Mongo session document, and embeds the key
 * in the session cookie. This ensures:
 *
 *   - DB-only compromise cannot read subscription dates.
 *   - Cookie-only compromise cannot read subscription dates.
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_ID_SET: ReadonlySet<string> = new Set(SUBSCRIPTION_TIER_IDS);

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
    }
    // Future: time-limited entitlements would use a real timestamp here.
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Encryption / decryption
// ---------------------------------------------------------------------------

/**
 * Encrypts a grant payload.
 *
 * @returns `{ ciphertext, key }` — ciphertext is base64 (store in Mongo),
 *          key is base64 (embed in the session cookie).
 */
export function encryptGrants(payload: GrantPayload): { ciphertext: string; key: string } {
  const key = randomBytes(SYMMETRIC_KEY_SIZE);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const { ciphertext, nonce } = encryptAES256GCM(key, plaintext);

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
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    return parsed as GrantPayload;
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
  const empty: EvaluatedGrants = { subscriptions: {}, entitlements: {} };

  if (!encryptedGrants || !decryptionKey) return empty;

  const payload = decryptGrants(encryptedGrants, decryptionKey);
  if (!payload) return empty;

  const result: EvaluatedGrants = { subscriptions: {}, entitlements: {} };
  const nowMs = Date.now();

  for (const [key, value] of Object.entries(payload)) {
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
 * Checks whether the evaluated grants indicate the user should retain
 * their identity session (at least one of `access` or `insider` is current).
 */
export function hasActiveSubscriptionGrant(grants: EvaluatedGrants): boolean {
  return grants.subscriptions.access === 'current' || grants.subscriptions.insider === 'current';
}
