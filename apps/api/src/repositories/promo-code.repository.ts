/**
 * Promotional code repository.
 *
 * Manages promo code definitions and redemption records.
 */

import type { ClientSession, Filter, ObjectId, Sort } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type {
  PromoCodeDocument,
  PromoRedemptionDocument,
  PromoRedemptionStripeAction,
} from '../models/promo-code';
import type { SubscriptionTierId } from '@adieuu/shared';

// ---------------------------------------------------------------------------
// Promo Code Repository
// ---------------------------------------------------------------------------

export class PromoCodeRepository extends BaseRepository<PromoCodeDocument> {
  constructor() {
    super(Collections.PROMO_CODES);
  }

  async findByShortcode(shortcode: string): Promise<PromoCodeDocument | null> {
    return this.findOne({ shortcode } as Filter<PromoCodeDocument>);
  }

  async listPaginated(
    offset: number,
    limit: number,
  ): Promise<{ codes: PromoCodeDocument[]; total: number }> {
    const [codes, total] = await Promise.all([
      this.collection
        .find({} as Filter<PromoCodeDocument>)
        .sort({ createdAt: -1 } as Sort)
        .skip(offset)
        .limit(limit)
        .toArray(),
      this.count({} as Filter<PromoCodeDocument>),
    ]);
    return { codes: codes as PromoCodeDocument[], total };
  }

  async createCode(
    input: Omit<PromoCodeDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PromoCodeDocument> {
    return this.create(input);
  }

  async updateByShortcode(
    shortcode: string,
    update: Partial<Omit<PromoCodeDocument, '_id' | 'createdAt' | 'shortcode'>>,
  ): Promise<PromoCodeDocument | null> {
    const result = await this.collection.findOneAndUpdate(
      { shortcode } as Filter<PromoCodeDocument>,
      { $set: { ...update, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return result as PromoCodeDocument | null;
  }

  async deleteByShortcode(shortcode: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ shortcode } as Filter<PromoCodeDocument>);
    return result.deletedCount === 1;
  }

  /**
   * Atomically increments currentUses when under maxUses (or unlimited).
   * Returns null when the code is at capacity.
   */
  async tryIncrementUses(
    shortcode: string,
    session?: ClientSession,
  ): Promise<PromoCodeDocument | null> {
    const filter: Filter<PromoCodeDocument> = {
      shortcode,
      $or: [
        { maxUses: null },
        { $expr: { $lt: ['$currentUses', '$maxUses'] } },
      ],
    } as Filter<PromoCodeDocument>;

    const result = await this.collection.findOneAndUpdate(
      filter,
      {
        $inc: { currentUses: 1 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after', session },
    );

    return result as PromoCodeDocument | null;
  }
}

// ---------------------------------------------------------------------------
// Promo Redemption Repository
// ---------------------------------------------------------------------------

export class PromoRedemptionRepository extends BaseRepository<PromoRedemptionDocument> {
  constructor() {
    super(Collections.PROMO_REDEMPTIONS);
  }

  async findByUserAndShortcode(
    userId: ObjectId,
    shortcode: string,
  ): Promise<PromoRedemptionDocument | null> {
    return this.findOne({ userId, shortcode } as Filter<PromoRedemptionDocument>);
  }

  async findShortcodesByUser(userId: ObjectId): Promise<string[]> {
    const docs = await this.collection
      .find({ userId } as Filter<PromoRedemptionDocument>)
      .project({ shortcode: 1 })
      .toArray();
    return docs.map((d) => (d as { shortcode: string }).shortcode);
  }

  async findAllByUser(userId: ObjectId): Promise<PromoRedemptionDocument[]> {
    const docs = await this.collection
      .find({ userId } as Filter<PromoRedemptionDocument>)
      .sort({ redeemedAt: -1 } as Sort)
      .toArray();
    return docs as PromoRedemptionDocument[];
  }

  async createRedemption(
    input: Omit<PromoRedemptionDocument, '_id' | 'createdAt' | 'updatedAt'>,
    options?: { session?: ClientSession },
  ): Promise<PromoRedemptionDocument> {
    return this.create(input, options);
  }

  async updateStripeAction(
    userId: ObjectId,
    shortcode: string,
    stripeAction: PromoRedemptionStripeAction,
    subscriptionOverrideApplied?: { tier: SubscriptionTierId; expiresAt: Date },
  ): Promise<void> {
    const update: Partial<PromoRedemptionDocument> = {
      stripeAction,
      updatedAt: new Date(),
    };
    if (subscriptionOverrideApplied) {
      update.subscriptionOverrideApplied = subscriptionOverrideApplied;
    }

    await this.collection.updateOne(
      { userId, shortcode } as Filter<PromoRedemptionDocument>,
      { $set: update },
    );
  }

  async listByShortcode(
    shortcode: string,
    offset: number,
    limit: number,
  ): Promise<{ redemptions: PromoRedemptionDocument[]; total: number }> {
    const filter = { shortcode } as Filter<PromoRedemptionDocument>;
    const [redemptions, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ redeemedAt: -1 } as Sort)
        .skip(offset)
        .limit(limit)
        .toArray(),
      this.count(filter),
    ]);
    return { redemptions: redemptions as PromoRedemptionDocument[], total };
  }
}

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

let promoCodeRepo: PromoCodeRepository | null = null;
let promoRedemptionRepo: PromoRedemptionRepository | null = null;

export function getPromoCodeRepository(): PromoCodeRepository {
  if (!promoCodeRepo) {
    promoCodeRepo = new PromoCodeRepository();
  }
  return promoCodeRepo;
}

export function getPromoRedemptionRepository(): PromoRedemptionRepository {
  if (!promoRedemptionRepo) {
    promoRedemptionRepo = new PromoRedemptionRepository();
  }
  return promoRedemptionRepo;
}
