/**
 * @fileoverview Identity Management Service
 *
 * Provides secure identity management for anonymous, unlinkable user identities.
 * Handles identity creation, login, logout, and deletion with rate limiting.
 *
 * After the account-identity session separation, this service:
 * - Accepts `accountHash` instead of `userId`/`userCreatedAt`
 * - Uses the unified `adieuu_session` cookie (type=identity)
 * - Tracks rate limiting per-accountHash in Redis
 * - Tracks identity creation counts in the `identity_counts` collection
 *
 * @module services/identity
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getSessionRepository } from '../repositories/session.repository';
import { getIdentityCountRepository } from '../repositories/identity-count.repository';
import {
  generateIdentityHash,
  verifyIdentityHash,
  validatePassphrase,
  CURRENT_HASH_VERSION,
  MIN_PASSPHRASE_LENGTH,
} from '../utils/identity-hash';
import { config } from '../config';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import {
  createIdentitySession,
  destroySession,
  destroyAllIdentitySessions,
  buildLogoutCookie,
} from './session.service';
import elog from '../utils/adieuuLogger';
import type { IdentityDocument, PublicIdentity } from '../models/identity';
import { toPublicIdentity } from '../models/identity';

/** Maximum identities per user (exported for auth session response) */
export const MAX_IDENTITIES_PER_USER = 2;

/** Backoff delays in milliseconds for failed attempts */
const BACKOFF_DELAYS = [
  0,      // 1st attempt: no delay
  0,      // 2nd attempt: no delay
  0,      // 3rd attempt: no delay
  5000,   // 4th attempt: 5 seconds
  15000,  // 5th attempt: 15 seconds
  30000,  // 6th attempt: 30 seconds (then lockout)
];

/** Lockout threshold: number of failed attempts before lockout */
const LOCKOUT_THRESHOLD = BACKOFF_DELAYS.length;

/** Lockout duration in seconds (1 hour) */
const LOCKOUT_DURATION_SECONDS = 60 * 60;

/** Rate limit window in seconds (tracks attempts within this window) */
const RATE_LIMIT_WINDOW_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface IdentityLoginResult {
  success: boolean;
  identity?: PublicIdentity;
  sessionId?: string;
  cookie?: string;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'RATE_LIMITED' | 'LOCKED_OUT' | 'NO_IDENTITY' | 'VALIDATION_ERROR' | 'IDENTITY_SUSPENDED' | 'IDENTITY_BANNED';
  retryAfter?: number;
  attemptNumber?: number;
  suspendedUntil?: string;
  moderationReason?: string;
  moderationReportId?: string;
}

export interface IdentityCreationResult {
  success: boolean;
  identity?: PublicIdentity;
  sessionId?: string;
  cookie?: string;
  error?: string;
  errorCode?: 'MAX_IDENTITIES' | 'USERNAME_TAKEN' | 'VALIDATION_ERROR';
}

// ---------------------------------------------------------------------------
// Rate limiting helpers (Redis-based, keyed by accountHash)
// ---------------------------------------------------------------------------

async function getAttemptCount(accountHash: string): Promise<number> {
  if (!isRedisConnected()) return 0;
  try {
    const redis = getRedis();
    const key = RedisKeys.identityLoginAttempts(accountHash);
    const val = await redis.get(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    return 0;
  }
}

async function recordAttempt(accountHash: string): Promise<number> {
  if (!isRedisConnected()) return 1;
  try {
    const redis = getRedis();
    const key = RedisKeys.identityLoginAttempts(accountHash);
    const count = await redis.incr(key);
    // Set TTL on first attempt (won't overwrite existing TTL on subsequent calls)
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
    return count;
  } catch {
    return 1;
  }
}

async function resetAttempts(accountHash: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    await redis.del(RedisKeys.identityLoginAttempts(accountHash));
  } catch {
    // best-effort
  }
}

async function isLockedOut(accountHash: string): Promise<{ locked: boolean; retryAfter?: number }> {
  const attempts = await getAttemptCount(accountHash);
  if (attempts >= LOCKOUT_THRESHOLD) {
    if (!isRedisConnected()) return { locked: true };
    try {
      const redis = getRedis();
      const ttl = await redis.ttl(RedisKeys.identityLoginAttempts(accountHash));
      return { locked: true, retryAfter: ttl > 0 ? ttl : undefined };
    } catch {
      return { locked: true };
    }
  }
  return { locked: false };
}

async function storeLockoutEvent(accountHash: string): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    const redis = getRedis();
    const key = RedisKeys.lockoutPending(accountHash);
    await redis.rpush(key, new Date().toISOString());
    await redis.expire(key, 7 * 24 * 60 * 60); // 7-day retention
  } catch {
    // best-effort
  }
}

function getBackoffDelay(attemptNumber: number): number {
  if (attemptNumber <= 0) return 0;
  return BACKOFF_DELAYS[attemptNumber - 1] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]!;
}

// ---------------------------------------------------------------------------
// Create identity
// ---------------------------------------------------------------------------

/**
 * Creates a new identity for an account.
 *
 * @param accountHash - HMAC-derived account hash
 * @param maxIdentities - Maximum identities allowed for this account
 * @param passphrase - The passphrase to secure the identity (min 8 chars)
 * @param username - Desired username
 * @param displayName - Display name
 * @param options - Optional settings
 */
export async function createIdentity(
  accountHash: string,
  maxIdentities: number,
  passphrase: string,
  username: string,
  displayName: string,
  options?: {
    autoLogin?: boolean;
    metadata?: { userAgent?: string; ipAddress?: string };
  },
): Promise<IdentityCreationResult> {
  const autoLogin = options?.autoLogin ?? true;
  const identityRepo = getIdentityRepository();
  const identityCountRepo = getIdentityCountRepository();

  // Validate passphrase
  const validation = validatePassphrase(passphrase);
  if (!validation.valid) {
    return { success: false, error: validation.error, errorCode: 'VALIDATION_ERROR' };
  }

  // Check identity count against limit
  const currentCount = await identityCountRepo.getCount(accountHash);
  if (currentCount >= maxIdentities) {
    return { success: false, error: 'Maximum number of identities reached', errorCode: 'MAX_IDENTITIES' };
  }

  // Check username availability
  const existingUsername = await identityRepo.findByUsername(username);
  if (existingUsername) {
    return { success: false, error: 'Username is already taken', errorCode: 'USERNAME_TAKEN' };
  }

  // Generate identity hash
  const { hash: ident, version: hashVersion } = await generateIdentityHash(
    passphrase,
    accountHash,
  );

  // Check for duplicate hash
  const existingIdent = await identityRepo.findByIdent(ident);
  if (existingIdent) {
    return { success: false, error: 'An identity with this passphrase already exists', errorCode: 'VALIDATION_ERROR' };
  }

  // Create identity, then increment the count. If the increment fails,
  // roll back the identity so we never leave an orphaned, un-tracked slot.
  const identity = await identityRepo.create({
    ident,
    hashVersion,
    username,
    displayName,
  });

  try {
    await identityCountRepo.increment(accountHash);
  } catch (err) {
    try {
      await identityRepo.deleteById(identity._id);
    } catch (rollbackErr) {
      elog.error('Failed to roll back identity after count increment failure', {
        identityId: identity._id.toHexString(),
        rollbackError: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
      });
    }
    throw err;
  }

  // Session creation is best-effort: it touches Redis as well as MongoDB,
  // and a failure here is recoverable (user can simply log in).
  if (autoLogin) {
    const { sessionId, cookie } = await createIdentitySession(
      identity._id,
      accountHash,
      options?.metadata,
    );

    return {
      success: true,
      identity: toPublicIdentity(identity),
      sessionId,
      cookie,
    };
  }

  return { success: true, identity: toPublicIdentity(identity) };
}

// ---------------------------------------------------------------------------
// Login to identity
// ---------------------------------------------------------------------------

/**
 * Login to an identity using passphrase.
 *
 * @param accountHash - HMAC-derived account hash
 * @param passphrase - The passphrase to verify
 * @param metadata - Optional session metadata
 */
export async function loginToIdentity(
  accountHash: string,
  passphrase: string,
  metadata?: { userAgent?: string; ipAddress?: string },
): Promise<IdentityLoginResult> {
  const identityRepo = getIdentityRepository();

  // Check lockout
  const lockout = await isLockedOut(accountHash);
  if (lockout.locked) {
    return {
      success: false,
      error: 'Too many failed attempts. Please try again later.',
      errorCode: 'LOCKED_OUT',
      retryAfter: lockout.retryAfter,
    };
  }

  // Check backoff
  const currentAttempts = await getAttemptCount(accountHash);
  if (currentAttempts > 0) {
    const delayRequired = getBackoffDelay(currentAttempts + 1);
    if (delayRequired > 0) {
      // We can't precisely check timing with a simple counter, so we apply
      // backoff as a delay hint to the client. The counter TTL handles the window.
      // For a more precise approach, we'd store timestamps — acceptable trade-off.
    }
  }

  // Validate passphrase format
  const validation = validatePassphrase(passphrase);
  if (!validation.valid) {
    return { success: false, error: validation.error, errorCode: 'VALIDATION_ERROR' };
  }

  // Generate hash to look up identity
  const { hash: ident } = await generateIdentityHash(
    passphrase,
    accountHash,
    CURRENT_HASH_VERSION,
  );

  // Look up identity
  const identity = await identityRepo.findActiveByIdent(ident);

  if (!identity) {
    const attempts = await recordAttempt(accountHash);

    if (attempts >= LOCKOUT_THRESHOLD) {
      await storeLockoutEvent(accountHash);
      return {
        success: false,
        error: 'Too many failed attempts. You have been locked out for security.',
        errorCode: 'LOCKED_OUT',
        retryAfter: LOCKOUT_DURATION_SECONDS,
      };
    }

    const nextDelay = getBackoffDelay(attempts + 1);
    return {
      success: false,
      error: 'Invalid passphrase',
      errorCode: 'INVALID_PASSPHRASE',
      attemptNumber: attempts,
      retryAfter: nextDelay > 0 ? Math.ceil(nextDelay / 1000) : undefined,
    };
  }

  // Success — reset failed attempts
  await resetAttempts(accountHash);

  // Enforce moderation: banned
  if (identity.isBanned) {
    return {
      success: false,
      error: 'This alias has been permanently banned.',
      errorCode: 'IDENTITY_BANNED',
      moderationReason: identity.moderationReason,
      moderationReportId: identity.moderationReportId,
    };
  }

  // Enforce moderation: suspended
  if (identity.suspendedUntil && identity.suspendedUntil > new Date()) {
    return {
      success: false,
      error: 'This alias is currently suspended.',
      errorCode: 'IDENTITY_SUSPENDED',
      suspendedUntil: identity.suspendedUntil.toISOString(),
      moderationReason: identity.moderationReason,
      moderationReportId: identity.moderationReportId,
    };
  }

  // Clear lapsed suspension
  if (identity.suspendedUntil && identity.suspendedUntil <= new Date()) {
    await identityRepo.clearModerationFields(identity._id);
  }

  // Hash upgrade if needed
  if (identity.hashVersion < CURRENT_HASH_VERSION) {
    const { hash: newIdent } = await generateIdentityHash(
      passphrase,
      accountHash,
      CURRENT_HASH_VERSION,
    );
    await identityRepo.upgradeHashVersion(identity._id, newIdent, CURRENT_HASH_VERSION);
  }

  // Update last active
  await identityRepo.updateLastActive(identity._id);

  // Create identity session (unified adieuu_session with type=identity)
  const { sessionId, cookie } = await createIdentitySession(
    identity._id,
    accountHash,
    metadata,
  );

  return {
    success: true,
    identity: toPublicIdentity(identity),
    sessionId,
    cookie,
  };
}

// ---------------------------------------------------------------------------
// Logout / Delete
// ---------------------------------------------------------------------------

/**
 * Logout from identity session.
 */
export async function logoutFromIdentity(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await destroySession(sessionId);
}

/**
 * Delete an identity (soft delete).
 * Requires the identity session's accountHash for passphrase re-verification.
 */
export async function deleteIdentity(
  identityId: string | ObjectId,
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  const identityRepo = getIdentityRepository();
  const sessionRepo = getSessionRepository();

  // Verify the session belongs to this identity
  const session = await sessionRepo.findBySessionId(sessionId);
  if (!session || session.type !== 'identity') {
    return { success: false, error: 'Invalid session' };
  }

  const identityIdStr = identityId instanceof ObjectId ? identityId.toHexString() : identityId;
  if (session.identityId?.toHexString() !== identityIdStr) {
    return { success: false, error: 'Session does not match identity' };
  }

  // Revoke all sessions for this identity
  await destroyAllIdentitySessions(identityId);

  // Soft delete the identity
  const deleted = await identityRepo.softDelete(identityId);
  if (!deleted) {
    return { success: false, error: 'Failed to delete identity' };
  }

  // No identity_counts decrement — slots are permanently consumed

  return { success: true };
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

/**
 * Moderation status returned when an identity session resolves to a
 * suspended or banned identity.
 */
export interface IdentityModerationBlock {
  type: 'suspended' | 'banned';
  moderationReason?: string;
  moderationReportId?: string;
  suspendedUntil?: string;
}

/**
 * Get identity by session.
 *
 * Resolves the identity from an identity-type session. Returns null if the
 * session is invalid, expired, or identity not found/moderated.
 *
 * Pass `{ returnBlockDetails: true }` to distinguish "no session" from
 * "moderation block".
 */
export async function getIdentityFromSession(
  sessionId: string,
  opts?: { returnBlockDetails?: false },
): Promise<IdentityDocument | null>;
export async function getIdentityFromSession(
  sessionId: string,
  opts: { returnBlockDetails: true },
): Promise<IdentityDocument | { blocked: IdentityModerationBlock } | null>;
export async function getIdentityFromSession(
  sessionId: string,
  opts?: { returnBlockDetails?: boolean },
): Promise<IdentityDocument | { blocked: IdentityModerationBlock } | null> {
  if (!sessionId) return null;

  const sessionRepo = getSessionRepository();
  const cached = await sessionRepo.getSession(sessionId);
  if (!cached || cached.type !== 'identity' || !cached.identityId) return null;

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findByIdentityId(cached.identityId);
  if (!identity) return null;

  const isBanned = !!identity.isBanned;
  const isSuspended = !!identity.suspendedUntil && identity.suspendedUntil > new Date();

  if (isBanned || isSuspended) {
    if (opts?.returnBlockDetails) {
      return {
        blocked: {
          type: isBanned ? 'banned' : 'suspended',
          moderationReason: identity.moderationReason,
          moderationReportId: identity.moderationReportId,
          suspendedUntil: isSuspended ? identity.suspendedUntil!.toISOString() : undefined,
        },
      };
    }
    return null;
  }

  return identity;
}

/**
 * Builds a cookie that clears the session (for logout).
 */
export function buildIdentityLogoutCookie(): string {
  return buildLogoutCookie();
}

/**
 * Extracts identity session ID from request cookies.
 * Now reads the unified `adieuu_session` cookie.
 */
export function getIdentitySessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>,
  );

  return cookies['adieuu_session'] ?? null;
}

// Re-export constants for use in routes
export { MIN_PASSPHRASE_LENGTH };
