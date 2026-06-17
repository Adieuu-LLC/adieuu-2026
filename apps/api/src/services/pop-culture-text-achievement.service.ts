/**
 * Awards pop-culture text achievements for bios and display names.
 */

import type { ObjectId } from 'mongodb';
import { getPopCultureTextAchievementActions } from '@adieuu/shared';
import { checkAndAward } from './achievement.service';

export function awardPopCultureTextAchievements(
  identityId: ObjectId,
  text: string,
): void {
  for (const action of getPopCultureTextAchievementActions(text)) {
    checkAndAward(identityId, action).catch(() => {});
  }
}
