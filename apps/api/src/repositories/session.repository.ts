/**
 * Session repository
 * Data access layer for session operations with MongoDB persistence and Redis caching
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections, getRedis, isRedisConnected, RedisKeys } from '../db';
import type {
  SessionDocument,
  CreateSessionInput,
  CachedSessionData,
} from '../models/session';
import { toCachedSession } from '../models/session';
import elog from '../utils/adieuuLogger';

/** Session cache TTL in seconds (matches session expiration) */
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Session repository interface
 */
export interface ISessionRepository {
  findBySessionId(sessionId: string): Promise<SessionDocument | null>;
  findByUserId(userId: string | ObjectId): Promise<SessionDocument[]>;
  create(input: CreateSessionInput): Promise<SessionDocument>;
  updateLastActivity(sessionId: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string | ObjectId): Promise<number>;
  deleteExpired(): Promise<number>;
}

/**
 * Session repository implementation
 * Uses MongoDB as source of truth with Redis as cache layer
 */
export class SessionRepository
  extends BaseRepository<SessionDocument>
  implements ISessionRepository
{
  constructor() {
    super(Collections.SESSIONS);
  }

  /**
   * Find session by session ID
   * Always queries MongoDB to get full session document.
   * Uses cache only to quickly detect expired sessions.
   */
  async findBySessionId(sessionId: string): Promise<SessionDocument | null> {
    // Check cache for quick expiration check
    const cached = await this.getFromCache(sessionId);
    if (cached) {
      // Check if expired
      if (cached.expiresAt < Date.now()) {
        await this.invalidateCache(sessionId);
        return null;
      }
    }

    // Query MongoDB for full session document
    const session = await this.findOne({ sessionId, revoked: false });

    if (session) {
      // Check if expired
      if (session.expiresAt < new Date()) {
        return null;
      }

      // Populate/refresh cache
      await this.setCache(sessionId, session);
    }

    return session;
  }

  /**
   * Get session from cache or database
   * Returns cached data if available, otherwise fetches from DB
   */
  async getSession(sessionId: string): Promise<{
    userId: string;
    identifier: string;
    identifierType: 'email' | 'phone';
    expiresAt: number;
    lastActivityAt: number;
  } | null> {
    // Try cache first
    const cached = await this.getFromCache(sessionId);
    if (cached) {
      // Check if expired
      if (cached.expiresAt < Date.now()) {
        await this.invalidateCache(sessionId);
        return null;
      }
      return cached;
    }

    // Cache miss - query MongoDB
    const session = await this.findOne({ sessionId, revoked: false });

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      return null;
    }

    // Populate cache
    await this.setCache(sessionId, session);

    return {
      userId: session.userId.toHexString(),
      identifier: session.identifier,
      identifierType: session.identifierType,
      expiresAt: session.expiresAt.getTime(),
      lastActivityAt: session.lastActivityAt.getTime(),
    };
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string | ObjectId): Promise<SessionDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({ userId: objectId, revoked: false });
  }

  /**
   * Create a new session
   */
  async create(input: CreateSessionInput): Promise<SessionDocument> {
    const doc: Omit<SessionDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      sessionId: input.sessionId,
      userId: input.userId,
      identifier: input.identifier,
      identifierType: input.identifierType,
      expiresAt: input.expiresAt,
      lastActivityAt: new Date(),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      revoked: false,
    };

    const session = await super.create(doc);

    // Cache the new session
    await this.setCache(input.sessionId, session);

    return session;
  }

  /**
   * Update last activity timestamp
   * Updates both MongoDB and cache
   */
  async updateLastActivity(sessionId: string): Promise<void> {
    const now = new Date();

    // Update MongoDB
    await this.collection.updateOne(
      { sessionId },
      { $set: { lastActivityAt: now, updatedAt: now } }
    );

    // Update cache (if exists)
    if (isRedisConnected()) {
      try {
        const redis = getRedis();
        const key = RedisKeys.session(sessionId);
        const cached = await redis.get(key);

        if (cached) {
          const data: CachedSessionData = JSON.parse(cached);
          data.lastActivityAt = now.getTime();
          await redis.set(key, JSON.stringify(data), 'KEEPTTL');
        }
      } catch (error) {
        elog.warn('Failed to update session cache', { error, sessionId });
      }
    }
  }

  /**
   * Revoke a session (logout)
   * Removes from cache and marks as revoked in MongoDB
   */
  async revoke(sessionId: string): Promise<void> {
    // Remove from cache first
    await this.invalidateCache(sessionId);

    // Mark as revoked in MongoDB
    await this.collection.updateOne(
      { sessionId },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    elog.info('Session revoked', { sessionId: sessionId.substring(0, 8) + '...' });
  }

  /**
   * Revoke all sessions for a user (logout all devices)
   */
  async revokeAllForUser(userId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(userId);

    // Find all sessions to invalidate cache
    const sessions = await this.findMany({ userId: objectId, revoked: false });

    // Invalidate all caches
    await Promise.all(
      sessions.map((s) => this.invalidateCache(s.sessionId))
    );

    // Mark all as revoked in MongoDB
    const result = await this.collection.updateMany(
      { userId: objectId, revoked: false },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    elog.info('All sessions revoked for user', {
      userId: objectId.toHexString(),
      count: result.modifiedCount,
    });

    return result.modifiedCount;
  }

  /**
   * Delete expired sessions (cleanup job)
   */
  async deleteExpired(): Promise<number> {
    const result = await this.collection.deleteMany({
      $or: [{ expiresAt: { $lt: new Date() } }, { revoked: true }],
    });

    if (result.deletedCount > 0) {
      elog.info('Cleaned up expired sessions', { count: result.deletedCount });
    }

    return result.deletedCount;
  }

  /**
   * Get session from Redis cache
   */
  private async getFromCache(sessionId: string): Promise<CachedSessionData | null> {
    if (!isRedisConnected()) {
      return null;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.session(sessionId);
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as CachedSessionData;
    } catch (error) {
      elog.warn('Failed to read session from cache', { error });
      return null;
    }
  }

  /**
   * Set session in Redis cache
   */
  private async setCache(
    sessionId: string,
    session: SessionDocument
  ): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.session(sessionId);
      const data = toCachedSession(session);

      // Calculate TTL based on session expiration
      const ttl = Math.max(
        1,
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
      );

      await redis.set(key, JSON.stringify(data), 'EX', ttl);
    } catch (error) {
      elog.warn('Failed to cache session', { error });
    }
  }

  /**
   * Invalidate session cache
   */
  private async invalidateCache(sessionId: string): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.session(sessionId);
      await redis.del(key);
    } catch (error) {
      elog.warn('Failed to invalidate session cache', { error });
    }
  }
}

// Singleton instance
let sessionRepository: SessionRepository | null = null;

/**
 * Get the session repository instance
 */
export function getSessionRepository(): SessionRepository {
  if (!sessionRepository) {
    sessionRepository = new SessionRepository();
  }
  return sessionRepository;
}
