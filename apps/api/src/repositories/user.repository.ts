/**
 * User repository
 * Data access layer for user operations
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { UserDocument, CreateUserInput, UpdateUserInput, UserGeo, UserBilling, UserAgeVerification, UserCompliance, SubscriptionOverride, PendingAccountEvent } from '../models/user';
import type { AccountModerationCategory } from '@adieuu/shared';
import { DEFAULT_IDENTITY_LOCKOUT_DURATION } from '../models/user';
import { withTimestamps } from '../models/base';
import { sanitizeString } from '../utils';

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
  setStripeCustomerIdIfAbsent(id: string | ObjectId, stripeCustomerId: string): Promise<boolean>;
  findByStripeCustomerId(stripeCustomerId: string): Promise<UserDocument | null>;
  updateBilling(id: string | ObjectId, billing: UserBilling): Promise<void>;
  updateAgeVerification(id: string | ObjectId, ageVerification: UserAgeVerification): Promise<void>;
  updateCompliance(id: string | ObjectId, compliance: UserCompliance): Promise<void>;
  addPendingAccountEvent(id: string | ObjectId, event: PendingAccountEvent): Promise<void>;
  dismissPendingAccountEvent(id: string | ObjectId, eventId: string): Promise<boolean>;
  getPendingAccountEvents(id: string | ObjectId): Promise<PendingAccountEvent[]>;
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
   * Persist compliance attestation state on the user document.
   * Merges per-field so concurrent updates to different compliance keys are not clobbered.
   */
  async updateCompliance(id: string | ObjectId, compliance: UserCompliance): Promise<void> {
    const objectId = this.toObjectId(id);
    const complianceKeys = ['vpnAttestationPending', 'lastVpnAttestation', 'attestedUtahResidency'] as const;
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, ''> = {};

    for (const key of complianceKeys) {
      if (!(key in compliance)) continue;
      const value = compliance[key];
      if (value === undefined) {
        $unset[`compliance.${key}`] = '';
      } else {
        $set[`compliance.${key}`] = value;
      }
    }

    const update: Record<string, Record<string, unknown>> = {};
    if (Object.keys($set).length > 0) {
      update.$set = $set;
    }
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }

    await this.collection.updateOne({ _id: objectId }, update);
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
   * Atomically sets the Stripe customer ID only if one is not already present.
   * Returns true if the write applied, false if the field was already set.
   */
  async setStripeCustomerIdIfAbsent(
    id: string | ObjectId,
    stripeCustomerId: string,
  ): Promise<boolean> {
    const objectId = this.toObjectId(id);
    const result = await this.collection.updateOne(
      { _id: objectId, stripeCustomerId: { $exists: false } },
      {
        $set: {
          stripeCustomerId,
          updatedAt: new Date(),
        },
      },
    );
    return result.modifiedCount === 1;
  }

  /**
   * Find a user by their Stripe customer ID.
   */
  async findByStripeCustomerId(stripeCustomerId: string): Promise<UserDocument | null> {
    return await this.findOne({ stripeCustomerId });
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

  async addSubscriptionOverride(
    id: string | ObjectId,
    override: SubscriptionOverride,
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $push: { subscriptionOverrides: override },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  async removeSubscriptionOverrideAt(
    id: string | ObjectId,
    index: number,
  ): Promise<boolean> {
    const objectId = this.toObjectId(id);
    const user = await this.findById(objectId);
    if (!user) return false;

    const overrides = [...(user.subscriptionOverrides ?? [])];
    if (index < 0 || index >= overrides.length) return false;

    overrides.splice(index, 1);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          subscriptionOverrides: overrides,
          updatedAt: new Date(),
        },
      },
    );
    return true;
  }

  async updateSubscriptionOverrideAt(
    id: string | ObjectId,
    index: number,
    override: SubscriptionOverride,
  ): Promise<boolean> {
    const objectId = this.toObjectId(id);
    const user = await this.findById(objectId);
    if (!user) return false;

    const overrides = [...(user.subscriptionOverrides ?? [])];
    if (index < 0 || index >= overrides.length) return false;

    overrides[index] = override;
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          subscriptionOverrides: overrides,
          updatedAt: new Date(),
        },
      },
    );
    return true;
  }

  async addEntitlementOverride(
    id: string | ObjectId,
    entitlement: string,
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $addToSet: { entitlementOverrides: entitlement },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  async removeEntitlementOverride(
    id: string | ObjectId,
    entitlement: string,
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $pull: { entitlementOverrides: entitlement },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  async incrementSponsorshipCount(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $inc: { sponsorshipCount: 1 },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  /**
   * Search for users by email (case-insensitive substring), phone, or ObjectId.
   * Returns up to `limit` results.
   */
  async searchByIdentifier(query: string, limit = 20): Promise<UserDocument[]> {
    // Try parsing as ObjectId first
    if (ObjectId.isValid(query) && query.length === 24) {
      const doc = await this.findById(new ObjectId(query));
      return doc ? [doc] : [];
    }

    // E.164 phone (starts with +)
    if (query.startsWith('+')) {
      const doc = await this.findByPhone(query);
      return doc ? [doc] : [];
    }

    // Treat as email substring (case-insensitive, literal match — no user-controlled regex)
    const queryLower = sanitizeString(query, 'email').value.toLowerCase();
    if (queryLower.length === 0) {
      return [];
    }

    return await this.collection
      .find({
        email: { $exists: true, $type: 'string' },
        $expr: {
          $gte: [{ $indexOfCP: [{ $toLower: '$email' }, queryLower] }, 0],
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Suspend the account until a given date.
   */
  async suspendAccount(
    id: string | ObjectId,
    opts: {
      suspendedUntil: Date;
      reason: string;
      moderatedBy: string;
      category?: AccountModerationCategory;
    },
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    const $set: Record<string, unknown> = {
      suspendedUntil: opts.suspendedUntil,
      moderationReason: opts.reason,
      moderatedBy: opts.moderatedBy,
      moderatedAt: new Date(),
      updatedAt: new Date(),
    };
    const $unset: Record<string, ''> = {};
    if (opts.category) {
      $set.moderationCategory = opts.category;
    } else {
      $unset.moderationCategory = '';
    }
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set,
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      },
    );
  }

  /**
   * Lift an account suspension.
   */
  async unsuspendAccount(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: { updatedAt: new Date() },
        $unset: {
          suspendedUntil: '',
          moderationReason: '',
          moderationCategory: '',
          moderatedBy: '',
          moderatedAt: '',
        },
      },
    );
  }

  /**
   * Permanently ban an account.
   */
  async banAccount(
    id: string | ObjectId,
    opts: {
      reason: string;
      moderatedBy: string;
      category?: AccountModerationCategory;
      countryCode?: string;
    },
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    const $set: Record<string, unknown> = {
      isBanned: true,
      moderationReason: opts.reason,
      moderatedBy: opts.moderatedBy,
      moderatedAt: new Date(),
      updatedAt: new Date(),
    };
    const $unset: Record<string, ''> = {};
    if (opts.category) {
      $set.moderationCategory = opts.category;
    } else {
      $unset.moderationCategory = '';
    }
    if (opts.countryCode) {
      $set.moderationCountryCode = opts.countryCode.trim().toUpperCase();
    } else {
      $unset.moderationCountryCode = '';
    }
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set,
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      },
    );
  }

  /**
   * Lift a permanent ban.
   */
  async unbanAccount(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: { updatedAt: new Date() },
        $unset: {
          isBanned: '',
          moderationReason: '',
          moderationCategory: '',
          moderationCountryCode: '',
          moderatedBy: '',
          moderatedAt: '',
        },
      },
    );
  }

  /**
   * Count permanently banned accounts, optionally filtered by moderation category.
   */
  async countBannedUsers(category?: AccountModerationCategory): Promise<number> {
    const filter: Record<string, unknown> = { isBanned: true };
    if (category) {
      filter.moderationCategory = category;
    }
    return this.collection.countDocuments(filter);
  }

  /**
   * Admin-approve age verification (bypasses provider).
   */
  async approveAge(id: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          'ageVerification.status': 'verified',
          'ageVerification.verifiedAt': new Date(),
          updatedAt: new Date(),
        },
      },
    );
  }

  async addPendingAccountEvent(
    id: string | ObjectId,
    event: PendingAccountEvent,
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $push: { pendingAccountEvents: event },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  async dismissPendingAccountEvent(
    id: string | ObjectId,
    eventId: string,
  ): Promise<boolean> {
    const objectId = this.toObjectId(id);
    const result = await this.collection.updateOne(
      { _id: objectId },
      {
        $pull: { pendingAccountEvents: { id: eventId } },
        $set: { updatedAt: new Date() },
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    );
    return result.modifiedCount > 0;
  }

  async getPendingAccountEvents(id: string | ObjectId): Promise<PendingAccountEvent[]> {
    const user = await this.findById(id);
    return user?.pendingAccountEvents ?? [];
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
