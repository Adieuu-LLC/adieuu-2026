/**
 * Awards profile achievements based on bio content and save patterns.
 */

import type { ObjectId } from 'mongodb';
import { checkAndAward } from './achievement.service';
import { getIdentityRepository } from '../repositories/identity.repository';

/** Must stay in sync with UpdateProfileSchema bio max length. */
export const BIO_MAX_LENGTH = 160;
const SILENT_BOB_EMPTY_SAVE_THRESHOLD = 3;

const RETRO_HTML_TAG_RE = /<(?:marquee|blink)\b|<b(?:\s|\/?>)/i;
const CAUGHT_IN_THE_RAIN_RE = /caught in the rain/i;
const DIALUP_RE = /dial-up|56k/i;

export function containsRetroHtmlBioTags(bio: string): boolean {
  return RETRO_HTML_TAG_RE.test(bio);
}

export function containsCaughtInTheRainBio(bio: string): boolean {
  return CAUGHT_IN_THE_RAIN_RE.test(bio);
}

export function isMaxLengthBio(bio: string): boolean {
  return bio.length === BIO_MAX_LENGTH;
}

export function isEmptyBio(bio: string): boolean {
  return bio.length === 0;
}

export function containsDialupBio(bio: string): boolean {
  return DIALUP_RE.test(bio);
}

/**
 * Check bio pattern achievements when a user saves their profile bio.
 */
export async function checkBioAchievements(
  identityId: ObjectId,
  bio: string,
): Promise<void> {
  if (containsRetroHtmlBioTags(bio)) {
    checkAndAward(identityId, 'bio_html_tags').catch(() => {});
  }
  if (containsCaughtInTheRainBio(bio)) {
    checkAndAward(identityId, 'bio_caught_in_rain').catch(() => {});
  }
  if (isMaxLengthBio(bio)) {
    checkAndAward(identityId, 'bio_max_length').catch(() => {});
  }
  if (containsDialupBio(bio)) {
    checkAndAward(identityId, 'bio_dialup').catch(() => {});
  }

  if (isEmptyBio(bio)) {
    const repo = getIdentityRepository();
    const emptySaveCount = await repo.incrementEmptyBioSaveCount(identityId);
    if (emptySaveCount >= SILENT_BOB_EMPTY_SAVE_THRESHOLD) {
      checkAndAward(identityId, 'bio_empty_three_times').catch(() => {});
    }
  }
}

export { SILENT_BOB_EMPTY_SAVE_THRESHOLD };
