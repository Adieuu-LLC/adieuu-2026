/**
 * User repository
 * Data access layer for user operations
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { UserDocument, CreateUserInput, UpdateUserInput } from '../models/user';
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
