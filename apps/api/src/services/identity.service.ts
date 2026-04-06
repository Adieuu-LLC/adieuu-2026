/**
 * @fileoverview Identity Management Service
 *
 * Provides secure identity management for anonymous, unlinkable user identities.
 * Handles identity creation, login, logout, and deletion with rate limiting.
 *
 * @module services/identity
 *
 * SECURITY ARCHITECTURE:
 * - Identities are cryptographically unlinkable to Users
 * - Hash: SHA3-256(Argon2id(passphrase, salt=userId+createdAt))
 * - Double-hash provides defense-in-depth against PQC and algorithm weaknesses
 * - Rate limiting with progressive backoff prevents brute force attacks
 * - Lockout notifications alert users to potential attack attempts
 *
 * @example
 * ```typescript
 * import {
 *   createIdentity,
 *   loginToIdentity,
 *   logoutFromIdentity,
 *   deleteIdentity,
 * } from './services/identity.service';
 *
 * // Create identity (requires authenticated user session)
 * const result = await createIdentity(userId, userCreatedAt, passphrase, username, displayName);
 *
 * // Login to identity
 * const session = await loginToIdentity(userId, userCreatedAt, passphrase, metadata);
 *
 * // Logout from identity
 * await logoutFromIdentity(identitySessionId);
 * ```
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getIdentitySessionRepository } from '../repositories/identity-session.repository';
import { getUserRepository } from '../repositories/user.repository';
import {
  generateIdentityHash,
  validatePassphrase,
  CURRENT_HASH_VERSION,
  MIN_PASSPHRASE_LENGTH,
} from '../utils/identity-hash';
import { generateSecureToken } from '../utils/crypto';
import { config } from '../config';
import elog from '../utils/adieuuLogger';
import { sendEmail, sendSms } from './messaging';
import type { IdentityDocument, PublicIdentity } from '../models/identity';
import { toPublicIdentity } from '../models/identity';

/** Whether to decrement identity count on deletion (currently disabled) */
const DECREMENT_COUNT_ON_DELETE = false;

/** Maximum identities per user (exported for auth session response) */
export const MAX_IDENTITIES_PER_USER = 2;

/** Identity session configuration */
const IDENTITY_SESSION_CONFIG = {
  /** Cookie name */
  cookieName: 'adieuu_identity',
  /** Session TTL in seconds (7 days) */
  ttlSeconds: 7 * 24 * 60 * 60,
  /** Session ID length in bytes */
  idLength: 32,
} as const;

/** Backoff delays in milliseconds for failed attempts */
const BACKOFF_DELAYS = [
  0,      // 1st attempt: no delay
  0,      // 2nd attempt: no delay
  0,      // 3rd attempt: no delay
  5000,   // 4th attempt: 5 seconds
  15000,  // 5th attempt: 15 seconds
  30000,  // 6th attempt: 30 seconds (then lockout)
];

/**
 * Identity login result
 */
export interface IdentityLoginResult {
  success: boolean;
  identity?: PublicIdentity;
  sessionId?: string;
  cookie?: string;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'RATE_LIMITED' | 'LOCKED_OUT' | 'NO_IDENTITY' | 'VALIDATION_ERROR' | 'IDENTITY_SUSPENDED' | 'IDENTITY_BANNED';
  /** Seconds until next attempt is allowed */
  retryAfter?: number;
  /** Current attempt number (1-6) */
  attemptNumber?: number;
  /** ISO string — when the suspension expires (IDENTITY_SUSPENDED only) */
  suspendedUntil?: string;
  /** Human-readable reason for the moderation action */
  moderationReason?: string;
  /** Report ID for the appeal reference */
  moderationReportId?: string;
}

/**
 * Identity creation result
 */
export interface IdentityCreationResult {
  success: boolean;
  identity?: PublicIdentity;
  /** Session ID (only if auto-login is enabled) */
  sessionId?: string;
  /** Session cookie (only if auto-login is enabled) */
  cookie?: string;
  error?: string;
  errorCode?: 'MAX_IDENTITIES' | 'USERNAME_TAKEN' | 'VALIDATION_ERROR';
}

/**
 * Calculates the backoff delay for a given attempt number
 */
function getBackoffDelay(attemptNumber: number): number {
  if (attemptNumber <= 0) return 0;
  return BACKOFF_DELAYS[attemptNumber - 1] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]!;
}

/**
 * Creates a new identity for a user
 *
 * @param userId - The user's MongoDB ObjectId
 * @param userCreatedAt - The user's createdAt timestamp (for salt)
 * @param passphrase - The passphrase to secure the identity (min 8 chars)
 * @param username - Desired username for the identity
 * @param displayName - Display name for the identity
 * @param options - Optional settings
 * @param options.autoLogin - If true, automatically create an identity session (default: true)
 * @param options.metadata - Session metadata (userAgent, ipAddress) for auto-login
 */
export async function createIdentity(
  userId: string | ObjectId,
  userCreatedAt: Date,
  passphrase: string,
  username: string,
  displayName: string,
  options?: {
    autoLogin?: boolean;
    metadata?: { userAgent?: string; ipAddress?: string };
  }
): Promise<IdentityCreationResult> {
  const autoLogin = options?.autoLogin ?? true;
  const userRepo = getUserRepository();
  const identityRepo = getIdentityRepository();

  // Validate passphrase
  const validation = validatePassphrase(passphrase);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      errorCode: 'VALIDATION_ERROR',
    };
  }

  // Check user's identity count
  const user = await userRepo.findById(userId);
  if (!user) {
    return {
      success: false,
      error: 'User not found',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  if ((user.identityCount ?? 0) >= MAX_IDENTITIES_PER_USER) {
    return {
      success: false,
      error: 'Maximum number of identities reached',
      errorCode: 'MAX_IDENTITIES',
    };
  }

  // Check username availability
  const existingUsername = await identityRepo.findByUsername(username);
  if (existingUsername) {
    return {
      success: false,
      error: 'Username is already taken',
      errorCode: 'USERNAME_TAKEN',
    };
  }

  // Generate identity hash
  const userIdStr = userId instanceof ObjectId ? userId.toHexString() : userId;
  const { hash: ident, version: hashVersion } = await generateIdentityHash(
    passphrase,
    userIdStr,
    userCreatedAt
  );

  // Check if this hash already exists (user might be recreating same identity)
  const existingIdent = await identityRepo.findByIdent(ident);
  if (existingIdent) {
    return {
      success: false,
      error: 'An identity with this passphrase already exists',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  // Create the identity
  const identity = await identityRepo.create({
    ident,
    hashVersion,
    username,
    displayName,
  });

  // Increment user's identity count
  // NOTE: We intentionally do NOT log identity creation to prevent timing correlation
  // that could be used to de-anonymize users
  await userRepo.incrementIdentityCount(userId);

  // Auto-login: create identity session so user can immediately use the identity
  if (autoLogin) {
    const identitySessionRepo = getIdentitySessionRepository();
    const sessionId = generateSecureToken(IDENTITY_SESSION_CONFIG.idLength);
    const expiresAt = new Date(Date.now() + IDENTITY_SESSION_CONFIG.ttlSeconds * 1000);

    await identitySessionRepo.create({
      identitySessionId: sessionId,
      identityId: identity._id,
      expiresAt,
      userAgent: options?.metadata?.userAgent,
      ipAddress: options?.metadata?.ipAddress,
    });

    const cookie = buildIdentitySessionCookie(sessionId, IDENTITY_SESSION_CONFIG.ttlSeconds);

    return {
      success: true,
      identity: toPublicIdentity(identity),
      sessionId,
      cookie,
    };
  }

  return {
    success: true,
    identity: toPublicIdentity(identity),
  };
}

/**
 * Login to an identity using passphrase
 *
 * @param userId - The user's MongoDB ObjectId
 * @param userCreatedAt - The user's createdAt timestamp (for salt)
 * @param passphrase - The passphrase to verify
 * @param metadata - Optional session metadata
 */
export async function loginToIdentity(
  userId: string | ObjectId,
  userCreatedAt: Date,
  passphrase: string,
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<IdentityLoginResult> {
  const userRepo = getUserRepository();
  const identityRepo = getIdentityRepository();
  const identitySessionRepo = getIdentitySessionRepository();

  // Get user and check lockout
  const user = await userRepo.findById(userId);
  if (!user) {
    return {
      success: false,
      error: 'User not found',
      errorCode: 'VALIDATION_ERROR',
    };
  }

  // Check if user is locked out
  const lockoutStatus = await userRepo.isIdentityLockedOut(userId);
  if (lockoutStatus.lockedOut) {
    const retryAfter = lockoutStatus.lockedUntil
      ? Math.ceil((lockoutStatus.lockedUntil.getTime() - Date.now()) / 1000)
      : 0;

    return {
      success: false,
      error: 'Too many failed attempts. Please try again later.',
      errorCode: 'LOCKED_OUT',
      retryAfter: retryAfter > 0 ? retryAfter : undefined,
    };
  }

  // Check backoff based on current attempt count
  const currentAttempts = user.identityLoginAttempts?.length ?? 0;
  if (currentAttempts > 0) {
    const lastAttempt = user.identityLoginAttempts?.[currentAttempts - 1];
    if (lastAttempt) {
      const delayRequired = getBackoffDelay(currentAttempts + 1);
      const timeSinceLastAttempt = Date.now() - lastAttempt.getTime();

      if (timeSinceLastAttempt < delayRequired) {
        const retryAfter = Math.ceil((delayRequired - timeSinceLastAttempt) / 1000);
        return {
          success: false,
          error: `Please wait ${retryAfter} seconds before trying again`,
          errorCode: 'RATE_LIMITED',
          retryAfter,
          attemptNumber: currentAttempts,
        };
      }
    }
  }

  // Validate passphrase format
  const validation = validatePassphrase(passphrase);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      errorCode: 'VALIDATION_ERROR',
    };
  }

  // Generate hash to look up identity
  const userIdStr = userId instanceof ObjectId ? userId.toHexString() : userId;

  // Try current hash version first
  const { hash: ident } = await generateIdentityHash(
    passphrase,
    userIdStr,
    userCreatedAt,
    CURRENT_HASH_VERSION
  );

  // Look up identity
  const identity = await identityRepo.findActiveByIdent(ident);

  if (!identity) {
    // Identity not found - record failed attempt for rate limiting only
    // NOTE: We intentionally do NOT create an audit log here to preserve
    // cryptographic separation between identities and user accounts.
    // Any audit logging of identity operations could enable correlation attacks.
    const { attempts, lockedUntil } = await userRepo.recordIdentityLoginAttempt(userId);

    // Check if we just triggered a lockout
    if (lockedUntil) {
      // Send lockout notification
      await sendLockoutNotification(user, attempts);

      return {
        success: false,
        error: 'Too many failed attempts. You have been logged out for security.',
        errorCode: 'LOCKED_OUT',
        retryAfter: Math.ceil((lockedUntil.getTime() - Date.now()) / 1000),
      };
    }

    const nextDelay = getBackoffDelay(attempts.length + 1);
    return {
      success: false,
      error: 'Invalid passphrase',
      errorCode: 'INVALID_PASSPHRASE',
      attemptNumber: attempts.length,
      retryAfter: nextDelay > 0 ? Math.ceil(nextDelay / 1000) : undefined,
    };
  }

  // Success! Reset failed attempts
  await userRepo.resetIdentityLoginAttempts(userId);

  // Enforce moderation: banned identities cannot log in
  if (identity.isBanned) {
    return {
      success: false,
      error: 'This alias has been permanently banned.',
      errorCode: 'IDENTITY_BANNED',
      moderationReason: identity.moderationReason,
      moderationReportId: identity.moderationReportId,
    };
  }

  // Enforce moderation: suspended identities cannot log in until the suspension expires
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

  // Check if hash needs upgrading
  if (identity.hashVersion < CURRENT_HASH_VERSION) {
    const { hash: newIdent } = await generateIdentityHash(
      passphrase,
      userIdStr,
      userCreatedAt,
      CURRENT_HASH_VERSION
    );
    await identityRepo.upgradeHashVersion(identity._id, newIdent, CURRENT_HASH_VERSION);
  }

  // Update last active
  await identityRepo.updateLastActive(identity._id);

  // Create identity session
  const sessionId = generateSecureToken(IDENTITY_SESSION_CONFIG.idLength);
  const expiresAt = new Date(Date.now() + IDENTITY_SESSION_CONFIG.ttlSeconds * 1000);

  await identitySessionRepo.create({
    identitySessionId: sessionId,
    identityId: identity._id,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  // Build cookie
  const cookie = buildIdentitySessionCookie(sessionId, IDENTITY_SESSION_CONFIG.ttlSeconds);

  // NOTE: We intentionally do NOT log successful identity login to prevent timing correlation

  return {
    success: true,
    identity: toPublicIdentity(identity),
    sessionId,
    cookie,
  };
}

/**
 * Logout from identity session
 *
 * @param identitySessionId - The identity session ID to revoke
 */
export async function logoutFromIdentity(identitySessionId: string): Promise<void> {
  if (!identitySessionId) return;

  const identitySessionRepo = getIdentitySessionRepository();
  await identitySessionRepo.revoke(identitySessionId);
}

/**
 * Delete an identity (soft delete)
 *
 * @param identityId - The identity's MongoDB ObjectId
 * @param identitySessionId - The current identity session (for verification)
 */
export async function deleteIdentity(
  identityId: string | ObjectId,
  identitySessionId: string
): Promise<{ success: boolean; error?: string }> {
  const identityRepo = getIdentityRepository();
  const identitySessionRepo = getIdentitySessionRepository();

  // Verify the session belongs to this identity
  const session = await identitySessionRepo.findBySessionId(identitySessionId);
  if (!session) {
    return { success: false, error: 'Invalid session' };
  }

  const identityIdStr = identityId instanceof ObjectId ? identityId.toHexString() : identityId;
  if (session.identityId.toHexString() !== identityIdStr) {
    return { success: false, error: 'Session does not match identity' };
  }

  // Revoke all sessions for this identity
  await identitySessionRepo.revokeAllForIdentity(identityId);

  // Soft delete the identity
  const deleted = await identityRepo.softDelete(identityId);
  if (!deleted) {
    return { success: false, error: 'Failed to delete identity' };
  }

  // NOTE: We do NOT decrement identity count by default (DECREMENT_COUNT_ON_DELETE = false)
  // This prevents abuse of the deletion feature

  return { success: true };
}

/**
 * Get identity session from session ID
 */
export async function getIdentitySession(sessionId: string): Promise<{
  identityId: string;
  expiresAt: number;
  lastActivityAt: number;
} | null> {
  if (!sessionId) return null;

  const identitySessionRepo = getIdentitySessionRepository();
  return await identitySessionRepo.getSession(sessionId);
}

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
 * Returns the identity document, or `null` if the session is invalid /
 * expired / identity not found.
 *
 * When `opts.checkModeration` is true the caller can distinguish between
 * "no session" and "moderation block" via the returned discriminated union.
 */
export async function getIdentityFromSession(
  sessionId: string,
  opts?: { checkModeration?: boolean },
): Promise<IdentityDocument | null>;
export async function getIdentityFromSession(
  sessionId: string,
  opts: { checkModeration: true },
): Promise<IdentityDocument | { blocked: IdentityModerationBlock } | null>;
export async function getIdentityFromSession(
  sessionId: string,
  opts?: { checkModeration?: boolean },
): Promise<IdentityDocument | { blocked: IdentityModerationBlock } | null> {
  const session = await getIdentitySession(sessionId);
  if (!session) return null;

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findByIdentityId(session.identityId);
  if (!identity) return null;

  if (opts?.checkModeration) {
    if (identity.isBanned) {
      return {
        blocked: {
          type: 'banned',
          moderationReason: identity.moderationReason,
          moderationReportId: identity.moderationReportId,
        },
      };
    }

    if (identity.suspendedUntil && identity.suspendedUntil > new Date()) {
      return {
        blocked: {
          type: 'suspended',
          moderationReason: identity.moderationReason,
          moderationReportId: identity.moderationReportId,
          suspendedUntil: identity.suspendedUntil.toISOString(),
        },
      };
    }
  }

  return identity;
}

/**
 * Update identity session last activity (called on each request)
 */
export async function updateIdentitySessionActivity(sessionId: string): Promise<void> {
  if (!sessionId) return;

  const identitySessionRepo = getIdentitySessionRepository();
  await identitySessionRepo.updateLastActivity(sessionId);
}

/**
 * Builds an HTTP-only identity session cookie
 */
function buildIdentitySessionCookie(sessionId: string, maxAge: number): string {
  const isProduction = config.env === 'production';
  const parts = [
    `${IDENTITY_SESSION_CONFIG.cookieName}=${sessionId}`,
    `Max-Age=${maxAge}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (isProduction) {
    parts.push('Secure');
  }

  if (config.cookie.domain) {
    parts.push(`Domain=${config.cookie.domain}`);
  }

  return parts.join('; ');
}

/**
 * Builds a cookie that clears the identity session (for logout)
 */
export function buildIdentityLogoutCookie(): string {
  const parts = [
    `${IDENTITY_SESSION_CONFIG.cookieName}=`,
    'Max-Age=0',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (config.env === 'production') {
    parts.push('Secure');
  }

  if (config.cookie.domain) {
    parts.push(`Domain=${config.cookie.domain}`);
  }

  return parts.join('; ');
}

/**
 * Extracts identity session ID from request cookies
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
    {} as Record<string, string>
  );

  return cookies[IDENTITY_SESSION_CONFIG.cookieName] ?? null;
}

/**
 * Send lockout notification to user via email and/or SMS
 */
async function sendLockoutNotification(
  user: { email?: string; phone?: string },
  attempts: Date[]
): Promise<void> {
  // Format attempt times for the notification
  const attemptTimes = attempts
    .slice(-6)
    .map((d) => d.toISOString())
    .join('\n  - ');

  const subject = 'Security Alert: Identity Login Locked';
  const message = `Your identity login has been locked due to multiple failed attempts.

Last ${attempts.length} attempt times:
  - ${attemptTimes}

If this was not you, please secure your account immediately.

This lockout is temporary and will expire based on your security settings.`;

  // Send email if user has email
  if (user.email) {
    try {
      await sendEmail({
        to: user.email,
        subject,
        text: message,
        html: `<p>${message.replace(/\n/g, '<br>')}</p>`,
      });
    } catch (error) {
      elog.error('Failed to send lockout email', { error });
    }
  }

  // Send SMS if user has phone
  if (user.phone) {
    try {
      await sendSms({
        to: user.phone,
        message: `Security Alert: Your identity login has been locked due to ${attempts.length} failed attempts. Check your email for details.`,
      });
    } catch (error) {
      elog.error('Failed to send lockout SMS', { error });
    }
  }
}

// Re-export constants for use in routes
export { MIN_PASSPHRASE_LENGTH, IDENTITY_SESSION_CONFIG };
