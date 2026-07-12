/**
 * Inline badge display.
 *
 * Renders one or more badge chips (text labels) in a compact row.
 * Used on profile pages, identity cards, and hover cards to show
 * earned/selected badges.
 */

import { useTranslation } from 'react-i18next';
import type { BadgeId } from '@adieuu/shared';
import { getBadgeDefinition } from '../constants/badges';
import { Tooltip } from './Tooltip';

export interface BadgeDisplayProps {
  badges: BadgeId[];
  /** Maximum number of badges to render (defaults to all). */
  max?: number;
  size?: 'sm' | 'md';
  className?: string;
}

export function BadgeDisplay({ badges, max, size = 'sm', className = '' }: BadgeDisplayProps) {
  const { t } = useTranslation();

  const visible = max != null ? badges.slice(0, Math.max(0, max)) : badges;
  if (visible.length === 0) return null;

  return (
    <span className={`badge-display badge-display--${size} ${className}`.trim()}>
      {visible.map((id) => {
        const def = getBadgeDefinition(id);
        if (!def) return null;
        return (
          <Tooltip key={id} content={t(def.criteriaKey)} position="top">
            <span
              tabIndex={0}
              className={`badge-display-item badge-display-item--${id}`}
            >
              {t(def.labelKey)}
            </span>
          </Tooltip>
        );
      })}
    </span>
  );
}
