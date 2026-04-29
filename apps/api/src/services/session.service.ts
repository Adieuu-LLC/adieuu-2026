/**
 * @fileoverview Session Management Service
 *
 * Provides unified session management for both account and identity sessions
 * using HTTP-only cookies with MongoDB as the source of truth and Redis as
 * a cache layer.
 *
 * After the account-identity session separation, a single `adieuu_session`
 * cookie is used for both types. The backing document carries a `type`
 * discriminator ('account' or 'identity').
 *
 * @module services/session
 */

import { ObjectId } from 'mongodb';
import { getSessionRepository } from '../repositories/session.repository';
import { SESSION_ACCOUNT_TTL_SECONDS, SESSION_IDENTITY_TTL_SECONDS } from '../constants/session';
import { generateSecureToken } from '../utils/crypto';
import { config } from '../config';
import elog from '../utils/adieuuLogger';
import type { CachedSessionData } from '../models/session';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS } from '../constants/media-limits';
import type { SubscriptionTierId } from '@adieuu/shared';

/** Session configuration */
const SESSION_CONFIG = {
  cookieName: 'adieuu_session',
  accountTtlSeconds: SESSION_ACCOUNT_TTL_SECONDS,
  identityTtlSeconds: SESSION_IDENTITY_TTL_SECONDS,
  /** Session ID length in bytes (32 bytes = 256 bits) */
  idLength: 32,
} as const;

// ---------------------------------------------------------------------------
// Session data types returned by getSession / guard helpers
// ---------------------------------------------------------------------------

export interface AccountSessionData {
  type: 'account';
  userId: string;
  identifier: string;
  identifierType: 'email' | 'phone';
  lastActivityAt: number;
  /** Unix ms — server-side session expiry after sliding renewal */
  expiresAt: number;
}

/**
 * PRIVACY: `subscriptions`, `entitlements`, and `isLifetime` are intentionally
 * NOT persisted to Mongo. Storing these in plaintext on the session document
 * would allow deanonymisation of aliases via database exposure — the
 * combination of tiers/entitlements can fingerprint a user across identities.
 *
 * The authoritative source for subscription/entitlement data at the identity
 * layer is the encrypted grant blob (split-key: ciphertext in Mongo, key in
 * the cookie). Identity-document admin overrides are read live from Mongo by
 * the middleware on each request. These fields exist on the type to provide
 * defaults from `cachedToSessionData`, but are always empty/false from
 * storage. The middleware never reads them for access decisions.
 */
export interface IdentitySessionData {
  type: 'identity';
  identityId: string;
  /** Effective max video duration (seconds); legacy sessions may omit (use default). */
  maxVideoDurationSeconds: number;
  /** @deprecated Always empty from storage — kept for type compatibility. See PRIVACY note. */
  subscriptions: SubscriptionTierId[];
  /** @deprecated Always empty from storage — kept for type compatibility. See PRIVACY note. */
  entitlements: string[];
  /** @deprecated Always false from storage — kept for type compatibility. See PRIVACY note. */
  isLifetime: boolean;
  /** Encrypted subscription grant blob (base64 ciphertext). */
  encryptedSubscriptionGrants?: string;
  /** 30-day absolute session TTL (Unix ms). */
  absoluteExpiresAt?: number;
  lastActivityAt: number;
  /** Unix ms — server-side session expiry after sliding renewal */
  expiresAt: number;
}

export type SessionData = AccountSessionData | IdentitySessionData;

/** One resolved session load per Request (avoids duplicate touches per request). */
const sessionByRequest = new WeakMap<Request, Promise<SessionData | null>>();

// ---------------------------------------------------------------------------
// Create sessions
// ---------------------------------------------------------------------------

/**
 * Creates a new account session.
 */
export async function createAccountSession(
  userId: ObjectId,
  identifier: string,
  identifierType: 'email' | 'phone',
  metadata?: { userAgent?: string; ipAddress?: string },
): Promise<{ sessionId: string; cookie: string }> {
  const sessionId = generateSecureToken(SESSION_CONFIG.idLength);
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.accountTtlSeconds * 1000);

  const sessionRepo = getSessionRepository();

  await sessionRepo.createSession({
    sessionId,
    type: 'account',
    userId,
    identifier,
    identifierType,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  elog.info('Account session created', {
    identifierType,
    expiresInSeconds: SESSION_CONFIG.accountTtlSeconds,
  });

  const cookie = buildSessionCookie(sessionId, SESSION_CONFIG.accountTtlSeconds);
  return { sessionId, cookie };
}

/** 30 days in milliseconds — absolute identity session TTL. */
const IDENTITY_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Creates a new identity session.
 *
 * When `encryptedSubscriptionGrants` is provided, the decryption key is
 * embedded in the cookie value as `sessionId.base64Key`. The ciphertext
 * is stored in the Mongo session document.
 */
export async function createIdentitySession(
  identityId: ObjectId,
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    /** From verified account bridging token; stored on the identity session only. */
    maxVideoDurationSeconds?: number;
    subscriptions?: SubscriptionTierId[];
    entitlements?: string[];
    isLifetime?: boolean;
    /** Base64-encoded ciphertext for subscription grant blob. */
    encryptedSubscriptionGrants?: string;
    /** Base64-encoded AES-256-GCM key for the grant blob (goes into the cookie). */
    grantDecryptionKey?: string;
  },
): Promise<{ sessionId: string; cookie: string }> {
  const sessionId = generateSecureToken(SESSION_CONFIG.idLength);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_CONFIG.identityTtlSeconds * 1000);
  const absoluteExpiresAt = new Date(now + IDENTITY_ABSOLUTE_TTL_MS);

  const sessionRepo = getSessionRepository();

  await sessionRepo.createSession({
    sessionId,
    type: 'identity',
    identityId,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
    maxVideoDurationSeconds: metadata?.maxVideoDurationSeconds,
    subscriptions: metadata?.subscriptions,
    entitlements: metadata?.entitlements,
    isLifetime: metadata?.isLifetime,
    encryptedSubscriptionGrants: metadata?.encryptedSubscriptionGrants,
    absoluteExpiresAt,
  });

  elog.info('Identity session created', {
    sessionIdPrefix: sessionId.substring(0, 8) + '...',
    identityIdPrefix: identityId.toHexString().substring(0, 8) + '...',
    expiresInSeconds: SESSION_CONFIG.identityTtlSeconds,
    hasEncryptedGrants: !!metadata?.encryptedSubscriptionGrants,
  });

  const cookieValue = metadata?.grantDecryptionKey
    ? `${sessionId}.${metadata.grantDecryptionKey}`
    : sessionId;

  const cookie = buildSessionCookie(cookieValue, SESSION_CONFIG.identityTtlSeconds);
  return { sessionId, cookie };
}

// ---------------------------------------------------------------------------
// Legacy createSession (kept temporarily for callers not yet migrated)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use createAccountSession instead.
 */
export async function createSession(
  userId: ObjectId,
  identifier: string,
  identifierType: 'email' | 'phone',
  metadata?: { userAgent?: string; ipAddress?: string },
): Promise<{ sessionId: string; cookie: string }> {
  return createAccountSession(userId, identifier, identifierType, metadata);
}

// ---------------------------------------------------------------------------
// Retrieve session
// ---------------------------------------------------------------------------

/**
 * Retrieves session data (any type).
 * Checks Redis cache first, falls back to MongoDB.
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId) return null;

  const sessionRepo = getSessionRepository();
  const cached = await sessionRepo.getSession(sessionId);
  if (!cached) return null;

  if (cached.type === 'identity' && cached.absoluteExpiresAt && Date.now() >= cached.absoluteExpiresAt) {
    await destroySession(sessionId);
    return null;
  }

  const newExpiresAt = await sessionRepo.updateLastActivity(sessionId);
  const expiresAtMs = newExpiresAt ? newExpiresAt.getTime() : cached.expiresAt;

  return cachedToSessionData(cached, expiresAtMs);
}

function cachedToSessionData(cached: CachedSessionData, expiresAtMs: number): SessionData | null {
  if (cached.type === 'account') {
    if (!cached.userId || !cached.identifier || !cached.identifierType) return null;
    return {
      type: 'account',
      userId: cached.userId,
      identifier: cached.identifier,
      identifierType: cached.identifierType,
      lastActivityAt: cached.lastActivityAt,
      expiresAt: expiresAtMs,
    };
  }

  if (cached.type === 'identity') {
    if (!cached.identityId) return null;

    const maxVideoDurationSeconds =
      typeof cached.maxVideoDurationSeconds === 'number' &&
      Number.isFinite(cached.maxVideoDurationSeconds) &&
      cached.maxVideoDurationSeconds >= 1
        ? Math.floor(cached.maxVideoDurationSeconds)
        : DEFAULT_MAX_VIDEO_DURATION_SECONDS;
    return {
      type: 'identity',
      identityId: cached.identityId,
      maxVideoDurationSeconds,
      subscriptions: cached.subscriptions ?? [],
      entitlements: cached.entitlements ?? [],
      isLifetime: cached.isLifetime ?? false,
      encryptedSubscriptionGrants: cached.encryptedSubscriptionGrants,
      absoluteExpiresAt: cached.absoluteExpiresAt,
      lastActivityAt: cached.lastActivityAt,
      expiresAt: expiresAtMs,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Destroy sessions
// ---------------------------------------------------------------------------

export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  const sessionRepo = getSessionRepository();
  await sessionRepo.revoke(sessionId);
}

export async function destroyAllSessions(userId: string | ObjectId): Promise<number> {
  const sessionRepo = getSessionRepository();
  return await sessionRepo.revokeAllForUser(userId);
}

export async function destroyAllIdentitySessions(identityId: string | ObjectId): Promise<number> {
  const sessionRepo = getSessionRepository();
  return await sessionRepo.revokeAllForIdentity(identityId);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export function buildSessionCookie(sessionId: string, maxAge: number): string {
  const isProduction = config.env === 'production';
  const parts = [
    `${SESSION_CONFIG.cookieName}=${sessionId}`,
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

export function buildLogoutCookie(): string {
  const parts = [
    `${SESSION_CONFIG.cookieName}=`,
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

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

/**
 * Parses the raw cookie value into `{ sessionId, grantKey }`.
 *
 * Cookie format is either `sessionId` (legacy) or `sessionId.base64Key`
 * (identity sessions with encrypted grants). Only splits on the first `.`.
 */
export function parseSessionCookie(rawValue: string): { sessionId: string; grantKey: string | null } {
  const dotIdx = rawValue.indexOf('.');
  if (dotIdx === -1) return { sessionId: rawValue, grantKey: null };
  return {
    sessionId: rawValue.substring(0, dotIdx),
    grantKey: rawValue.substring(dotIdx + 1) || null,
  };
}

export function getSessionIdFromRequest(request: Request): string | null {
  const raw = getRawSessionCookie(request);
  if (!raw) return null;
  return parseSessionCookie(raw).sessionId;
}

/**
 * Returns the grant decryption key from the cookie, if present.
 */
export function getGrantKeyFromRequest(request: Request): string | null {
  const raw = getRawSessionCookie(request);
  if (!raw) return null;
  return parseSessionCookie(raw).grantKey;
}

function getRawSessionCookie(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce(
    (acc, cookie) => {
      const trimmed = cookie.trim();
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) return acc;
      const key = trimmed.substring(0, eqIdx);
      const value = trimmed.substring(eqIdx + 1);
      if (key && value) acc[key] = value;
      return acc;
    },
    {} as Record<string, string>,
  );

  return cookies[SESSION_CONFIG.cookieName] ?? null;
}

/**
 * Gets any session from request cookies.
 * Deduplicates within a single Request so handlers and middleware share one touch.
 */
export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const existing = sessionByRequest.get(request);
  if (existing) return existing;

  const promise = (async (): Promise<SessionData | null> => {
    const sessionId = getSessionIdFromRequest(request);
    if (!sessionId) return null;
    return getSession(sessionId);
  })();

  sessionByRequest.set(request, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Type guards — enforce expected session type at route level
// ---------------------------------------------------------------------------

/**
 * Requires an account-type session from the request.
 * Returns the session data or null if absent/wrong type.
 */
export async function requireAccountSession(request: Request): Promise<AccountSessionData | null> {
  const session = await getSessionFromRequest(request);
  if (!session || session.type !== 'account') return null;
  return session;
}

/**
 * Requires an identity-type session from the request.
 * Returns the session data or null if absent/wrong type.
 */
export async function requireIdentitySession(request: Request): Promise<IdentitySessionData | null> {
  const session = await getSessionFromRequest(request);
  if (!session || session.type !== 'identity') return null;
  return session;
}

// Re-export config for consumers that need cookie name / TTL
export { SESSION_CONFIG };
