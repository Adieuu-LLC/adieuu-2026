/**
 * @fileoverview Session Management Service
 *
 * Provides secure session management using HTTP-only cookies with MongoDB
 * as the source of truth and Redis as a cache layer.
 *
 * @module services/session
 *
 * Security features:
 * - Sessions stored in MongoDB (source of truth) with Redis cache
 * - HTTP-only cookies prevent XSS token theft
 * - Secure flag ensures HTTPS-only transmission (in production)
 * - SameSite=Lax prevents CSRF attacks
 * - Configurable session expiration
 *
 * @example
 * ```typescript
 * import { createSession, getSession, destroySession } from './services/session.service';
 *
 * // Create session after successful auth
 * const { sessionId, cookie } = await createSession(userId, identifier, identifierType);
 * response.headers.set('Set-Cookie', cookie);
 *
 * // Validate session from request
 * const session = await getSession(sessionId);
 * if (!session) {
 *   return unauthorized();
 * }
 *
 * // Logout
 * await destroySession(sessionId);
 * ```
 */

import { ObjectId } from 'mongodb';
import { getSessionRepository } from '../repositories/session.repository';
import { generateSecureToken } from '../utils/crypto';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/** Session configuration */
const SESSION_CONFIG = {
  /** Session cookie name */
  cookieName: 'adieuu_session',
  /** Session TTL in seconds (7 days) */
  ttlSeconds: 7 * 24 * 60 * 60,
  /** Session ID length in bytes (32 bytes = 256 bits) */
  idLength: 32,
} as const;

/**
 * Session data returned from getSession
 */
export interface SessionData {
  /** User ID */
  userId: string;
  /** User identifier (email or phone) for display purposes */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** Session creation timestamp */
  createdAt?: number;
  /** Last activity timestamp */
  lastActivityAt: number;
}

/**
 * Creates a new session and returns the session ID and cookie header value.
 *
 * @param userId - The user's MongoDB ObjectId
 * @param identifier - The user's email or phone number
 * @param identifierType - Whether it's an email or phone
 * @param metadata - Optional metadata (userAgent, ipAddress)
 * @returns Session ID and Set-Cookie header value
 */
export async function createSession(
  userId: ObjectId,
  identifier: string,
  identifierType: 'email' | 'phone',
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<{ sessionId: string; cookie: string }> {
  const sessionId = generateSecureToken(SESSION_CONFIG.idLength);
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.ttlSeconds * 1000);

  const sessionRepo = getSessionRepository();

  await sessionRepo.create({
    sessionId,
    userId,
    identifier,
    identifierType,
    expiresAt,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  });

  elog.info('Session created', {
    identifierType,
    expiresInSeconds: SESSION_CONFIG.ttlSeconds,
  });

  // Build cookie
  const cookie = buildSessionCookie(sessionId, SESSION_CONFIG.ttlSeconds);

  return { sessionId, cookie };
}

/**
 * Retrieves session data.
 * Checks Redis cache first, falls back to MongoDB.
 *
 * @param sessionId - The session ID from the cookie
 * @returns Session data if valid, null if expired or not found
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId) {
    return null;
  }

  const sessionRepo = getSessionRepository();
  const session = await sessionRepo.getSession(sessionId);

  if (!session) {
    return null;
  }

  // Update last activity (fire and forget)
  sessionRepo.updateLastActivity(sessionId).catch(() => {
    // Ignore errors on activity update
  });

  return {
    userId: session.userId,
    identifier: session.identifier,
    identifierType: session.identifierType,
    lastActivityAt: session.lastActivityAt,
  };
}

/**
 * Destroys a session (logout).
 *
 * @param sessionId - The session ID to destroy
 */
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId) {
    return;
  }

  const sessionRepo = getSessionRepository();
  await sessionRepo.revoke(sessionId);
}

/**
 * Destroys all sessions for a user (logout all devices).
 *
 * @param userId - The user's MongoDB ObjectId
 * @returns Number of sessions revoked
 */
export async function destroyAllSessions(userId: string | ObjectId): Promise<number> {
  const sessionRepo = getSessionRepository();
  return await sessionRepo.revokeAllForUser(userId);
}

/**
 * Builds an HTTP-only session cookie.
 *
 * @param sessionId - The session ID value
 * @param maxAge - Cookie max age in seconds
 * @returns Cookie header value
 */
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

/**
 * Builds a cookie that clears the session (for logout).
 *
 * @returns Set-Cookie header value that expires the session cookie
 */
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

/**
 * Extracts session ID from request cookies.
 *
 * @param request - The incoming request
 * @returns Session ID if present, null otherwise
 */
export function getSessionIdFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) {
    return null;
  }

  // Parse cookies
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

  return cookies[SESSION_CONFIG.cookieName] ?? null;
}

/**
 * Gets session from request cookies.
 *
 * @param request - The incoming request
 * @returns Session data if valid, null otherwise
 */
export async function getSessionFromRequest(request: Request): Promise<SessionData | null> {
  const sessionId = getSessionIdFromRequest(request);
  if (!sessionId) {
    return null;
  }
  return getSession(sessionId);
}
