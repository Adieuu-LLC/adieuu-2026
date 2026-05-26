/**
 * Sponsorship repository.
 *
 * Manages sponsorship request directory entries and sponsorship audit logs.
 */

import type { ObjectId, Filter, Sort } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type {
  SponsorshipRequestDocument,
  SponsorshipRequestStatus,
  SponsorshipLogDocument,
} from '../models/sponsorship';
import type { PurchasableProductId } from '@adieuu/shared';

// ---------------------------------------------------------------------------
// Sponsorship Request Repository
// ---------------------------------------------------------------------------

export class SponsorshipRequestRepository extends BaseRepository<SponsorshipRequestDocument> {
  constructor() {
    super(Collections.SPONSORSHIP_REQUESTS);
  }

  async findByUserId(userId: ObjectId): Promise<SponsorshipRequestDocument | null> {
    return this.findOne({ userId } as Filter<SponsorshipRequestDocument>);
  }

  async findActiveByUserId(userId: ObjectId): Promise<SponsorshipRequestDocument | null> {
    return this.findOne({
      userId,
      status: 'active',
    } as Filter<SponsorshipRequestDocument>);
  }

  async findActiveDirectory(
    cursor?: Date,
    limit = 20,
  ): Promise<SponsorshipRequestDocument[]> {
    const filter: Filter<SponsorshipRequestDocument> = { status: 'active' };
    if (cursor) {
      (filter as Record<string, unknown>).createdAt = { $lt: cursor };
    }
    return this.collection
      .find(filter)
      .sort({ createdAt: -1 } as Sort)
      .limit(limit)
      .toArray();
  }

  async createRequest(
    input: Omit<SponsorshipRequestDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SponsorshipRequestDocument> {
    return this.create(input);
  }

  async withdraw(userId: ObjectId): Promise<boolean> {
    const result = await this.collection.updateOne(
      { userId, status: 'active' } as Filter<SponsorshipRequestDocument>,
      { $set: { status: 'withdrawn' as SponsorshipRequestStatus, updatedAt: new Date() } },
    );
    return result.modifiedCount === 1;
  }

  async fulfill(
    requestId: ObjectId,
    data: {
      sponsorUserId: ObjectId;
      sponsorRevealed: boolean;
      sponsorFirstName?: string;
      sponsorLastInitial?: string;
      fulfilledProduct: PurchasableProductId;
      stripeSessionId: string;
    },
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: requestId, status: 'active' } as Filter<SponsorshipRequestDocument>,
      {
        $set: {
          status: 'fulfilled' as SponsorshipRequestStatus,
          sponsorUserId: data.sponsorUserId,
          sponsorRevealed: data.sponsorRevealed,
          sponsorFirstName: data.sponsorRevealed ? data.sponsorFirstName : undefined,
          sponsorLastInitial: data.sponsorRevealed ? data.sponsorLastInitial : undefined,
          fulfilledProduct: data.fulfilledProduct,
          fulfilledAt: new Date(),
          stripeSessionId: data.stripeSessionId,
          updatedAt: new Date(),
        },
      },
    );
    return result.modifiedCount === 1;
  }
}

// ---------------------------------------------------------------------------
// Sponsorship Log Repository
// ---------------------------------------------------------------------------

export class SponsorshipLogRepository extends BaseRepository<SponsorshipLogDocument> {
  constructor() {
    super(Collections.SPONSORSHIP_LOGS);
  }

  async createLog(
    input: Omit<SponsorshipLogDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<SponsorshipLogDocument> {
    return this.create(input);
  }

  async findByRecipient(recipientUserId: ObjectId): Promise<SponsorshipLogDocument[]> {
    return this.collection
      .find({ recipientUserId } as Filter<SponsorshipLogDocument>)
      .sort({ grantedAt: -1 })
      .toArray();
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

let requestRepo: SponsorshipRequestRepository | null = null;
let logRepo: SponsorshipLogRepository | null = null;

export function getSponsorshipRequestRepository(): SponsorshipRequestRepository {
  if (!requestRepo) {
    requestRepo = new SponsorshipRequestRepository();
  }
  return requestRepo;
}

export function getSponsorshipLogRepository(): SponsorshipLogRepository {
  if (!logRepo) {
    logRepo = new SponsorshipLogRepository();
  }
  return logRepo;
}
