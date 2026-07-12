/**
 * Identity Count Repository
 *
 * Tracks how many identities have been created per accountHash.
 * Uses a dedicated `identity_counts` collection with a unique index on
 * accountHash. Counts are only incremented (never decremented) — deleted
 * identity slots are permanently consumed.
 */

import type { ClientSession } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';

interface IdentityCountDocument {
  _id: import('mongodb').ObjectId;
  accountHash: string;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

const GLOBAL_SEQUENCE_KEY = '__global_identity_seq__';

export interface IIdentityCountRepository {
  getCount(accountHash: string): Promise<number>;
  increment(accountHash: string, options?: { session?: ClientSession }): Promise<number>;
  incrementGlobalSequence(): Promise<number>;
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
  async increment(accountHash: string, options?: { session?: ClientSession }): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { accountHash },
      {
        $inc: { count: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after', session: options?.session },
    );

    return result?.count ?? 1;
  }

  /**
   * Atomically increments the global identity creation sequence.
   * Returns the new sequence number (monotonic, never decremented).
   */
  async incrementGlobalSequence(): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { accountHash: GLOBAL_SEQUENCE_KEY },
      {
        $inc: { count: 1 },
        $set: { updatedAt: new Date() },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result?.count ?? 1;
  }

  /**
   * Seeds the global sequence counter from an external count if the
   * counter document does not yet exist. Called once at startup so
   * existing deployments start with an accurate baseline.
   */
  async seedGlobalSequenceIfNeeded(currentTotal: number): Promise<void> {
    if (currentTotal <= 0) return;
    await this.collection.updateOne(
      { accountHash: GLOBAL_SEQUENCE_KEY },
      {
        $setOnInsert: {
          count: currentTotal,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
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
