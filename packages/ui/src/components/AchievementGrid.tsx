/**
 * Reusable achievement grid with category and earned/unearned filters.
 *
 * Two modes of operation:
 * - **Catalog mode** (definitions provided): renders every definition as
 *   earned or locked, with optional earned/unearned status filter.
 * - **Earned-only mode** (no definitions): renders only the supplied earned
 *   achievements, with a category filter.
 */

import { useState, useMemo } from 'react';
import { Select, Portal, createListCollection, type ListCollection } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import type {
  PublicAchievementDefinition,
  PublicAchievement,
  AchievementCategory,
} from '@adieuu/shared';
import { Icon } from '../icons/Icon';
import type { AppIconName } from '../icons/appIcons';

export interface AchievementGridProps {
  title: string;
  /** All definitions -- when provided, enables catalog mode (shows locked achievements). */
  definitions?: PublicAchievementDefinition[];
  /** Earned achievements. */
  achievements: PublicAchievement[];
  /** Show the earned / unearned filter (catalog mode only). */
  showStatusFilter?: boolean;
  /** Viewer's earned achievement IDs -- shows "you don't have this" badge. */
  viewerAchievementIds?: Set<string>;
  /** Replace the grid with a loading spinner. */
  loading?: boolean;
  /** Profile accent colour — forwarded to portaled filter dropdowns. */
  accentColor?: string;
}

type StatusFilter = 'all' | 'earned' | 'unearned';

interface DisplayItem {
  key: string;
  definition: PublicAchievementDefinition;
  earned: boolean;
  awardedAt?: string;
  how?: string;
}

export function AchievementGrid({
  title,
  definitions,
  achievements,
  showStatusFilter = false,
  viewerAchievementIds,
  loading = false,
  accentColor,
}: AchievementGridProps) {
  const { t } = useTranslation();
  const [categoryFilter, setCategoryFilter] = useState<'all' | AchievementCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const catalogMode = !!definitions;

  const earnedMap = useMemo(
    () => new Map(achievements.map((a) => [a.achievementId, a])),
    [achievements],
  );

  const items = useMemo<DisplayItem[]>(() => {
    if (catalogMode) {
      return definitions!.map((def) => {
        const ach = earnedMap.get(def.id);
        return {
          key: def.id,
          definition: def,
          earned: !!ach,
          awardedAt: ach?.awardedAt,
          how: def.how,
        };
      });
    }
    return achievements.map((ach) => ({
      key: ach.id,
      definition: ach.definition,
      earned: true,
      awardedAt: ach.awardedAt,
    }));
  }, [catalogMode, definitions, achievements, earnedMap]);

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (categoryFilter !== 'all' && item.definition.category !== categoryFilter) return false;
        if (statusFilter === 'earned' && !item.earned) return false;
        if (statusFilter === 'unearned' && item.earned) return false;
        return true;
      }),
    [items, categoryFilter, statusFilter],
  );

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('achievements.filterAll') },
          { value: 'social', label: t('achievements.category.social') },
          { value: 'messaging', label: t('achievements.category.messaging') },
          { value: 'security', label: t('achievements.category.security') },
          { value: 'profile', label: t('achievements.category.profile') },
          { value: 'misc', label: t('achievements.category.misc') },
        ],
      }),
    [t],
  );

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('achievements.filterAll') },
          { value: 'earned', label: t('achievements.filterEarned') },
          { value: 'unearned', label: t('achievements.filterUnearned') },
        ],
      }),
    [t],
  );

  const categoryLabel = categoryCollection.items.find((i) => i.value === categoryFilter)?.label ?? '';
  const statusLabel = statusCollection.items.find((i) => i.value === statusFilter)?.label ?? '';

  const showFilters = !loading && items.length > 0;
  const hasActiveFilter = categoryFilter !== 'all' || statusFilter !== 'all';

  return (
    <>
      <div className="achievement-header">
        <h3 className="profile-section-title">
          <Icon name="trophy" size="sm" />
          {title}
        </h3>

        {showFilters && (
          <div className="achievement-header__filters">
            <FilterSelect
              collection={categoryCollection}
              value={categoryFilter}
              label={categoryLabel}
              onValueChange={(v) => setCategoryFilter(v as 'all' | AchievementCategory)}
              accentColor={accentColor}
            />
            {catalogMode && showStatusFilter && (
              <FilterSelect
                collection={statusCollection}
                value={statusFilter}
                label={statusLabel}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                accentColor={accentColor}
              />
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="profile-view-loading">
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="profile-view-achievements-empty">
          <p style={{ color: 'var(--color-text-secondary)' }}>
            {hasActiveFilter
              ? t('achievements.noResults')
              : t('achievements.noAchievements')}
          </p>
        </div>
      ) : (
        <div className="profile-view-achievements-grid">
          {filtered.map((item) => {
            const viewerLacks = viewerAchievementIds
              && !viewerAchievementIds.has(item.definition.id);

            return (
              <div
                key={item.key}
                className={`achievement-card${!item.earned ? ' achievement-card--locked' : ''}`}
              >
                <div className="achievement-card-icon">
                  <Icon name={item.definition.icon as AppIconName} size="lg" />
                </div>
                <div className="achievement-card-info">
                  <span className="achievement-card-name">
                    {t(item.definition.name)}
                  </span>
                  <span className="achievement-card-desc">
                    {t(item.definition.description)}
                  </span>
                  {!item.earned && item.how && (
                    <span className="achievement-card-how">
                      {t(item.how)}
                    </span>
                  )}
                  {item.earned && item.awardedAt ? (
                    <span className="achievement-card-date">
                      {new Date(item.awardedAt).toLocaleDateString()}
                    </span>
                  ) : !item.earned ? (
                    <span className="achievement-card-how">
                      {t('achievements.notYetEarned')}
                    </span>
                  ) : null}
                  {item.earned && viewerLacks && (
                    <span className="achievement-card-not-earned">
                      {t('achievements.youDontHaveThis')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal helper — small select dropdown reused for each filter
// ---------------------------------------------------------------------------

type SelectItem = { value: string; label: string };

interface FilterSelectProps {
  collection: ListCollection<SelectItem>;
  value: string;
  label: string;
  onValueChange: (value: string) => void;
  accentColor?: string;
}

function FilterSelect({ collection, value, label, onValueChange, accentColor }: FilterSelectProps) {
  const portalStyle = accentColor
    ? { '--profile-accent': accentColor } as React.CSSProperties
    : undefined;

  return (
    <Select.Root
      collection={collection}
      value={[value]}
      onValueChange={(d) => {
        const next = d.value[0];
        if (next) onValueChange(next);
      }}
      positioning={{ sameWidth: true }}
    >
      <Select.Control className="achievement-select-control">
        <Select.Trigger className="achievement-select-trigger">
          <Select.ValueText>{label}</Select.ValueText>
          <Select.Indicator className="achievement-select-indicator">
            <Icon name="chevronDown" size="xs" />
          </Select.Indicator>
        </Select.Trigger>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content className="achievement-select-content" style={portalStyle}>
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item} className="achievement-select-item">
                <Select.ItemText>{item.label}</Select.ItemText>
                <Select.ItemIndicator className="achievement-select-item-indicator">
                  <Icon name="check" size="xs" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
