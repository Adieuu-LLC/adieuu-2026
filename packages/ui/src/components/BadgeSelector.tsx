/**
 * Badge selector popover for the profile editor.
 *
 * Displays all possible badges in a grid. Earned badges are toggleable
 * (up to 3 selected at a time); unearned badges appear greyed out.
 * Hovering over any badge shows its earning criteria via a tooltip.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { BadgeId } from '@adieuu/shared';
import { BADGE_DEFINITIONS, MAX_SELECTED_BADGES } from '../constants/badges';
import { Popover } from './Popover';
import { Tooltip } from './Tooltip';
import { Icon } from '../icons/Icon';

export interface BadgeSelectorProps {
  earnedBadges: BadgeId[];
  selectedBadges: BadgeId[];
  onChange: (selected: BadgeId[]) => void;
  disabled?: boolean;
}

export function BadgeSelector({
  earnedBadges,
  selectedBadges,
  onChange,
  disabled = false,
}: BadgeSelectorProps) {
  const { t } = useTranslation();

  const handleToggle = useCallback(
    (badgeId: BadgeId) => {
      if (disabled) return;

      const idx = selectedBadges.indexOf(badgeId);
      if (idx >= 0) {
        onChange(selectedBadges.filter((b) => b !== badgeId));
      } else if (selectedBadges.length < MAX_SELECTED_BADGES) {
        onChange([...selectedBadges, badgeId]);
      }
    },
    [selectedBadges, onChange, disabled],
  );

  const triggerLabel = selectedBadges.length > 0
    ? t('identity.profile.badges') + ` (${selectedBadges.length})`
    : t('identity.profile.badges');

  return (
    <Popover
      trigger={
        <button
          type="button"
          className="badge-selector-trigger"
          disabled={disabled}
        >
          <Icon name="award" size="xs" />
          <span>{triggerLabel}</span>
          <Icon name="chevronDown" size="xs" />
        </button>
      }
      positioning={{ placement: 'bottom-start' }}
      className="badge-selector-popover"
    >
      <div className="badge-selector">
        <h4 className="badge-selector-title">
          {t('identity.profile.badgesSelector')}
        </h4>

        {selectedBadges.length >= MAX_SELECTED_BADGES && (
          <p className="badge-selector-limit">
            {t('identity.profile.badgesMaxReached')}
          </p>
        )}

        <div className="badge-selector-grid">
          {BADGE_DEFINITIONS.map((def) => {
            const isEarned = earnedBadges.includes(def.id);
            const selIdx = selectedBadges.indexOf(def.id);
            const isSelected = selIdx >= 0;
            const atLimit = selectedBadges.length >= MAX_SELECTED_BADGES && !isSelected;

            const tooltipContent = isEarned
              ? t(def.criteriaKey)
              : `${t(def.criteriaKey)} — ${t('badges.notEarned')}`;

            return (
              <Tooltip key={def.id} content={tooltipContent} position="top">
                <div className="badge-selector-item-wrapper">
                  <button
                    type="button"
                    className={[
                      'badge-selector-item',
                      `badge-selector-item--${def.id}`,
                      !isEarned && 'badge-selector-item--locked',
                      isSelected && 'badge-selector-item--selected',
                      atLimit && 'badge-selector-item--disabled',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={disabled || !isEarned || atLimit}
                    onClick={() => handleToggle(def.id)}
                    aria-pressed={isSelected}
                  >
                    <span className="badge-selector-item-label">
                      {t(def.labelKey)}
                    </span>
                    {isSelected && (
                      <span className="badge-selector-item-order">
                        {selIdx + 1}
                      </span>
                    )}
                  </button>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Popover>
  );
}
