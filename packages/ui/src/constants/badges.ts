import type { BadgeId } from '@adieuu/shared';
import type { AppIconName } from '../icons/appIcons';

export interface BadgeDefinition {
  id: BadgeId;
  labelKey: string;
  criteriaKey: string;
  icon: AppIconName;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  { id: 'vanguard', labelKey: 'badges.vanguard', criteriaKey: 'badges.vanguardCriteria', icon: 'shield' },
  { id: 'founder', labelKey: 'badges.founder', criteriaKey: 'badges.founderCriteria', icon: 'crown' },
  { id: 'top100', labelKey: 'badges.top100', criteriaKey: 'badges.top100Criteria', icon: 'trophy' },
  { id: 'top1000', labelKey: 'badges.top1000', criteriaKey: 'badges.top1000Criteria', icon: 'award' },
  { id: 'overachiever', labelKey: 'badges.overachiever', criteriaKey: 'badges.overachieverCriteria', icon: 'star' },
] as const;

export const MAX_SELECTED_BADGES = 3;

export function getBadgeDefinition(id: BadgeId): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === id);
}
