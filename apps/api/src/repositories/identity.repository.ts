/**
 * Identity repository
 * Data access layer for identity operations with MongoDB persistence
 *
 * SECURITY NOTE: Identities are intentionally unlinkable to Users.
 * Never store or log any relationship between User and Identity.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  IdentityDocument,
  CreateIdentityInput,
  UpdateIdentityInput,
} from '../models/identity';
import { DELETED_IDENT } from '../models/identity';
import { withUpdatedAt } from '../models/base';
import elog from '../utils/adieuuLogger';
import { sanitizeString } from '../utils';

/**
 * Search configuration defaults
 */
export const IDENTITY_SEARCH_DEFAULTS = {
  MIN_QUERY_LENGTH: 2,
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 50,
} as const;

/**
 * Identity repository interface
 */
export interface IIdentityRepository {
  findByIdentityId(id: string | ObjectId): Promise<IdentityDocument | null>;
  findByIdent(ident: string): Promise<IdentityDocument | null>;
  findActiveByIdent(ident: string): Promise<IdentityDocument | null>;
  findByUsername(username: string): Promise<IdentityDocument | null>;
  search(query: string, limit?: number, excludeIds?: ObjectId[]): Promise<IdentityDocument[]>;
  create(input: CreateIdentityInput): Promise<IdentityDocument>;
  updateByIdent(ident: string, update: UpdateIdentityInput): Promise<IdentityDocument | null>;
  softDelete(identityId: string | ObjectId): Promise<boolean>;
  upgradeHashVersion(identityId: string | ObjectId, newIdent: string, newVersion: number): Promise<boolean>;
}

/**
 * Identity repository implementation
 */
export class IdentityRepository
  extends BaseRepository<IdentityDocument>
  implements IIdentityRepository {
  constructor() {
    super(Collections.IDENTITIES);
  }

  /**
   * Find identity by its MongoDB _id
   */
  async findByIdentityId(id: string | ObjectId): Promise<IdentityDocument | null> {
    return await this.findById(id);
  }

  /**
   * Find identity by ident string (includes deleted identities)
   */
  async findByIdent(ident: string): Promise<IdentityDocument | null> {
    return await this.findOne({ ident });
  }

  /**
   * Find active (non-deleted) identity by ident string
   */
  async findActiveByIdent(ident: string): Promise<IdentityDocument | null> {
    // Deleted identities have ident set to 'deleted', so this naturally excludes them
    if (ident === DELETED_IDENT) {
      return null;
    }
    return await this.findOne({ ident });
  }

  /**
   * Find identity by username
   */
  async findByUsername(username: string): Promise<IdentityDocument | null> {
    return await this.findOne({ username });
  }

  /**
   * Search identities by username or displayName.
   * Case-insensitive partial matching.
   * Excludes deleted identities and optionally excludes specific identity IDs.
   *
   * @param query - Search query (must be at least MIN_QUERY_LENGTH characters)
   * @param limit - Maximum number of results (default: DEFAULT_LIMIT, max: MAX_LIMIT)
   * @param excludeIds - Optional array of identity IDs to exclude from results (e.g., blocked identities)
   * @returns Array of matching identity documents
   */
  async search(
    query: string,
    limit: number = IDENTITY_SEARCH_DEFAULTS.DEFAULT_LIMIT,
    excludeIds?: ObjectId[]
  ): Promise<IdentityDocument[]> {
    if (query.length < IDENTITY_SEARCH_DEFAULTS.MIN_QUERY_LENGTH) {
      return [];
    }

    const effectiveLimit = Math.min(
      Math.max(1, limit),
      IDENTITY_SEARCH_DEFAULTS.MAX_LIMIT
    );

    // Escape special regex characters to prevent ReDoS attacks
    const escapedQuery = sanitizeString(query, 'general').value;
    const regex = new RegExp(escapedQuery, 'i');

    // Build filter
    const filter: Record<string, unknown> = {
      ident: { $ne: DELETED_IDENT },
      $or: [
        { username: regex },
        { displayName: regex },
      ],
    };

    // Exclude blocked identities if provided
    if (excludeIds && excludeIds.length > 0) {
      filter._id = { $nin: excludeIds };
    }

    const results = await this.collection
      .find(filter)
      .limit(effectiveLimit)
      .toArray();

    return results as IdentityDocument[];
  }

  /**
   * Create a new identity
   */
  async create(input: CreateIdentityInput): Promise<IdentityDocument> {
    const doc: Omit<IdentityDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      ident: input.ident,
      hashVersion: input.hashVersion,
      username: input.username,
      displayName: input.displayName,
      lastActiveAt: new Date(),
    };

    return await super.create(doc);
  }

  /**
   * Update identity by ident string
   */
  async updateByIdent(
    ident: string,
    update: UpdateIdentityInput
  ): Promise<IdentityDocument | null> {
    const updateDoc = withUpdatedAt(update);

    const result = await this.collection.findOneAndUpdate(
      { ident },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    return result as IdentityDocument | null;
  }

  /**
   * Soft delete an identity by setting ident to 'deleted'
   * This preserves the identity record for historical references (chats, posts, etc.)
   * while freeing up the hash for potential reuse and protecting against breach exposure.
   */
  async softDelete(identityId: string | ObjectId): Promise<boolean> {
    const objectId = this.toObjectId(identityId);
    const now = new Date();

    const result = await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          ident: DELETED_IDENT,
          updatedAt: now,
        },
      }
    );

    if (result.modifiedCount === 1) {
      elog.info('Identity soft deleted', { identityId: objectId.toHexString() });
      return true;
    }

    return false;
  }

  /**
   * Update last active timestamp for an identity
   */
  async updateLastActive(identityId: string | ObjectId): Promise<void> {
    const objectId = this.toObjectId(identityId);
    const now = new Date();
    await this.collection.updateOne(
      { _id: objectId },
      { $set: { lastActiveAt: now, updatedAt: now } }
    );
  }

  /**
   * Upgrade the hash version for an identity
   * Used when a user logs in with an old hash version
   */
  async upgradeHashVersion(
    identityId: string | ObjectId,
    newIdent: string,
    newVersion: number
  ): Promise<boolean> {
    const objectId = this.toObjectId(identityId);
    const now = new Date();

    const result = await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          ident: newIdent,
          hashVersion: newVersion,
          updatedAt: now,
        },
      }
    );

    if (result.modifiedCount === 1) {
      elog.info('Identity hash upgraded', {
        identityId: objectId.toHexString(),
        newVersion,
      });
      return true;
    }

    return false;
  }
}

// Singleton instance
let identityRepository: IdentityRepository | null = null;

/**
 * Get the identity repository instance
 */
export function getIdentityRepository(): IdentityRepository {
  if (!identityRepository) {
    identityRepository = new IdentityRepository();
  }
  return identityRepository;
}
