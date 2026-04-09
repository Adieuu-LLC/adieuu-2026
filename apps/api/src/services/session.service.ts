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
import { generateSecureToken } from '../utils/crypto';
import { config } from '../config';
import elog from '../utils/adieuuLogger';
import type { CachedSessionData } from '../models/session';

/** Session configuration */
const SESSION_CONFIG = {
  cookieName: 'adieuu_session',
  /** Account session TTL in seconds (7 days) */
  accountTtlSeconds: 7 * 24 * 60 * 60,
  /** Identity session TTL in seconds (7 days) */
  identityTtlSeconds: 7 * 24 * 60 * 60,
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
}

export interface IdentitySessionData {
  type: 'identity';
  identityId: string;
  accountHash: string;
  lastActivityAt: number;
}

export type SessionData = AccountSessionData | IdentitySessionData;

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

/**
 * Creates a new identity session.
 */
export async function createIdentitySession(
  identityId: ObjectId,
  accountHash: string,
  metadata?: { userAgent?: string; ipAddress?: string },
): Promise<{ sessionId: string; cookie: string }> {
  const sessionId = generateSecureToken(SESSION_CONFIG.idLength);
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.identityTtlSeconds * 1000);

  const sessionRepo = getSessionRepository();

  await sessionRepo.createSession({
    sessionId,
    type: 'identity',
    identityId,
    accountHash,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  elog.info('Identity session created', {
    sessionIdPrefix: sessionId.substring(0, 8) + '...',
    identityIdPrefix: identityId.toHexString().substring(0, 8) + '...',
    expiresInSeconds: SESSION_CONFIG.identityTtlSeconds,
  });

  const cookie = buildSessionCookie(sessionId, SESSION_CONFIG.identityTtlSeconds);
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

  // Fire-and-forget activity update
  sessionRepo.updateLastActivity(sessionId).catch(() => {});

  return cachedToSessionData(cached);
}

function cachedToSessionData(cached: CachedSessionData): SessionData | null {
  if (cached.type === 'account') {
    if (!cached.userId || !cached.identifier || !cached.identifierType) return null;
    return {
      type: 'account',
      userId: cached.userId,
      identifier: cached.identifier,
      identifierType: cached.identifierType,
      lastActivityAt: cached.lastActivityAt,
    };
  }

  if (cached.type === 'identity') {
    if (!cached.identityId || !cached.accountHash) return null;
    return {
      type: 'identity',
      identityId: cached.identityId,
      accountHash: cached.accountHash,
      lastActivityAt: cached.lastActivityAt,
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

function buildSessionCookie(sessionId: string, maxAge: number): string {
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

export function getSessionIdFromRequest(request: Request): string | null {
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

  return cookies[SESSION_CONFIG.cookieName] ?? null;
}

/**
 * Gets any session from request cookies.
 */
export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) return null;
  return getSession(sessionId);
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
