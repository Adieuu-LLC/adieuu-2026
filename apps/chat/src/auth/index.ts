/**
 * Authentication Module for Chat Service
 *
 * Validates identity sessions for WebSocket connections.
 * Supports both cookie-based auth (web) and token-based auth (mobile/cross-domain).
 */

import { getPublisher, isRedisConnected } from '../db/redis';
import { getIdentitySessionsCollection, type IdentitySessionDocument } from '../db/mongo';
import { config } from '../config';
import logger from '../utils/logger';
import type { SessionData } from '../types';

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Redis key for identity session cache (matching API service format)
 */
function sessionCacheKey(sessionId: string): string {
  return `identity_session:${sessionId}`;
}

/**
 * Parses cookies from a cookie header string
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(';');

  for (const pair of pairs) {
    const [name, ...valueParts] = pair.trim().split('=');
    if (name) {
      cookies[name] = valueParts.join('=');
    }
  }

  return cookies;
}

/**
 * Extracts session ID from request
 * Checks both cookies (web) and query params (mobile/cross-domain)
 */
export function extractSessionId(
  cookieHeader: string | null,
  queryString: string
): string | null {
  // Try cookie first (web clients)
  const cookies = parseCookies(cookieHeader);
  const cookieSessionId = cookies['adieuu_identity'];
  if (cookieSessionId) {
    return cookieSessionId;
  }

  // Try query param (mobile/cross-domain)
  const params = new URLSearchParams(queryString);
  const tokenSessionId = params.get('token');
  if (tokenSessionId) {
    return tokenSessionId;
  }

  return null;
}

interface CachedSessionData {
  identityId: string;
  expiresAt: number;
  lastActivityAt: number;
}

/**
 * Gets session from Redis cache
 */
async function getSessionFromCache(sessionId: string): Promise<CachedSessionData | null> {
  if (!isRedisConnected()) {
    return null;
  }

  try {
    const redis = getPublisher();
    const key = sessionCacheKey(sessionId);
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as CachedSessionData;
  } catch (error) {
    logger.warn('Failed to read session from cache', { error });
    return null;
  }
}

/**
 * Sets session in Redis cache
 */
async function setSessionCache(
  sessionId: string,
  session: IdentitySessionDocument
): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  try {
    const redis = getPublisher();
    const key = sessionCacheKey(sessionId);
    const data: CachedSessionData = {
      identityId: session.identityId.toString(),
      expiresAt: session.expiresAt.getTime(),
      lastActivityAt: session.lastActivityAt.getTime(),
    };

    const ttl = Math.max(
      1,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
    );

    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (error) {
    logger.warn('Failed to cache session', { error });
  }
}

/**
 * Validates an identity session and returns session data
 */
export async function validateSession(sessionId: string): Promise<SessionData | null> {
  const start = performance.now();
  const sessionPrefix = sessionId.substring(0, 8) + '...';

  // Try cache first
  const cached = await getSessionFromCache(sessionId);
  if (cached) {
    if (cached.expiresAt < Date.now()) {
      logger.info('Session validation: cache hit but expired', {
        sessionId: sessionPrefix,
        elapsedMs: Math.round(performance.now() - start),
      });
      return null;
    }
    logger.debug('Session validation: cache hit', {
      sessionId: sessionPrefix,
      identityId: cached.identityId.substring(0, 8) + '...',
      elapsedMs: Math.round(performance.now() - start),
    });
    return {
      identityId: cached.identityId,
      expiresAt: cached.expiresAt,
      lastActivityAt: cached.lastActivityAt,
    };
  }

  // Cache miss - query MongoDB
  try {
    const collection = getIdentitySessionsCollection();
    const session = await collection.findOne({
      identitySessionId: sessionId,
      revoked: false,
    });

    const elapsedMs = Math.round(performance.now() - start);

    if (!session) {
      logger.info('Session validation: not found in database', {
        sessionId: sessionPrefix,
        elapsedMs,
      });
      return null;
    }

    if (session.expiresAt < new Date()) {
      logger.info('Session validation: found but expired in database', {
        sessionId: sessionPrefix,
        elapsedMs,
      });
      return null;
    }

    logger.info('Session validation: cache miss, loaded from database', {
      sessionId: sessionPrefix,
      identityId: session.identityId.toString().substring(0, 8) + '...',
      elapsedMs,
    });

    // Populate cache
    await setSessionCache(sessionId, session);

    return {
      identityId: session.identityId.toString(),
      expiresAt: session.expiresAt.getTime(),
      lastActivityAt: session.lastActivityAt.getTime(),
    };
  } catch (error) {
    logger.error('Session validation: database query failed', {
      error,
      sessionId: sessionPrefix,
      elapsedMs: Math.round(performance.now() - start),
    });
    return null;
  }
}
