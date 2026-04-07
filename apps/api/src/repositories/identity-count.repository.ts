/**
 * Identity Count Repository
 *
 * Tracks how many identities have been created per accountHash.
 * Uses a dedicated `identity_counts` collection with a unique index on
 * accountHash. Counts are only incremented (never decremented) — deleted
 * identity slots are permanently consumed.
 */

import { BaseRepository } from './base.repository';
import { Collections } from '../db';

interface IdentityCountDocument {
  _id: import('mongodb').ObjectId;
  accountHash: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IIdentityCountRepository {
  getCount(accountHash: string): Promise<number>;
  increment(accountHash: string): Promise<number>;
}

export class IdentityCountRepository
  extends BaseRepository<IdentityCountDocument>
  implements IIdentityCountRepository
{
  constructor() {
    super(Collections.IDENTITY_COUNTS);
  }

  /**
   * Returns the current identity count for an accountHash.
   * Returns 0 if no document exists (account has never created an identity).
   */
  async getCount(accountHash: string): Promise<number> {
    const doc = await this.findOne({ accountHash });
    return doc?.count ?? 0;
  }

  /**
   * Atomically increments the identity count (upsert).
   * Returns the new count after increment.
   */
  async increment(accountHash: string): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { accountHash },
      {
        $inc: { count: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result?.count ?? 1;
  }
}

// Singleton instance
let identityCountRepository: IdentityCountRepository | null = null;

export function getIdentityCountRepository(): IdentityCountRepository {
  if (!identityCountRepository) {
    identityCountRepository = new IdentityCountRepository();
  }
  return identityCountRepository;
}
