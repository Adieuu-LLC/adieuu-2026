/**
 * @fileoverview Achievement Service
 *
 * Awards achievements to identities when qualifying actions occur.
 * Checks are fire-and-forget from the caller's perspective so achievement
 * failures never block primary business logic.
 *
 * PRIVACY NOTE: All data is identity-scoped.
 *
 * @module services/achievement
 */

import { ObjectId } from 'mongodb';
import { getAchievementRepository } from '../repositories/achievement.repository';
import { getFriendshipRepository } from '../repositories/friendship.repository';
import { getIdentityRepository } from '../repositories/identity.repository';
import { getCollection, Collections } from '../db';
import { createNotification } from './notification.service';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_MAP,
  toPublicDefinition,
  type AchievementDefinition,
  type PublicAchievementDefinition,
} from '../models/achievement-definitions';
import { DEFAULT_PRIVACY_SETTINGS, type IdentityDocument } from '../models/identity';
import { toPublicAchievement, type PublicAchievement } from '../models/achievement';
import { contrastRatio } from '../utils/color';
import { checkOverachieverBadge } from './badge.service';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Count helpers for threshold-based achievements
// ---------------------------------------------------------------------------

async function getCountForAction(
  identityId: ObjectId,
  action: string
): Promise<number> {
  switch (action) {
    case 'friendship_created': {
      const friendshipRepo = getFriendshipRepository();
      return friendshipRepo.countFriends(identityId);
    }
    case 'message_sent': {
      const messages = getCollection(Collections.MESSAGES);
      return messages.countDocuments({
        fromIdentityId: identityId,
        messageType: { $ne: 'system' },
      });
    }
    case 'reaction_added': {
      const reactions = getCollection(Collections.REACTIONS);
      return reactions.countDocuments({ fromIdentityId: identityId });
    }
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check all achievement definitions for matching triggers and award any
 * that the identity has not yet earned.
 *
 * Call this fire-and-forget from other services — wrap in try/catch.
 */
export async function checkAndAward(
  identityId: string | ObjectId,
  action: string,
  _context?: Record<string, unknown>
): Promise<void> {
  const repo = getAchievementRepository();
  const idObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const matching = ACHIEVEMENT_DEFINITIONS.filter((def) => {
    if (def.trigger.type === 'action') return def.trigger.action === action;
    if (def.trigger.type === 'count') return def.trigger.action === action;
    return false;
  });

  if (matching.length === 0) return;

  for (const def of matching) {
    try {
      const alreadyHas = await repo.hasAchievement(idObjId, def.id);
      if (alreadyHas) continue;

      if (def.trigger.type === 'count') {
        const count = await getCountForAction(idObjId, def.trigger.action);
        if (count < def.trigger.threshold) continue;
      }

      const awarded = await repo.award(idObjId, def.id, _context);
      if (!awarded) continue;

      await createNotification(idObjId, 'achievement_unlocked', {
        achievementId: def.id,
        definition: toPublicDefinition(def),
      });

      elog.info('Achievement awarded', {
        identityId: idObjId.toHexString(),
        achievementId: def.id,
      });

      checkOverachieverBadge(idObjId).catch(() => {});
    } catch (err) {
      elog.warn('Failed to check/award achievement', {
        error: err,
        identityId: idObjId.toHexString(),
        achievementId: def.id,
      });
    }
  }
}

/**
 * Get all achievements earned by an identity, with definitions merged in.
 */
export async function getIdentityAchievements(
  identityId: string | ObjectId
): Promise<(PublicAchievement & { definition: PublicAchievementDefinition })[]> {
  const repo = getAchievementRepository();
  const idObjId = identityId instanceof ObjectId
    ? identityId
    : new ObjectId(identityId);

  const docs = await repo.getByIdentity(idObjId);
  return docs
    .map((doc) => {
      const def = ACHIEVEMENT_MAP.get(doc.achievementId);
      if (!def) return null;
      return {
        ...toPublicAchievement(doc),
        definition: toPublicDefinition(def),
      };
    })
    .filter(Boolean) as (PublicAchievement & { definition: PublicAchievementDefinition })[];
}

/**
 * Get holder count for a single achievement.
 */
export async function getAchievementHolderCount(
  achievementId: string
): Promise<number> {
  const repo = getAchievementRepository();
  return repo.countHolders(achievementId);
}

/**
 * Get global holder counts for all achievements.
 */
export async function getGlobalAchievementStats(): Promise<Record<string, number>> {
  const repo = getAchievementRepository();
  return repo.getGlobalStats();
}

/**
 * Get all public achievement definitions.
 */
export function getAllDefinitions(): PublicAchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS.map(toPublicDefinition);
}

// ---------------------------------------------------------------------------
// Retroactive reconciliation (runs on login)
// ---------------------------------------------------------------------------

/**
 * Infer whether an action-based achievement's triggering event has already
 * occurred by checking current domain state.
 */
async function canInferActionCompleted(
  identityId: ObjectId,
  action: string,
  identity: IdentityDocument,
): Promise<boolean> {
  switch (action) {
    case 'group_created': {
      const conversations = getCollection(Collections.CONVERSATIONS);
      const doc = await conversations.findOne({
        type: 'group',
        createdBy: identityId,
      });
      return doc !== null;
    }
    case 'profile_customized': {
      const colors = identity.profileColors;
      const hasColors = !!colors && !!(colors.accent || colors.cardBackground || colors.background);
      return !!(identity.avatarUrl || identity.bio || hasColors);
    }
    case 'banner_set':
      return !!identity.bannerUrl;
    case 'privacy_all_private': {
      const p = identity.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
      return p.avatar === 'private' && p.banner === 'private' && p.bio === 'private';
    }
    case 'last_active_private': {
      const p = identity.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
      return p.lastActiveAt === 'private';
    }
    case 'profile_colors_high_contrast': {
      const c = identity.profileColors;
      if (!c?.accent || !c?.cardBackground) return false;
      return contrastRatio(c.accent, c.cardBackground) >= 7;
    }
    default:
      return false;
  }
}

/**
 * Check all achievement definitions against current domain state and award
 * any that the identity qualifies for but hasn't yet received. Entitlement-
 * gated achievements are also revoked here when the entitlement is no longer
 * present.
 *
 * Designed to be called fire-and-forget on login so that newly added
 * achievements are retroactively awarded to users who already qualify.
 *
 * @param entitlements - merged account + identity entitlements for the session
 */
export async function reconcileAchievements(
  identityId: ObjectId,
  entitlements?: string[],
): Promise<void> {
  const repo = getAchievementRepository();
  const identityRepo = getIdentityRepository();

  const identity = await identityRepo.findByIdentityId(identityId);
  if (!identity) return;

  const earnedDocs = await repo.getByIdentity(identityId);
  const earnedIds = new Set(earnedDocs.map((d) => d.achievementId));

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    try {
      if (def.trigger.type === 'entitlement') {
        const hasEntitlement = entitlements?.includes(def.trigger.entitlement) ?? false;
        if (hasEntitlement && !earnedIds.has(def.id)) {
          const awarded = await repo.award(identityId, def.id);
          if (awarded) {
            await createNotification(identityId, 'achievement_unlocked', {
              achievementId: def.id,
              definition: toPublicDefinition(def),
            });
            elog.info('Achievement awarded (entitlement)', {
              identityId: identityId.toHexString(),
              achievementId: def.id,
            });
          }
        } else if (!hasEntitlement && earnedIds.has(def.id)) {
          const revoked = await repo.revoke(identityId, def.id);
          if (revoked) {
            elog.info('Achievement revoked (entitlement removed)', {
              identityId: identityId.toHexString(),
              achievementId: def.id,
            });
          }
        }
        continue;
      }

      if (earnedIds.has(def.id)) continue;

      let qualifies = false;

      if (def.trigger.type === 'count') {
        const count = await getCountForAction(identityId, def.trigger.action);
        qualifies = count >= def.trigger.threshold;
      } else if (def.trigger.type === 'action') {
        qualifies = await canInferActionCompleted(identityId, def.trigger.action, identity);
      }

      if (!qualifies) continue;

      const awarded = await repo.award(identityId, def.id);
      if (!awarded) continue;

      await createNotification(identityId, 'achievement_unlocked', {
        achievementId: def.id,
        definition: toPublicDefinition(def),
      });

      elog.info('Achievement awarded (retroactive)', {
        identityId: identityId.toHexString(),
        achievementId: def.id,
      });
    } catch (err) {
      elog.warn('Failed to reconcile achievement', {
        error: err,
        identityId: identityId.toHexString(),
        achievementId: def.id,
      });
    }
  }

  checkOverachieverBadge(identityId).catch(() => {});
}
