/**
 * User repository
 * Data access layer for user operations
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { UserDocument, CreateUserInput, UpdateUserInput, UserGeo, UserBilling, UserAgeVerification } from '../models/user';
import { DEFAULT_IDENTITY_LOCKOUT_DURATION } from '../models/user';
import { withTimestamps } from '../models/base';

/**
 * User repository interface
 */
export interface IUserRepository {
  findById(id: string | ObjectId): Promise<UserDocument | null>;
  findByEmail(email: string): Promise<UserDocument | null>;
  findByPhone(phone: string): Promise<UserDocument | null>;
  findByIdentifier(identifier: string): Promise<UserDocument | null>;
  create(input: CreateUserInput): Promise<UserDocument>;
  updateById(id: string | ObjectId, update: UpdateUserInput): Promise<UserDocument | null>;
  incrementFailedAttempts(id: string | ObjectId): Promise<void>;
  resetFailedAttempts(id: string | ObjectId): Promise<void>;
  lockAccount(id: string | ObjectId, until: Date): Promise<void>;
  unlockAccount(id: string | ObjectId): Promise<void>;
  recordLogin(id: string | ObjectId): Promise<void>;
  updateGeo(id: string | ObjectId, geo: UserGeo): Promise<void>;
  updateStripeCustomerId(id: string | ObjectId, stripeCustomerId: string): Promise<void>;
  updateBilling(id: string | ObjectId, billing: UserBilling): Promise<void>;
  updateAgeVerification(id: string | ObjectId, ageVerification: UserAgeVerification): Promise<void>;
}

/**
 * User repository implementation
 */
export class UserRepository extends BaseRepository<UserDocument> implements IUserRepository {
  constructor() {
    super(Collections.USERS);
  }

  /**
   * Find user by email (case-insensitive)
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return await this.findOne({ email: email.toLowerCase() });
  }

  /**
   * Find user by phone number
   */
  async findByPhone(phone: string): Promise<UserDocument | null> {
    return await this.findOne({ phone });
  }

  /**
   * Find user by email or phone
   * Useful for login where user can provide either
   */
  async findByIdentifier(identifier: string): Promise<UserDocument | null> {
    // Check if it looks like an email
    if (identifier.includes('@')) {
      return await this.findByEmail(identifier);
    }
    // Otherwise treat as phone
    return await this.findByPhone(identifier);
  }

  /**
   * Create a new user
   */
  async create(input: CreateUserInput): Promise<UserDocument> {
    const doc: Omit<UserDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      email: input.email?.toLowerCase(),
      emailVerified: input.emailVerified ?? false,
      phone: input.phone,
      phoneVerified: input.phoneVerified ?? false,
      displayName: input.displayName,
      failedAttempts: 0,
      // Identity-related defaults
      identityCount: 0,
      identityLockoutDuration: DEFAULT_IDENTITY_LOCKOUT_DURATION,
      identityLoginAttempts: [],
    };

    return await super.create(doc);
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $inc: { failedAttempts: 1 },
        $set: { updatedAt: new Date() },
      }
    );
  }

  /**
   * Reset failed login attempts
   */
  async resetFailedAttempts(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          failedAttempts: 0,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Lock account until specified date
   */
  async lockAccount(id: string | ObjectId, until: Date): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          lockedUntil: until,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Unlock account
   */
  async unlockAccount(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: { updatedAt: new Date() },
        $unset: { lockedUntil: '' },
      }
    );
  }

  /**
   * Record successful login
   */
  async recordLogin(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          lastLoginAt: new Date(),
          failedAttempts: 0,
          updatedAt: new Date(),
        },
        $unset: { lockedUntil: '' },
      }
    );
  }

  /**
   * Increment identity count (when user creates an identity)
   */
  async incrementIdentityCount(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $inc: { identityCount: 1 },
        $set: { updatedAt: new Date() },
      }
    );
  }

  /**
   * Record failed identity login attempt
   * Returns the updated list of attempts and whether lockout was triggered
   */
  async recordIdentityLoginAttempt(id: string | ObjectId): Promise<{
    attempts: Date[];
    lockedUntil?: Date;
  }> {
    const objectId = this.toObjectId(id);
    const now = new Date();

    // Get current user to check attempt count
    const user = await this.findById(objectId);
    if (!user) {
      throw new Error('User not found');
    }

    // Add new attempt, keep only last 6
    const attempts = [...(user.identityLoginAttempts || []), now].slice(-6);

    // Check if we should trigger lockout (6 attempts)
    let lockedUntil: Date | undefined;
    if (attempts.length >= 6) {
      // Calculate lockout expiration
      const duration = user.identityLockoutDuration;
      if (duration === -1) {
        // Permanent lockout - set to far future
        lockedUntil = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000);
      } else {
        lockedUntil = new Date(now.getTime() + duration);
      }
    }

    const updateDoc: Record<string, unknown> = {
      identityLoginAttempts: attempts,
      updatedAt: now,
    };
    if (lockedUntil) {
      updateDoc.identityLockedUntil = lockedUntil;
    }

    await this.collection.updateOne(
      { _id: objectId },
      { $set: updateDoc }
    );

    return { attempts, lockedUntil };
  }

  /**
   * Reset identity login attempts (on successful login)
   */
  async resetIdentityLoginAttempts(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          identityLoginAttempts: [],
          updatedAt: new Date(),
        },
        $unset: { identityLockedUntil: '' },
      }
    );
  }

  /**
   * Update identity lockout duration preference
   */
  async updateIdentityLockoutDuration(
    id: string | ObjectId,
    duration: number
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          identityLockoutDuration: duration,
          updatedAt: new Date(),
        },
      }
    );
  }

  /**
   * Check if user is locked out from identity login
   */
  async isIdentityLockedOut(id: string | ObjectId): Promise<{
    lockedOut: boolean;
    lockedUntil?: Date;
  }> {
    const user = await this.findById(id);
    if (!user) {
      return { lockedOut: false };
    }

    if (user.identityLockedUntil && user.identityLockedUntil > new Date()) {
      return { lockedOut: true, lockedUntil: user.identityLockedUntil };
    }

    return { lockedOut: false };
  }

  /**
   * Persist a resolved geo lookup on the user document.
   */
  async updateGeo(id: string | ObjectId, geo: UserGeo): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          geo,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Persist the age verification state on the user document.
   */
  async updateAgeVerification(id: string | ObjectId, ageVerification: UserAgeVerification): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          ageVerification,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Set the Stripe customer ID on the user document.
   */
  async updateStripeCustomerId(id: string | ObjectId, stripeCustomerId: string): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          stripeCustomerId,
          updatedAt: new Date(),
        },
      },
    );
  }

  /**
   * Persist the denormalised billing summary from a Stripe webhook.
   */
  async updateBilling(id: string | ObjectId, billing: UserBilling): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          billing,
          updatedAt: new Date(),
        },
      },
    );
  }
}

// Singleton instance
let userRepository: UserRepository | null = null;

/**
 * Get the user repository instance
 */
export function getUserRepository(): UserRepository {
  if (!userRepository) {
    userRepository = new UserRepository();
  }
  return userRepository;
}
