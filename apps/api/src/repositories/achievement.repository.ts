/**
 * Achievement repository
 * Data access layer for identity achievement records.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { AchievementDocument } from '../models/achievement';
import { getIdentityRepository } from './identity.repository';

export class AchievementRepository extends BaseRepository<AchievementDocument> {
  constructor() {
    super(Collections.IDENTITY_ACHIEVEMENTS);
  }

  /**
   * Award an achievement to an identity.
   * Returns null if the achievement was already awarded (unique index).
   */
  async award(
    identityId: ObjectId,
    achievementId: string,
    metadata?: Record<string, unknown>
  ): Promise<AchievementDocument | null> {
    try {
      const created = await super.create({
        identityId,
        achievementId,
        awardedAt: new Date(),
        metadata,
      });
      await getIdentityRepository().incrementAchievementsEarnedCount(identityId);
      return created;
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: number }).code === 11000
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Check whether an identity already has a specific achievement.
   */
  async hasAchievement(identityId: ObjectId, achievementId: string): Promise<boolean> {
    const doc = await this.findOne({ identityId, achievementId } as any);
    return doc !== null;
  }

  /**
   * Get all achievements for an identity, newest first.
   */
  async getByIdentity(identityId: ObjectId): Promise<AchievementDocument[]> {
    return await this.collection
      .find({ identityId } as any)
      .sort({ awardedAt: -1 })
      .toArray() as AchievementDocument[];
  }

  /**
   * Count how many identities hold a specific achievement.
   */
  async countHolders(achievementId: string): Promise<number> {
    return await this.count({ achievementId } as any);
  }

  /**
   * Get global holder counts for all achievements.
   */
  async getGlobalStats(): Promise<Record<string, number>> {
    const pipeline = [
      { $group: { _id: '$achievementId', count: { $sum: 1 } } },
    ];
    const results = await this.collection.aggregate(pipeline).toArray();
    const stats: Record<string, number> = {};
    for (const r of results) {
      stats[r._id as string] = r.count as number;
    }
    return stats;
  }
}

let achievementRepository: AchievementRepository | null = null;

export function getAchievementRepository(): AchievementRepository {
  if (!achievementRepository) {
    achievementRepository = new AchievementRepository();
  }
  return achievementRepository;
}
