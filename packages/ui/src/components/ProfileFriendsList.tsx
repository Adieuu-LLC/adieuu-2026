/**
 * Friends list panel for profile content tabs.
 *
 * Renders a grid of identity cards for the profile owner's friends,
 * with a search input to filter by username or display name.
 * Shows a placeholder when the list is hidden by privacy settings or empty.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { FriendInfo } from '@adieuu/shared';
import { IdentityCard } from './IdentityCard';
import { Input } from './Input';
import { Icon } from '../icons/Icon';

export interface ProfileFriendsListProps {
  friends: FriendInfo[];
  hidden: boolean;
  loading: boolean;
}

export function ProfileFriendsList({ friends, hidden, loading }: ProfileFriendsListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => {
      const name = f.identity.displayName.toLowerCase();
      const user = f.identity.username.toLowerCase();
      return name.includes(q) || user.includes(q);
    });
  }, [friends, searchQuery]);

  if (loading) {
    return (
      <div className="profile-friends-list profile-friends-list--loading">
        <div className="spinner spinner-sm" />
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsLoading')}
        </p>
      </div>
    );
  }

  if (hidden) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsHidden')}
      </p>
    );
  }

  if (friends.length === 0) {
    return (
      <p className="profile-view-tab-placeholder">
        {t('identity.profileView.friendsEmpty')}
      </p>
    );
  }

  return (
    <div className="profile-friends-list">
      <div className="profile-friends-list-search">
        <Input
          inputSize="sm"
          leftIcon={<Icon name="search" />}
          placeholder={t('identity.profileView.friendsSearch')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="profile-view-tab-placeholder">
          {t('identity.profileView.friendsNoResults')}
        </p>
      ) : (
        <div className="profile-friends-list-grid">
          {filtered.map((friend) => (
            <IdentityCard
              key={friend.identity.id}
              identity={friend.identity}
              showFriendAction={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
