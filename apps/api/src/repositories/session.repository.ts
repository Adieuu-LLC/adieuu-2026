/**
 * Session repository
 * Data access layer for session operations with MongoDB persistence and Redis caching
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections, getRedis, isRedisConnected, RedisKeys } from '../db';
import type {
  SessionDocument,
  SessionType,
  CreateSessionInput,
  CreateAccountSessionInput,
  CreateIdentitySessionInput,
  CachedSessionData,
} from '../models/session';
import { toCachedSession } from '../models/session';
import { SESSION_ACCOUNT_TTL_SECONDS, SESSION_IDENTITY_TTL_SECONDS } from '../constants/session';
import elog from '../utils/adieuuLogger';

/**
 * Session repository interface — unified for both account and identity sessions.
 */
export interface ISessionRepository {
  findBySessionId(sessionId: string): Promise<SessionDocument | null>;
  findByUserId(userId: string | ObjectId): Promise<SessionDocument[]>;
  findByIdentityId(identityId: string | ObjectId): Promise<SessionDocument[]>;
  createSession(input: CreateSessionInput): Promise<SessionDocument>;
  /** Sliding renewal: extends expiresAt; returns new expiry or null if session missing/expired. */
  updateLastActivity(sessionId: string): Promise<Date | null>;
  revoke(sessionId: string): Promise<void>;
  revokeAllForUser(userId: string | ObjectId): Promise<number>;
  revokeAllForIdentity(identityId: string | ObjectId): Promise<number>;
  revokeAllForIdentityExcept(identityId: string | ObjectId, excludeSessionId: string): Promise<number>;
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
   * Get session from cache or database.
   * Returns the cached data shape which includes the type discriminator.
   */
  async getSession(sessionId: string): Promise<CachedSessionData | null> {
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
    const session = await this.findOne({ sessionId, revoked: false });

    if (!session) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      return null;
    }

    // Populate cache
    await this.setCache(sessionId, session);

    return toCachedSession(session);
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string | ObjectId): Promise<SessionDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({ userId: objectId, revoked: false });
  }

  /**
   * Create a new session (account or identity type)
   */
  async createSession(input: CreateSessionInput): Promise<SessionDocument> {
    const base = {
      sessionId: input.sessionId,
      type: input.type,
      expiresAt: input.expiresAt,
      lastActivityAt: new Date(),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      revoked: false,
    };

    let doc: Omit<SessionDocument, '_id' | 'createdAt' | 'updatedAt'>;

    if (input.type === 'account') {
      doc = {
        ...base,
        userId: input.userId,
        identifier: input.identifier,
        identifierType: input.identifierType,
      };
    } else {
      const identityInput = input;
      doc = {
        ...base,
        identityId: identityInput.identityId,
        ...(identityInput.maxVideoDurationSeconds !== undefined
          ? { maxVideoDurationSeconds: identityInput.maxVideoDurationSeconds }
          : {}),
        ...(identityInput.encryptedSubscriptionGrants !== undefined
          ? { encryptedSubscriptionGrants: identityInput.encryptedSubscriptionGrants }
          : {}),
        ...(identityInput.absoluteExpiresAt !== undefined
          ? { absoluteExpiresAt: identityInput.absoluteExpiresAt }
          : {}),
      };
    }

    const session = await super.create(doc);

    // Cache the new session
    await this.setCache(input.sessionId, session);

    return session;
  }

  /**
   * Sliding session renewal: bumps lastActivityAt and extends expiresAt by the
   * configured TTL for the session type. Refreshes Redis cache TTL.
   */
  async updateLastActivity(sessionId: string): Promise<Date | null> {
    const session = await this.findOne({ sessionId, revoked: false });
    if (!session) {
      return null;
    }
    if (session.expiresAt < new Date()) {
      await this.invalidateCache(sessionId);
      return null;
    }

    const now = new Date();
    const ttlSeconds =
      session.type === 'identity' ? SESSION_IDENTITY_TTL_SECONDS : SESSION_ACCOUNT_TTL_SECONDS;
    const newExpiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    await this.collection.updateOne(
      { sessionId },
      { $set: { lastActivityAt: now, expiresAt: newExpiresAt, updatedAt: now } }
    );

    const updated: SessionDocument = {
      ...session,
      lastActivityAt: now,
      expiresAt: newExpiresAt,
      updatedAt: now,
    };
    await this.setCache(sessionId, updated);
    return newExpiresAt;
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
   * Find all identity sessions for an identity
   */
  async findByIdentityId(identityId: string | ObjectId): Promise<SessionDocument[]> {
    const objectId = this.toObjectId(identityId);
    return await this.findMany({ type: 'identity', identityId: objectId, revoked: false });
  }

  /**
   * Revoke all identity sessions for an identity
   */
  async revokeAllForIdentity(identityId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(identityId);

    const sessions = await this.findMany({ type: 'identity', identityId: objectId, revoked: false });
    await Promise.all(sessions.map((s) => this.invalidateCache(s.sessionId)));

    const result = await this.collection.updateMany(
      { type: 'identity', identityId: objectId, revoked: false },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    elog.info('All identity sessions revoked', {
      identityId: objectId.toHexString(),
      count: result.modifiedCount,
    });

    return result.modifiedCount;
  }

  /**
   * Revoke all identity sessions except a specific one
   */
  async revokeAllForIdentityExcept(identityId: string | ObjectId, excludeSessionId: string): Promise<number> {
    const objectId = this.toObjectId(identityId);

    const sessions = await this.findMany({
      type: 'identity',
      identityId: objectId,
      revoked: false,
      sessionId: { $ne: excludeSessionId },
    });

    await Promise.all(sessions.map((s) => this.invalidateCache(s.sessionId)));

    const result = await this.collection.updateMany(
      { type: 'identity', identityId: objectId, revoked: false, sessionId: { $ne: excludeSessionId } },
      { $set: { revoked: true, updatedAt: new Date() } }
    );

    return result.modifiedCount;
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
   * Find active (non-revoked, non-expired) account sessions for a user.
   * Used by admin profile view to display current sessions.
   */
  async findActiveByUserId(userId: string | ObjectId): Promise<SessionDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.findMany({
      type: 'account',
      userId: objectId,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });
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
