/**
 * Achievement route handlers.
 *
 * Provides endpoints for listing achievement definitions, fetching own
 * achievements, viewing another identity's achievements (privacy-gated),
 * and retrieving global stats.
 */

import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import { success, errors } from '../../utils/response';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import { getIdentityRepository } from '../../repositories/identity.repository';
import {
  getAllDefinitions,
  getIdentityAchievements,
  getAchievementHolderCount,
  getGlobalAchievementStats,
  checkAndAward,
} from '../../services/achievement.service';
import { DEFAULT_PRIVACY_SETTINGS, type ProfileVisibility } from '../../models/identity';
import { areFriends } from '../identity/profile.controller';
import { ACHIEVEMENT_MAP, CLAIMABLE_ACTIONS } from '../../models/achievement-definitions';

/**
 * GET /achievements/definitions - List all achievement definitions.
 * Public endpoint.
 */
export async function getDefinitionsCtrl(ctx: RouteContext): Promise<Response> {
  return success({ definitions: getAllDefinitions() });
}

/**
 * GET /achievements/me - Get the current identity's achievements.
 * Requires identity session.
 */
export async function getMyAchievementsCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const achievements = await getIdentityAchievements(identity._id);
  return success({ achievements });
}

/**
 * GET /identity/:id/achievements - Get another identity's achievements.
 * Privacy-gated using the identity's achievements visibility setting.
 */
export async function getIdentityAchievementsCtrl(ctx: RouteContext): Promise<Response> {
  const { id } = ctx.params;
  if (!id || id.length !== 24) {
    return ctx.errors.badRequest();
  }

  const identityRepo = getIdentityRepository();
  const targetDoc = await identityRepo.findByIdentityId(id);
  if (!targetDoc) {
    return errors.notFound('Identity not found');
  }

  const privacy = targetDoc.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
  const achievementVisibility: ProfileVisibility = privacy.achievements ?? 'public';

  let viewerRelation: 'self' | 'friend' | 'stranger' = 'stranger';

  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (identitySessionId) {
    const viewerIdentity = await getIdentityFromSession(identitySessionId);
    if (viewerIdentity) {
      if (viewerIdentity._id.equals(targetDoc._id)) {
        viewerRelation = 'self';
      } else {
        const friends = await areFriends(viewerIdentity._id, targetDoc._id);
        if (friends) viewerRelation = 'friend';
      }
    }
  }

  if (viewerRelation !== 'self') {
    const canView =
      achievementVisibility === 'public' ||
      (achievementVisibility === 'friends' && viewerRelation === 'friend');

    if (!canView) {
      return success({ achievements: [] });
    }
  }

  const achievements = await getIdentityAchievements(targetDoc._id);
  return success({ achievements });
}

/**
 * GET /achievements/:achievementId/stats - Get holder count for an achievement.
 * Public endpoint.
 */
export async function getAchievementStatsCtrl(ctx: RouteContext): Promise<Response> {
  const { achievementId } = ctx.params;
  if (!achievementId || !ACHIEVEMENT_MAP.has(achievementId)) {
    return ctx.errors.notFound();
  }

  const holderCount = await getAchievementHolderCount(achievementId);
  return success({ achievementId, holderCount });
}

/**
 * GET /achievements/stats - Get global holder counts for all achievements.
 * Public endpoint.
 */
export async function getGlobalStatsCtrl(ctx: RouteContext): Promise<Response> {
  const stats = await getGlobalAchievementStats();
  return success({ stats });
}

/**
 * POST /achievements/claim - Claim a client-triggered achievement.
 * Only actions in the CLAIMABLE_ACTIONS whitelist are accepted.
 */
export async function claimAchievementCtrl(ctx: RouteContext): Promise<Response> {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { action } = ctx.body as { action?: string };
  if (!action || !CLAIMABLE_ACTIONS.has(action)) {
    return errors.badRequest('Invalid or non-claimable action.');
  }

  await checkAndAward(identity._id, action);

  return success({ claimed: true });
}
