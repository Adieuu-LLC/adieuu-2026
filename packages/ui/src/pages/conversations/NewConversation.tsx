/**
 * New Conversation Page
 *
 * Allows the user to start a new DM or group conversation
 * by selecting friends from their friends list.
 */

import { useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations } from '../../hooks/useConversations';
import { useFriends } from '../../hooks/useFriends';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';

interface NewConversationLocationState {
  preSelectedIds?: string[];
}

export function NewConversation() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { createDM, createGroup } = useConversations();
  const { friends } = useFriends();

  const locationState = location.state as NewConversationLocationState | null;
  const [selectedIds, setSelectedIds] = useState<string[]>(
    () => locationState?.preSelectedIds ?? []
  );
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const isGroup = selectedIds.length > 1;

  const filteredFriends = searchQuery.trim()
    ? friends.filter(
        (f) =>
          f.identity.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.identity.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends;

  const toggleSelection = useCallback((identityId: string) => {
    setSelectedIds((prev) =>
      prev.includes(identityId)
        ? prev.filter((id) => id !== identityId)
        : [...prev, identityId]
    );
  }, []);

  const handleCreate = useCallback(async () => {
    if (selectedIds.length === 0 || creating) return;
    setCreating(true);

    try {
      if (selectedIds.length === 1) {
        const conv = await createDM(selectedIds[0]!);
        if (conv) {
          navigate(`/conversations/${conv.id}`);
        }
      } else {
        const conv = await createGroup(selectedIds, groupName.trim() || undefined);
        if (conv) {
          navigate(`/conversations/${conv.id}`);
        }
      }
    } finally {
      setCreating(false);
    }
  }, [selectedIds, groupName, creating, createDM, createGroup, navigate]);

  return (
    <div className="new-conversation">
      <div className="new-conversation-header">
        <h2>{t('conversations.new', 'New Conversation')}</h2>
      </div>

      {isGroup && (
        <div className="new-conversation-group-name">
          <Input
            inputSize="md"
            placeholder={t('conversations.groupNamePlaceholder', 'Group name (optional)')}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={100}
          />
        </div>
      )}

      <div className="new-conversation-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
          placeholder={t('conversations.searchFriendsPlaceholder', 'Search friends...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="new-conversation-list">
        {filteredFriends.map((friend) => {
          const isSelected = selectedIds.includes(friend.identity.id);
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
                    {friend.identity.displayName.charAt(0).toUpperCase()}
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
            {searchQuery
              ? t('conversations.noMatchingFriends', 'No matching friends')
              : t('conversations.noFriendsToMessage', 'No friends to message. Add friends first!')}
          </div>
        )}
      </div>

      <div className="new-conversation-footer">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleCreate}
          disabled={selectedIds.length === 0 || creating}
        >
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
