/**
 * Sidebar search component with autocomplete dropdown.
 * Uses Ark UI Combobox for accessible autocomplete functionality.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Combobox, Portal, createListCollection } from '@ark-ui/react';
import type { PublicIdentity } from '@adieuu/shared';
import { useIdentitySearch } from '../hooks/useIdentitySearch';
import { useSidebar } from './Sidebar';
import { SearchIcon } from './Icons';

export interface SidebarSearchProps {
  /** Called when an identity is selected */
  onSelect?: (identity: PublicIdentity) => void;
}

export function SidebarSearch({ onSelect }: SidebarSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isExpanded, closeMobile } = useSidebar();
  const { results, isLoading, search, clear, query } = useIdentitySearch();
  const [inputValue, setInputValue] = useState('');

  const collection = createListCollection({
    items: results,
    itemToString: (item) => item.displayName,
    itemToValue: (item) => item.id,
  });

  const handleInputChange = useCallback(
    (details: { inputValue: string }) => {
      setInputValue(details.inputValue);
      search(details.inputValue);
    },
    [search]
  );

  const handleSelect = useCallback(
    (details: { items: PublicIdentity[] }) => {
      const selected = details.items[0];
      if (selected) {
        closeMobile();
        clear();
        setInputValue('');
        if (onSelect) {
          onSelect(selected);
        } else {
          navigate(`/identity/${selected.id}`);
        }
      }
    },
    [closeMobile, clear, navigate, onSelect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && query.length >= 2) {
        e.preventDefault();
        closeMobile();
        clear();
        setInputValue('');
        navigate(`/search?q=${encodeURIComponent(query)}`);
      }
    },
    [query, closeMobile, clear, navigate]
  );

  if (!isExpanded) {
    return (
      <button
        type="button"
        className="sidebar-search-collapsed"
        onClick={() => navigate('/search')}
        title={t('search.title')}
        aria-label={t('search.title')}
      >
        <SearchIcon />
      </button>
    );
  }

  return (
    <div className="sidebar-search">
      <Combobox.Root
        collection={collection}
        inputValue={inputValue}
        onInputValueChange={handleInputChange}
        onValueChange={handleSelect}
        loopFocus
        openOnClick={false}
        selectionBehavior="clear"
      >
        <Combobox.Control className="sidebar-search-control">
          <span className="sidebar-search-icon">
            <SearchIcon />
          </span>
          <Combobox.Input
            className="sidebar-search-input"
            placeholder={t('search.placeholder')}
            onKeyDown={handleKeyDown}
          />
          {isLoading && <span className="sidebar-search-spinner spinner spinner-sm" />}
        </Combobox.Control>

        <Portal>
          <Combobox.Positioner className="sidebar-search-positioner">
            <Combobox.Content className="sidebar-search-content">
              {results.length === 0 && query.length >= 2 && !isLoading && (
                <div className="sidebar-search-empty">
                  {t('search.noResults')}
                </div>
              )}

              {collection.items.map((identity) => (
                <Combobox.Item
                  key={identity.id}
                  item={identity}
                  className="sidebar-search-item"
                >
                  <div className="sidebar-search-item-avatar">
                    {identity.avatarUrl ? (
                      <img
                        src={identity.avatarUrl}
                        alt=""
                        className="sidebar-search-item-avatar-img"
                      />
                    ) : (
                      <span className="sidebar-search-item-avatar-placeholder">
                        {identity.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="sidebar-search-item-info">
                    <Combobox.ItemText className="sidebar-search-item-name">
                      {identity.displayName}
                    </Combobox.ItemText>
                    <span className="sidebar-search-item-username">
                      @{identity.username}
                    </span>
                  </div>
                </Combobox.Item>
              ))}

              {query.length >= 2 && (
                <button
                  type="button"
                  className="sidebar-search-view-all"
                  onClick={() => {
                    closeMobile();
                    clear();
                    setInputValue('');
                    navigate(`/search?q=${encodeURIComponent(query)}`);
                  }}
                >
                  {t('search.viewAll')}
                </button>
              )}
            </Combobox.Content>
          </Combobox.Positioner>
        </Portal>
      </Combobox.Root>
    </div>
  );
}
