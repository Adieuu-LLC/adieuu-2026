/**
 * Referral code and attribution repository.
 */

import type { ClientSession, Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type { ReferralAttributionDocument, ReferralCodeDocument } from '../models/referral';

const MAX_ACTIVE_CODES_PER_USER = 3;

export class ReferralCodeRepository extends BaseRepository<ReferralCodeDocument> {
  constructor() {
    super(Collections.REFERRAL_CODES);
  }

  async findByCode(code: string): Promise<ReferralCodeDocument | null> {
    return this.findOne({ code } as Filter<ReferralCodeDocument>);
  }

  async findActiveByUserId(userId: ObjectId): Promise<ReferralCodeDocument[]> {
    return this.findMany(
      { userId, isDeleted: false } as Filter<ReferralCodeDocument>,
      MAX_ACTIVE_CODES_PER_USER + 1,
    );
  }

  async countActiveByUserId(userId: ObjectId): Promise<number> {
    return this.count({ userId, isDeleted: false } as Filter<ReferralCodeDocument>);
  }

  async isCodeReserved(code: string): Promise<boolean> {
    const existing = await this.findByCode(code);
    if (existing) return true;

    const inHistory = await this.findOne({
      previousVersions: code,
    } as Filter<ReferralCodeDocument>);
    return !!inHistory;
  }

  async createCode(
    input: Omit<ReferralCodeDocument, '_id' | 'createdAt' | 'updatedAt'>,
    session?: ClientSession,
  ): Promise<ReferralCodeDocument> {
    return this.create(input, session ? { session } : undefined);
  }

  async incrementUseCount(code: string): Promise<ReferralCodeDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { code, isDeleted: false } as Filter<ReferralCodeDocument>,
      {
        $inc: { useCount: 1 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' },
    );
    return result as ReferralCodeDocument | null;
  }

  async incrementSignupCount(
    referralCodeId: ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.collection.updateOne(
      { _id: referralCodeId } as Filter<ReferralCodeDocument>,
      {
        $inc: { signupCount: 1 },
        $set: { updatedAt: new Date() },
      },
      session ? { session } : undefined,
    );
  }

  async incrementSubscriptionCount(
    referralCodeId: ObjectId,
    session?: ClientSession,
  ): Promise<void> {
    await this.collection.updateOne(
      { _id: referralCodeId } as Filter<ReferralCodeDocument>,
      {
        $inc: { subscriptionCount: 1 },
        $set: { updatedAt: new Date() },
      },
      session ? { session } : undefined,
    );
  }

  async updateOwnedCode(
    userId: ObjectId,
    codeId: ObjectId,
    update: Partial<
      Pick<ReferralCodeDocument, 'code' | 'previousVersions' | 'isDeleted' | 'deletedAt'>
    > & { customMessage?: string | null },
    session?: ClientSession,
  ): Promise<ReferralCodeDocument | null> {
    const { customMessage, ...rest } = update;
    const $set: Record<string, unknown> = { ...rest, updatedAt: new Date() };
    const updateDoc: Record<string, unknown> = { $set };

    if (customMessage !== undefined) {
      if (customMessage === null) {
        updateDoc.$unset = { customMessage: '' as const };
      } else {
        $set.customMessage = customMessage;
      }
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: codeId, userId, isDeleted: false } as Filter<ReferralCodeDocument>,
      updateDoc,
      { returnDocument: 'after', session },
    );
    return result as ReferralCodeDocument | null;
  }

  async findOwnedCode(
    userId: ObjectId,
    codeId: ObjectId,
  ): Promise<ReferralCodeDocument | null> {
    return this.findOne({
      _id: codeId,
      userId,
      isDeleted: false,
    } as Filter<ReferralCodeDocument>);
  }
}

export class ReferralAttributionRepository extends BaseRepository<ReferralAttributionDocument> {
  constructor() {
    super(Collections.REFERRAL_ATTRIBUTIONS);
  }

  async findByReferredUserId(
    referredUserId: ObjectId,
  ): Promise<ReferralAttributionDocument | null> {
    return this.findOne({ referredUserId } as Filter<ReferralAttributionDocument>);
  }

  async findPendingCreditByReferredUserId(
    referredUserId: ObjectId,
  ): Promise<ReferralAttributionDocument | null> {
    return this.findOne({
      referredUserId,
      creditGranted: false,
    } as Filter<ReferralAttributionDocument>);
  }

  async createAttribution(
    input: Omit<ReferralAttributionDocument, '_id' | 'createdAt' | 'updatedAt'>,
    session?: ClientSession,
  ): Promise<ReferralAttributionDocument> {
    return this.create(input, session ? { session } : undefined);
  }

  async markCreditGranted(
    attributionId: ObjectId,
    creditAmountCents: number,
    session?: ClientSession,
  ): Promise<ReferralAttributionDocument | null> {
    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      {
        _id: attributionId,
        creditGranted: false,
      } as Filter<ReferralAttributionDocument>,
      {
        $set: {
          creditGranted: true,
          creditGrantedAt: now,
          creditAmountCents,
          promoBlockedCredit: false,
          updatedAt: now,
        },
      },
      { returnDocument: 'after', session },
    );
    return result as ReferralAttributionDocument | null;
  }
}

let referralCodeRepo: ReferralCodeRepository | null = null;
let referralAttributionRepo: ReferralAttributionRepository | null = null;

export function getReferralCodeRepository(): ReferralCodeRepository {
  if (!referralCodeRepo) referralCodeRepo = new ReferralCodeRepository();
  return referralCodeRepo;
}

export function getReferralAttributionRepository(): ReferralAttributionRepository {
  if (!referralAttributionRepo) referralAttributionRepo = new ReferralAttributionRepository();
  return referralAttributionRepo;
}

export { MAX_ACTIVE_CODES_PER_USER };
