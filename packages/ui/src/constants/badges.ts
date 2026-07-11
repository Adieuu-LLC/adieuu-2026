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
] as const;

export const MAX_SELECTED_BADGES = 3;

export function getBadgeDefinition(id: BadgeId): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.id === id);
}
