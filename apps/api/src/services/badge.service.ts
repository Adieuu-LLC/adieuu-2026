/**
 * Badge Service
 *
 * Awards identity-bound badges that are persisted on the identity document
 * (as opposed to entitlement-derived badges like vanguard/founder).
 *
 * - top100 / top1000: awarded based on global alias creation order.
 * - overachiever: awarded when an identity has earned every non-entitlement achievement.
 *
 * All functions are fire-and-forget safe.
 */

import { ObjectId } from 'mongodb';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getAchievementRepository } from '../repositories/achievement.repository';
import { ACHIEVEMENT_DEFINITIONS } from '../models/achievement-definitions';
import elog from '../utils/adieuuLogger';

const NON_ENTITLEMENT_ACHIEVEMENT_COUNT = ACHIEVEMENT_DEFINITIONS.filter(
  (d) => d.trigger.type !== 'entitlement',
).length;

const HIGHEST_BADGE_THRESHOLD = 1000;

/**
 * Award order-based badges (top100 / top1000) to a newly created identity.
 *
 * Uses the monotonic global identity creation counter (incremented during
 * identity creation) so deleted identities never deflate the count and
 * late registrants cannot incorrectly qualify.
 *
 * @param creationOrder - The global sequence number for this identity,
 *   obtained from {@link IdentityCountRepository.incrementGlobalSequence}.
 */
export async function awardOrderBadges(
  identityId: string | ObjectId,
  creationOrder: number,
): Promise<void> {
  if (creationOrder > HIGHEST_BADGE_THRESHOLD) return;

  try {
    const repo = getIdentityRepository();

    await repo.addEarnedBadge(identityId, 'top1000');
    elog.info('Badge awarded: top1000', {
      identityId: identityId instanceof ObjectId ? identityId.toHexString() : identityId,
    });

    if (creationOrder <= 100) {
      await repo.addEarnedBadge(identityId, 'top100');
      elog.info('Badge awarded: top100', {
        identityId: identityId instanceof ObjectId ? identityId.toHexString() : identityId,
      });
    }
  } catch (err) {
    elog.warn('Failed to award order badges', {
      error: err,
      identityId: identityId instanceof ObjectId ? identityId.toHexString() : identityId,
    });
  }
}

/**
 * Check whether an identity has earned all non-entitlement achievements.
 * If so, award the 'overachiever' badge (point-in-time snapshot: not revoked
 * if new achievements are added later).
 */
export async function checkOverachieverBadge(
  identityId: string | ObjectId,
): Promise<void> {
  try {
    const idObjId = identityId instanceof ObjectId
      ? identityId
      : new ObjectId(identityId);

    const identityRepo = getIdentityRepository();

    const alreadyHas = await identityRepo.hasEarnedBadge(idObjId, 'overachiever');
    if (alreadyHas) return;

    const achievementRepo = getAchievementRepository();
    const earned = await achievementRepo.getByIdentity(idObjId);
    const earnedIds = new Set(earned.map((d) => d.achievementId));

    const allNonEntitlementEarned = ACHIEVEMENT_DEFINITIONS.every((def) => {
      if (def.trigger.type === 'entitlement') return true;
      return earnedIds.has(def.id);
    });

    if (!allNonEntitlementEarned) return;

    await identityRepo.addEarnedBadge(idObjId, 'overachiever');
    elog.info('Badge awarded: overachiever', {
      identityId: idObjId.toHexString(),
      achievementCount: earnedIds.size,
      requiredCount: NON_ENTITLEMENT_ACHIEVEMENT_COUNT,
    });
  } catch (err) {
    elog.warn('Failed to check/award overachiever badge', {
      error: err,
      identityId: identityId instanceof ObjectId ? identityId.toHexString() : identityId,
    });
  }
}
