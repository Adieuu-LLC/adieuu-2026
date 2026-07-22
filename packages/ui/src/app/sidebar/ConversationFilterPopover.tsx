import { useTranslation } from 'react-i18next';
import { Switch } from '@ark-ui/react';
import { Popover } from '../../components/Popover';
import { Icon } from '../../icons/Icon';
import type { SortMode, TypeFilter } from './conversationSidebarTypes';

export function ConversationFilterPopover({
  typeFilter,
  onTypeFilter,
  sortMode,
  onSortMode,
  showArchived,
  onShowArchived,
}: {
  typeFilter: TypeFilter;
  onTypeFilter: (v: TypeFilter) => void;
  sortMode: SortMode;
  onSortMode: (v: SortMode) => void;
  showArchived: boolean;
  onShowArchived: (v: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <Popover
      trigger={
        <button
          type="button"
          className="sidebar-item sidebar-filter-trigger"
          aria-label={t('conversations.filter.button', 'Filter')}
        >
          <span className="sidebar-item-icon">
            <Icon name="filter" />
          </span>
          <span className="sidebar-item-label">{t('conversations.filter.button', 'Filter')}</span>
        </button>
      }
      positioning={{ placement: 'bottom-start' }}
      className="sidebar-filter-popover"
    >
      <div className="sidebar-filter-popover-body">
        <div className="sidebar-filter-group">
          <div className="sidebar-filter-row">
            {(['all', 'dm', 'group'] as const).map((val) => (
              <button
                key={val}
                type="button"
                className={`sidebar-filter-chip${typeFilter === val ? ' sidebar-filter-chip--active' : ''}`}
                onClick={() => onTypeFilter(val)}
              >
                {val === 'all'
                  ? t('conversations.filter.typeAll')
                  : val === 'dm'
                    ? t('conversations.filter.typeDms')
                    : t('conversations.filter.typeGroups')}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-filter-group">
          <div className="sidebar-filter-row">
            {(['recent', 'alpha'] as const).map((val) => (
              <button
                key={val}
                type="button"
                className={`sidebar-filter-chip${sortMode === val ? ' sidebar-filter-chip--active' : ''}`}
                onClick={() => onSortMode(val)}
              >
                {val === 'recent'
                  ? t('conversations.filter.sortRecent')
                  : t('conversations.filter.sortAlpha')}
              </button>
            ))}
          </div>
        </div>

        <Switch.Root
          checked={showArchived}
          onCheckedChange={(details) => onShowArchived(details.checked)}
          className="sidebar-filter-switch"
        >
          <Switch.Label className="sidebar-filter-switch-label">
            {t('conversations.filter.showArchived')}
          </Switch.Label>
          <Switch.Control className="sidebar-filter-switch-control">
            <Switch.Thumb className="sidebar-filter-switch-thumb" />
          </Switch.Control>
          <Switch.HiddenInput />
        </Switch.Root>
      </div>
    </Popover>
  );
}
