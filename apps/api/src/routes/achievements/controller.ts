/**
 * Achievement controller — definitions, stats, claims, and privacy-gated lists.
 *
 * Core functions return discriminated results; route modules map to HTTP.
 *
 * @module routes/achievements/controller
 */

import type { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import { success, errors } from '../../utils/response';
import { sanitizeString, isValidObjectId } from '../../utils';
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
import type { PublicAchievementDefinition } from '../../models/achievement-definitions';
import type { PublicAchievement } from '../../models/achievement';

/** Row returned from {@link getIdentityAchievements} (definition + public fields). */
export type IdentityAchievementRow = PublicAchievement & { definition: PublicAchievementDefinition };

// ---------------------------------------------------------------------------
// Definitions / me / global
// ---------------------------------------------------------------------------

export async function getDefinitionsResult(): Promise<{
  ok: true;
  definitions: PublicAchievementDefinition[];
}> {
  return { ok: true, definitions: getAllDefinitions() };
}

export async function getMyAchievementsResult(
  identityId: ObjectId,
): Promise<{ ok: true; achievements: IdentityAchievementRow[] }> {
  const achievements = await getIdentityAchievements(identityId);
  return { ok: true, achievements };
}

export async function getGlobalStatsResult(): Promise<{ ok: true; stats: Record<string, number> }> {
  const stats = await getGlobalAchievementStats();
  return { ok: true, stats };
}

// ---------------------------------------------------------------------------
// Per-achievement stats
// ---------------------------------------------------------------------------

export type GetAchievementStatsResult =
  | { ok: true; achievementId: string; holderCount: number }
  | { ok: false; reason: 'not_found' };

export async function getAchievementStatsResult(
  rawAchievementId: string | undefined,
): Promise<GetAchievementStatsResult> {
  const { value: sanitized } = sanitizeString(rawAchievementId ?? '', 'idenhanced');
  if (!sanitized || !ACHIEVEMENT_MAP.has(sanitized)) {
    return { ok: false, reason: 'not_found' };
  }

  const holderCount = await getAchievementHolderCount(sanitized);
  return { ok: true, achievementId: sanitized, holderCount };
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

export type ClaimAchievementResult =
  | { ok: true }
  | { ok: false; reason: 'bad_request' };

export async function claimAchievementResult(
  identityId: ObjectId,
  body: unknown,
): Promise<ClaimAchievementResult> {
  const actionRaw =
    body &&
    typeof body === 'object' &&
    'action' in body &&
    typeof (body as { action?: unknown }).action === 'string'
      ? (body as { action: string }).action
      : undefined;

  if (actionRaw === undefined) {
    return { ok: false, reason: 'bad_request' };
  }

  const { value: action } = sanitizeString(actionRaw, 'idenhanced');
  if (!action || !CLAIMABLE_ACTIONS.has(action)) {
    return { ok: false, reason: 'bad_request' };
  }

  await checkAndAward(identityId, action);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Another identity's achievements (privacy)
// ---------------------------------------------------------------------------

export type IdentityAchievementsForTargetResult =
  | {
      ok: true;
      achievements: IdentityAchievementRow[];
      stripAwardedAt: boolean;
    }
  | { ok: false; reason: 'bad_request' | 'not_found' };

export async function getIdentityAchievementsForTargetResult(
  rawTargetId: string | undefined,
  viewerIdentityId: ObjectId | null,
): Promise<IdentityAchievementsForTargetResult> {
  const { value: targetId } = sanitizeString(rawTargetId ?? '', 'id');
  if (!targetId || !isValidObjectId(targetId)) {
    return { ok: false, reason: 'bad_request' };
  }

  const identityRepo = getIdentityRepository();
  const targetDoc = await identityRepo.findByIdentityId(targetId);
  if (!targetDoc) {
    return { ok: false, reason: 'not_found' };
  }

  const privacy = targetDoc.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
  const achievementVisibility: ProfileVisibility =
    privacy.achievements ?? DEFAULT_PRIVACY_SETTINGS.achievements;

  let viewerRelation: 'self' | 'friend' | 'stranger' = 'stranger';

  if (viewerIdentityId) {
    if (viewerIdentityId.equals(targetDoc._id)) {
      viewerRelation = 'self';
    } else {
      const friends = await areFriends(viewerIdentityId, targetDoc._id);
      if (friends) viewerRelation = 'friend';
    }
  }

  if (viewerRelation !== 'self') {
    const canView =
      achievementVisibility === 'public' ||
      (achievementVisibility === 'friends' && viewerRelation === 'friend');

    if (!canView) {
      return { ok: true, achievements: [], stripAwardedAt: true };
    }
  }

  const achievements = await getIdentityAchievements(targetDoc._id);
  const stripAwardedAt = viewerRelation !== 'self';

  return { ok: true, achievements, stripAwardedAt };
}

/**
 * Maps {@link getIdentityAchievementsForTargetResult} to an HTTP response (shared by
 * identity route; achievements router does not expose this path directly).
 */
export function respondIdentityAchievementsForTarget(
  ctx: RouteContext,
  result: IdentityAchievementsForTargetResult,
): Response {
  if (!result.ok) {
    if (result.reason === 'bad_request') return ctx.errors.badRequest();
    return errors.notFound('Identity not found');
  }

  const achievements = result.stripAwardedAt
    ? result.achievements.map(({ awardedAt: _, ...rest }) => rest)
    : result.achievements;

  return success({ achievements });
}
