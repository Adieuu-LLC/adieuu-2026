/**
 * New Conversation Page
 *
 * Allows the user to start a new DM or group conversation
 * by selecting friends from their friends list.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Switch } from '@ark-ui/react';
import { useConversations } from '../../hooks/useConversations';
import { useFriends } from '../../hooks/useFriends';
import { useIdentity } from '../../hooks/useIdentity';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
import { mergeFriendInfosById } from './inviteMemberModalUtils';

interface NewConversationLocationState {
  preSelectedIds?: string[];
}

const SEARCH_DEBOUNCE_MS = 300;

export function NewConversation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { identity } = useIdentity();
  const { createDM, createGroup, conversations, loading: conversationsLoading } = useConversations();
  const { friends, searchFriends } = useFriends();

  const locationState = location.state as NewConversationLocationState | null;
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => locationState?.preSelectedIds ?? []
  );
  const [conversationTopicOrName, setConversationTopicOrName] = useState('');
  const [startSeparateDm, setStartSeparateDm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof friends | undefined>(undefined);
  const [isSearching, setIsSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchSeqRef = useRef(0);
  /** Tracks prior topic trim + whether the "separate DM" switch was shown, for defaulting the switch on. */
  const prevTopicTrimmedForSeparateRef = useRef('');
  const showSeparateSwitchPrevRef = useRef(false);

  const isGroup = selectedIds.length > 1;
  const singlePeerId = selectedIds.length === 1 ? selectedIds[0] : undefined;

  const hasExistingDmWithPeer = useMemo(() => {
    if (!identity?.id || !singlePeerId) return false;
    const self = identity.id;
    return conversations.some(
      (c) =>
        c.type === 'dm' &&
        c.participants.length === 2 &&
        c.participants.includes(self) &&
        c.participants.includes(singlePeerId)
    );
  }, [conversations, identity?.id, singlePeerId]);

  const showDmExtras = !isGroup && !!singlePeerId;
  const showSeparateThreadSwitch =
    showDmExtras && hasExistingDmWithPeer && !conversationsLoading;
  const showFirstDmNote = showDmExtras && !hasExistingDmWithPeer && !conversationsLoading;

  useEffect(() => {
    if (!conversationTopicOrName.trim() && startSeparateDm) {
      setStartSeparateDm(false);
    }
  }, [conversationTopicOrName, startSeparateDm]);

  useEffect(() => {
    if (selectedIds.length !== 1) {
      setStartSeparateDm(false);
    }
  }, [selectedIds.length]);

  useEffect(() => {
    prevTopicTrimmedForSeparateRef.current = '';
    showSeparateSwitchPrevRef.current = false;
  }, [singlePeerId]);

  /** When a topic/name is present and an existing DM exists, default "separate conversation" to on. */
  useEffect(() => {
    const trimmed = conversationTopicOrName.trim();
    const prevTrim = prevTopicTrimmedForSeparateRef.current;
    const wasShowingSwitch = showSeparateSwitchPrevRef.current;

    if (showSeparateThreadSwitch && trimmed) {
      if (prevTrim === '' || !wasShowingSwitch) {
        setStartSeparateDm(true);
      }
    }

    prevTopicTrimmedForSeparateRef.current = trimmed;
    showSeparateSwitchPrevRef.current = showSeparateThreadSwitch;
  }, [conversationTopicOrName, showSeparateThreadSwitch]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(undefined);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const seq = ++searchSeqRef.current;
    const timer = setTimeout(() => {
      void (async () => {
        const res = await searchFriends(q);
        if (searchSeqRef.current !== seq) return;
        setSearchResults(res);
        setIsSearching(false);
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, searchFriends]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return friends;
    const merged = mergeFriendInfosById([friends, searchResults ?? []]);
    return merged.filter(
      (f) =>
        f.identity.displayName.toLowerCase().includes(q) ||
        f.identity.username.toLowerCase().includes(q)
    );
  }, [friends, searchQuery, searchResults]);

  const toggleSelection = useCallback((identityId: string) => {
    setSelectedIds((prev) =>
      prev.includes(identityId)
        ? prev.filter((id) => id !== identityId)
        : [...prev, identityId]
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedIds.length === 0 || creating) return;
    if (showDmExtras && conversationsLoading) return;
    setCreating(true);

    try {
      if (selectedIds.length === 1) {
        const peerId = selectedIds[0]!;
        const topic = conversationTopicOrName.trim();
        let conv = null;
        if (hasExistingDmWithPeer && startSeparateDm) {
          conv = await createDM(peerId, { forceNew: true, topic });
        } else if (hasExistingDmWithPeer && !startSeparateDm) {
          conv = await createDM(peerId);
        } else {
          conv = await createDM(peerId, { topic: topic || undefined });
        }
        if (conv) {
          navigate(`/conversations/${conv.id}`);
        }
      } else {
        const conv = await createGroup(selectedIds, conversationTopicOrName.trim() || undefined);
        if (conv) {
          navigate(`/conversations/${conv.id}`);
        }
      }
    } finally {
      setCreating(false);
    }
  }, [
    selectedIds,
    conversationTopicOrName,
    creating,
    createDM,
    createGroup,
    navigate,
    showDmExtras,
    conversationsLoading,
    hasExistingDmWithPeer,
    startSeparateDm,
  ]);

  const primaryDisabled =
    selectedIds.length === 0 ||
    creating ||
    (showDmExtras && conversationsLoading);

  return (
    <div className="new-conversation">
      <div className="new-conversation-header">
        <h2>{t('conversations.new', 'New Conversation')}</h2>
      </div>

      <div className="new-conversation-topic-name">
        <Input
          inputSize="md"
          placeholder={t(
            'conversations.conversationTopicOrNamePlaceholder',
            'Conversation topic or name (optional)'
          )}
          value={conversationTopicOrName}
          onChange={(e) => setConversationTopicOrName(e.target.value)}
          maxLength={100}
        />
      </div>

      <div className="new-conversation-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
          rightIcon={isSearching ? <span className="spinner spinner-sm" /> : undefined}
          placeholder={t('conversations.searchFriendsPlaceholder', 'Search friends...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="new-conversation-list">
        {filteredFriends.map((friend) => {
          const isSelected = selectedIds.includes(friend.identity.id);
          const initialSource = friend.identity.displayName || friend.identity.username || '?';
          return (
            <button
              key={friend.identity.id}
              type="button"
              className={`new-conversation-item${isSelected ? ' new-conversation-item-selected' : ''}`}
              onClick={() => toggleSelection(friend.identity.id)}
            >
              <div className="new-conversation-item-avatar">
                {friend.identity.avatarUrl ? (
                  <img
                    src={friend.identity.avatarUrl}
                    alt=""
                    className="new-conversation-item-avatar-img"
                  />
                ) : (
                  <span className="new-conversation-item-avatar-placeholder">
                    {initialSource.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="new-conversation-item-text">
                <span className="new-conversation-item-name">
                  {friend.identity.displayName}
                </span>
                <span className="new-conversation-item-username">
                  @{friend.identity.username}
                </span>
              </div>
              {isSelected && (
                <span className="new-conversation-item-check">
                  <Icon name="check" />
                </span>
              )}
            </button>
          );
        })}

        {filteredFriends.length === 0 && (
          <div className="new-conversation-empty">
            {searchQuery.trim()
              ? t('conversations.noMatchingFriends', 'No matching friends')
              : t('conversations.noFriendsToMessage', 'No friends to message. Add friends first!')}
          </div>
        )}
      </div>

      {showSeparateThreadSwitch && (
        <div className="new-conversation-dm-extras">
          <Switch.Root
            checked={startSeparateDm}
            disabled={!conversationTopicOrName.trim() && !startSeparateDm}
            onCheckedChange={(details) => {
              if (details.checked && !conversationTopicOrName.trim()) return;
              setStartSeparateDm(details.checked);
            }}
            className="sidebar-filter-switch new-conversation-dm-switch"
          >
            <Switch.Label className="sidebar-filter-switch-label">
              {t(
                'conversations.startSeparateDmLabel',
                'Start a new separate conversation instead of the existing one'
              )}
            </Switch.Label>
            <Switch.Control className="sidebar-filter-switch-control">
              <Switch.Thumb className="sidebar-filter-switch-thumb" />
            </Switch.Control>
            <Switch.HiddenInput />
          </Switch.Root>
        </div>
      )}

      {showFirstDmNote && (
        <div className="new-conversation-dm-extras new-conversation-dm-first-note">
          <p>
            {t(
              'conversations.firstDmWithFriendNote',
              'You have not messaged this person in a direct conversation before.'
            )}
          </p>
        </div>
      )}

      <div className="new-conversation-footer">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button variant="primary" onClick={handleCreate} disabled={primaryDisabled}>
          {creating ? (
            <span className="spinner spinner-sm" />
          ) : isGroup ? (
            t('conversations.createGroup', 'Create Group')
          ) : (
            t('conversations.startConversation', 'Start Conversation')
          )}
        </Button>
      </div>
    </div>
  );
}
