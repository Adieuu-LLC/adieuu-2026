/**
 * Awards TV-reference achievements for bios, display names, and shared text patterns.
 */

import type { ObjectId } from 'mongodb';
import {
  getTvReferenceBioAchievementActions,
  getTvReferenceBioOrMessageAchievementActions,
  getTvReferenceDisplayNameAchievementActions,
  getTvReferenceProfileAchievementActions,
} from '@adieuu/shared';
import { checkAndAward } from './achievement.service';

function awardActions(identityId: ObjectId, actions: string[]): void {
  for (const action of actions) {
    checkAndAward(identityId, action).catch(() => {});
  }
}

export function awardTvReferenceDisplayNameAchievements(
  identityId: ObjectId,
  displayName: string,
): void {
  awardActions(identityId, getTvReferenceDisplayNameAchievementActions(displayName));
  awardActions(identityId, getTvReferenceProfileAchievementActions(displayName));
}

export function awardTvReferenceBioAchievements(identityId: ObjectId, bio: string): void {
  awardActions(identityId, getTvReferenceBioAchievementActions(bio));
  awardActions(identityId, getTvReferenceProfileAchievementActions(bio));
  awardActions(identityId, getTvReferenceBioOrMessageAchievementActions(bio));
}

export function awardTvReferenceBioOrMessageAchievements(
  identityId: ObjectId,
  text: string,
): void {
  awardActions(identityId, getTvReferenceBioOrMessageAchievementActions(text));
}
