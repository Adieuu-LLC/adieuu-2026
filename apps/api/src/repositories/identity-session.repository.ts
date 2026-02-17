/**
 * Identity Session repository
 * Data access layer for identity session operations with MongoDB persistence and Redis caching
 *
 * SECURITY NOTE: Identity sessions are intentionally NOT linked to user sessions.
 * This maintains the unlinkability between users and identities.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections, getRedis, isRedisConnected, RedisKeys } from '../db';
import type {
  IdentitySessionDocument,
  CreateIdentitySessionInput,
  CachedIdentitySessionData,
} from '../models/identity-session';
import { toCachedIdentitySession } from '../models/identity-session';
import elog from '../utils/adieuuLogger';

/** Identity session cache TTL in seconds (matches session expiration) */
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Identity session repository interface
 */
export interface IIdentitySessionRepository {
  findBySessionId(sessionId: string): Promise<IdentitySessionDocument | null>;
  findByIdentityId(identityId: string | ObjectId): Promise<IdentitySessionDocument[]>;
  create(input: CreateIdentitySessionInput): Promise<IdentitySessionDocument>;
  updateLastActivity(sessionId: string): Promise<void>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForIdentity(identityId: string | ObjectId): Promise<number>;
  deleteExpired(): Promise<number>;
}

/**
 * Identity session repository implementation
 */
export class IdentitySessionRepository
  extends BaseRepository<IdentitySessionDocument>
  implements IIdentitySessionRepository
{
  constructor() {
    super(Collections.IDENTITY_SESSIONS);
  }

  /**
   * Find identity session by session ID
   */
  async findBySessionId(sessionId: string): Promise<IdentitySessionDocument | null> {
    // Check cache for quick expiration check
    const cached = await this.getFromCache(sessionId);
    if (cached) {
      if (cached.expiresAt < Date.now()) {
        await this.invalidateCache(sessionId);
        return null;
      }
    }

    // Query MongoDB for full session document
    const session = await this.findOne({ identitySessionId: sessionId, revoked: false });

    if (session) {
      if (session.expiresAt < new Date()) {
        return null;
      }
      // Populate/refresh cache
      await this.setCache(sessionId, session);
    }

    return session;
  }

  /**
   * Get identity session from cache or database
   */
  async getSession(sessionId: string): Promise<{
    identityId: string;
    expiresAt: number;
    lastActivityAt: number;
  } | null> {
    // Try cache first
    const cached = await this.getFromCache(sessionId);
    if (cached) {
      if (cached.expiresAt < Date.now()) {
        await this.invalidateCache(sessionId);
        return null;
      }
      return cached;
    }

    // Cache miss - query MongoDB
    const session = await this.findOne({ identitySessionId: sessionId, revoked: false });

    if (!session) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    // Populate cache
    await this.setCache(sessionId, session);

    return {
      identityId: session.identityId.toHexString(),
      expiresAt: session.expiresAt.getTime(),
      lastActivityAt: session.lastActivityAt.getTime(),
    };
  }

  /**
   * Find all sessions for an identity
   */
  async findByIdentityId(identityId: string | ObjectId): Promise<IdentitySessionDocument[]> {
    const objectId = this.toObjectId(identityId);
    return await this.findMany({ identityId: objectId, revoked: false });
  }

  /**
   * Create a new identity session
   */
  async create(input: CreateIdentitySessionInput): Promise<IdentitySessionDocument> {
    const doc: Omit<IdentitySessionDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      identitySessionId: input.identitySessionId,
      identityId: input.identityId,
      expiresAt: input.expiresAt,
      lastActivityAt: new Date(),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      revoked: false,
    };

    const session = await super.create(doc);

    // Cache the new session
    await this.setCache(input.identitySessionId, session);

    return session;
  }

  /**
   * Update last activity timestamp
   * Also extends session expiration (rolling 7-day window)
   */
  async updateLastActivity(sessionId: string): Promise<void> {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + CACHE_TTL_SECONDS * 1000);

    // Update MongoDB
    await this.collection.updateOne(
      { identitySessionId: sessionId },
      { $set: { lastActivityAt: now, expiresAt: newExpiresAt, updatedAt: now } }
    );

    // Update cache (if exists)
    if (isRedisConnected()) {
      try {
        const redis = getRedis();
        const key = RedisKeys.identitySession(sessionId);
        const cached = await redis.get(key);

        if (cached) {
          const data: CachedIdentitySessionData = JSON.parse(cached);
          data.lastActivityAt = now.getTime();
          data.expiresAt = newExpiresAt.getTime();
          await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SECONDS);
        }
      } catch (error) {
        elog.warn('Failed to update identity session cache', { error, sessionId });
      }
    }
  }

  /**
   * Revoke an identity session (logout)
   */
  async revoke(sessionId: string): Promise<void> {
    // Remove from cache first
    await this.invalidateCache(sessionId);

    // Mark as revoked in MongoDB
    await this.collection.updateOne(
      { identitySessionId: sessionId },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    elog.info('Identity session revoked', { sessionId: sessionId.substring(0, 8) + '...' });
  }

  /**
   * Revoke all sessions for an identity
   */
  async revokeAllForIdentity(identityId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(identityId);

    // Find all sessions to invalidate cache
    const sessions = await this.findMany({ identityId: objectId, revoked: false });

    // Invalidate all caches
    await Promise.all(
      sessions.map((s) => this.invalidateCache(s.identitySessionId))
    );

    // Mark all as revoked in MongoDB
    const result = await this.collection.updateMany(
      { identityId: objectId, revoked: false },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    elog.info('All identity sessions revoked', {
      identityId: objectId.toHexString(),
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
      elog.info('Cleaned up expired identity sessions', { count: result.deletedCount });
    }

    return result.deletedCount;
  }

  /**
   * Get identity session from Redis cache
   */
  private async getFromCache(sessionId: string): Promise<CachedIdentitySessionData | null> {
    if (!isRedisConnected()) {
      return null;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.identitySession(sessionId);
      const data = await redis.get(key);

      if (!data) {
        return null;
      }

      return JSON.parse(data) as CachedIdentitySessionData;
    } catch (error) {
      elog.warn('Failed to read identity session from cache', { error });
      return null;
    }
  }

  /**
   * Set identity session in Redis cache
   */
  private async setCache(
    sessionId: string,
    session: IdentitySessionDocument
  ): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.identitySession(sessionId);
      const data = toCachedIdentitySession(session);

      // Calculate TTL based on session expiration
      const ttl = Math.max(
        1,
        Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)
      );

      await redis.set(key, JSON.stringify(data), 'EX', ttl);
    } catch (error) {
      elog.warn('Failed to cache identity session', { error });
    }
  }

  /**
   * Invalidate identity session cache
   */
  private async invalidateCache(sessionId: string): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }

    try {
      const redis = getRedis();
      const key = RedisKeys.identitySession(sessionId);
      await redis.del(key);
    } catch (error) {
      elog.warn('Failed to invalidate identity session cache', { error });
    }
  }
}

// Singleton instance
let identitySessionRepository: IdentitySessionRepository | null = null;

/**
 * Get the identity session repository instance
 */
export function getIdentitySessionRepository(): IdentitySessionRepository {
  if (!identitySessionRepository) {
    identitySessionRepository = new IdentitySessionRepository();
  }
  return identitySessionRepository;
}

