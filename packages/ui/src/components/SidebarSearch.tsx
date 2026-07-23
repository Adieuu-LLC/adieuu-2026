/**
 * Sidebar search component with autocomplete dropdown.
 * Uses Ark UI Combobox for accessible autocomplete functionality.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Combobox, Portal, createListCollection } from '@ark-ui/react';
import type { PublicIdentity } from '@adieuu/shared';
import { useIdentitySearch } from '../hooks/useIdentitySearch';
import { useIdentity } from '../hooks/useIdentity';
import { useFriends } from '../hooks/useFriends';
import { useSidebar } from './Sidebar';
import { Icon } from '../icons/Icon';

export interface SidebarSearchProps {
  /** Called when an identity is selected */
  onSelect?: (identity: PublicIdentity) => void;
  /** Override the default placeholder text */
  placeholderOverride?: string;
  /** Show social actions (add friend) - requires Identity and Friends providers. Defaults to true. */
  showSocialActions?: boolean;
}

/**
 * Inner component that requires Identity + Friends providers.
 * Rendered only when showSocialActions is true.
 */
function AddFriendButton({ identityId }: { identityId: string }) {
  const { t } = useTranslation();
  const { identity: selfIdentity, status: identityStatus } = useIdentity();
  const { sendRequest, getFriendshipStatus } = useFriends();
  const isIdentityLoggedIn = identityStatus === 'logged_in' && selfIdentity;
  const [status, setStatus] = useState<'none' | 'friends' | 'pending_incoming' | 'pending_outgoing'>('none');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    if (!isIdentityLoggedIn || identityId === selfIdentity?.id) return;
    let cancelled = false;
    getFriendshipStatus(identityId).then((result) => {
      if (!cancelled) setStatus(result.status);
    });
    return () => { cancelled = true; };
  }, [identityId, isIdentityLoggedIn, selfIdentity?.id, getFriendshipStatus]);

  if (!isIdentityLoggedIn || identityId === selfIdentity?.id) return null;

  if (status === 'friends') {
    return (
      <span className="sidebar-search-item-friend-status sidebar-search-item-friend-status--friends">
        <Icon name="users" />
        {t('friends.alreadyFriends')}
      </span>
    );
  }

  if (status === 'pending_outgoing' || status === 'pending_incoming') {
    return (
      <span className="sidebar-search-item-friend-status sidebar-search-item-friend-status--pending">
        <Icon name="clock" />
        {t('friends.pending')}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="sidebar-search-item-add-friend"
      disabled={isSending}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsSending(true);
        void sendRequest(identityId).then((ok) => {
          if (ok) setStatus('pending_outgoing');
          setIsSending(false);
        });
      }}
      title={t('friends.addFriend')}
    >
      <Icon name="plus" />
      <span>{t('friends.addFriend')}</span>
    </button>
  );
}

export function SidebarSearch({ onSelect, placeholderOverride, showSocialActions = true }: SidebarSearchProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isExpanded, setExpanded, closeMobile } = useSidebar();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFocus, setPendingFocus] = useState(false);
  const { results, isLoading, search, clear, query } = useIdentitySearch();

  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const collection = useMemo(
    () =>
      createListCollection({
        items: results,
        itemToString: (item) => item.displayName,
        itemToValue: (item) => item.id,
      }),
    [results]
  );

  const handleInputChange = useCallback(
    (details: { inputValue: string }) => {
      setInputValue(details.inputValue);
      search(details.inputValue);
      setIsOpen(details.inputValue.trim().length >= 2);
    },
    [search]
  );

  const handleOpenChange = useCallback((details: { open: boolean }) => {
    setIsOpen(details.open);
  }, []);

  const handleSelect = useCallback(
    (details: { items: PublicIdentity[] }) => {
      const selected = details.items[0];
      if (selected) {
        setIsOpen(false);
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
        setIsOpen(false);
        closeMobile();
        clear();
        setInputValue('');
        navigate(`/search?q=${encodeURIComponent(query)}`);
      }
    },
    [query, closeMobile, clear, navigate]
  );

  useEffect(() => {
    if (pendingFocus && isExpanded) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      setPendingFocus(false);
    }
  }, [pendingFocus, isExpanded]);

  if (!isExpanded) {
    return (
      <button
        type="button"
        className="sidebar-search-collapsed"
        onClick={() => {
          setExpanded(true);
          setPendingFocus(true);
        }}
        title={t('search.title')}
        aria-label={t('search.title')}
      >
        <Icon name="search" />
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
        open={isOpen}
        onOpenChange={handleOpenChange}
        loopFocus
        openOnClick={false}
        selectionBehavior="clear"
      >
        <Combobox.Control className="sidebar-search-control">
          <span className="sidebar-search-icon">
            <Icon name="search" />
          </span>
          <Combobox.Input
            ref={inputRef}
            className="sidebar-search-input"
            placeholder={placeholderOverride ?? t('search.placeholder')}
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
                  {showSocialActions && (
                    <AddFriendButton identityId={identity.id} />
                  )}
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
