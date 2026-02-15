/**
 * @fileoverview Session Management Service
 *
 * Provides secure session management using HTTP-only cookies and Redis storage.
 * Sessions are never exposed to client-side JavaScript.
 *
 * @module services/session
 *
 * Security features:
 * - Sessions stored server-side in Redis (only session ID in cookie)
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
 * const { sessionId, cookie } = await createSession(userId, 'user@example.com');
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

import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { generateSecureToken } from '../utils/crypto';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/** Session configuration */
const SESSION_CONFIG = {
  /** Session cookie name */
  cookieName: 'chadder_session',
  /** Session TTL in seconds (7 days) */
  ttlSeconds: 7 * 24 * 60 * 60,
  /** Session ID length in bytes (32 bytes = 256 bits) */
  idLength: 32,
} as const;

/**
 * Session data stored in Redis
 */
export interface SessionData {
  /** User ID (will be set once we have user accounts) */
  userId?: string;
  /** User identifier (email or phone) for display purposes */
  identifier: string;
  /** Identifier type */
  identifierType: 'email' | 'phone';
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** User agent string for security logging */
  userAgent?: string;
  /** IP address for security logging */
  ipAddress?: string;
}

/**
 * Creates a new session and returns the session ID and cookie header value.
 *
 * @param identifier - The user's email or phone number
 * @param identifierType - Whether it's an email or phone
 * @param metadata - Optional metadata (userAgent, ipAddress)
 * @returns Session ID and Set-Cookie header value
 */
export async function createSession(
  identifier: string,
  identifierType: 'email' | 'phone',
  metadata?: { userAgent?: string; ipAddress?: string }
): Promise<{ sessionId: string; cookie: string }> {
  const sessionId = generateSecureToken(SESSION_CONFIG.idLength);
  const now = Date.now();

  const sessionData: SessionData = {
    identifier,
    identifierType,
    createdAt: now,
    lastActivityAt: now,
    userAgent: metadata?.userAgent,
    ipAddress: metadata?.ipAddress,
  };

  // Store session in Redis if available
  if (isRedisConnected()) {
    const redis = getRedis();
    const key = RedisKeys.session(sessionId);
    await redis.set(key, JSON.stringify(sessionData), 'EX', SESSION_CONFIG.ttlSeconds);
  }

  elog.info('Session created', {
    identifierType,
    expiresInSeconds: SESSION_CONFIG.ttlSeconds,
  });

  // Build cookie
  const cookie = buildSessionCookie(sessionId, SESSION_CONFIG.ttlSeconds);

  return { sessionId, cookie };
}

/**
 * Retrieves session data from Redis.
 *
 * @param sessionId - The session ID from the cookie
 * @returns Session data if valid, null if expired or not found
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId || !isRedisConnected()) {
    return null;
  }

  const redis = getRedis();
  const key = RedisKeys.session(sessionId);
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    const session = JSON.parse(data) as SessionData;

    // Update last activity (fire and forget)
    session.lastActivityAt = Date.now();
    redis.set(key, JSON.stringify(session), 'KEEPTTL').catch(() => {
      // Ignore errors on activity update
    });

    return session;
  } catch {
    return null;
  }
}

/**
 * Destroys a session (logout).
 *
 * @param sessionId - The session ID to destroy
 */
export async function destroySession(sessionId: string): Promise<void> {
  if (!sessionId || !isRedisConnected()) {
    return;
  }

  const redis = getRedis();
  const key = RedisKeys.session(sessionId);
  await redis.del(key);

  elog.info('Session destroyed');
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

  // Only set Secure flag in production (HTTPS)
  if (isProduction) {
    parts.push('Secure');
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
