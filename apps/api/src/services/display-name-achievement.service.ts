/**
 * Awards profile achievements based on display name patterns and change frequency.
 */

import type { ObjectId } from 'mongodb';
import { checkAndAward } from './achievement.service';
import { getIdentityRepository } from '../repositories/identity.repository';
import { awardTvReferenceDisplayNameAchievements } from './tv-reference-text-achievement.service';

const WITNESS_PROTECTION_WINDOW_MS = 60 * 60 * 1000;
const WITNESS_PROTECTION_CHANGE_THRESHOLD = 3;

export function isEdgeLordDisplayName(displayName: string): boolean {
  return /^xX/i.test(displayName) && /Xx$/i.test(displayName);
}

export function isMcLovinDisplayName(displayName: string): boolean {
  return displayName.trim().toLowerCase() === 'mclovin';
}

export function containsSlimShadyDisplayName(displayName: string): boolean {
  return /slim shady/i.test(displayName);
}

export function isSingleSymbolDisplayName(displayName: string): boolean {
  const trimmed = displayName.trim();
  if (trimmed.length !== 1) return false;
  return !/[\p{L}\p{N}\s]/u.test(trimmed);
}

export function isNeoOrTrinityDisplayName(displayName: string): boolean {
  const normalized = displayName.trim().toLowerCase();
  return normalized === 'neo' || normalized === 'trinity';
}

async function awardDisplayNamePatternAchievements(
  identityId: ObjectId,
  displayName: string,
): Promise<void> {
  if (isEdgeLordDisplayName(displayName)) {
    checkAndAward(identityId, 'display_name_edge_lord').catch(() => {});
  }
  if (isMcLovinDisplayName(displayName)) {
    checkAndAward(identityId, 'display_name_mclovin').catch(() => {});
  }
  if (containsSlimShadyDisplayName(displayName)) {
    checkAndAward(identityId, 'display_name_slim_shady').catch(() => {});
  }
  if (isSingleSymbolDisplayName(displayName)) {
    checkAndAward(identityId, 'display_name_single_symbol').catch(() => {});
  }
  if (isNeoOrTrinityDisplayName(displayName)) {
    checkAndAward(identityId, 'display_name_neo_or_trinity').catch(() => {});
  }

  awardTvReferenceDisplayNameAchievements(identityId, displayName);
}

/**
 * Check pattern-based display name achievements (creation or update).
 */
export async function checkDisplayNameAchievements(
  identityId: ObjectId,
  displayName: string,
): Promise<void> {
  await awardDisplayNamePatternAchievements(identityId, displayName);
}

/**
 * Record a display name change and award rapid-rename achievements when applicable.
 */
export async function checkDisplayNameChangeAchievements(
  identityId: ObjectId,
  displayName: string,
): Promise<void> {
  await awardDisplayNamePatternAchievements(identityId, displayName);

  const repo = getIdentityRepository();
  const changesInLastHour = await repo.recordDisplayNameChange(identityId);
  if (changesInLastHour > WITNESS_PROTECTION_CHANGE_THRESHOLD) {
    checkAndAward(identityId, 'display_name_witness_protection').catch(() => {});
  }
}

export { WITNESS_PROTECTION_WINDOW_MS, WITNESS_PROTECTION_CHANGE_THRESHOLD };
