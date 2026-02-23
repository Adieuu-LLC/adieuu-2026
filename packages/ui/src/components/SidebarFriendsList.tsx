/**
 * Friends list component for the sidebar.
 * Displays a scrollable list of the current identity's friends.
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useFriendsList } from '../hooks/useFriends';
import { useIdentity } from '../hooks/useIdentity';
import { useSidebar } from './Sidebar';
import { FriendListItem } from './FriendListItem';
import { Spinner } from './Spinner';

/**
 * Displays the current identity's friends in the sidebar.
 * Shows loading state, empty state, or list of friends.
 */
export function SidebarFriendsList() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { closeMobile, isExpanded } = useSidebar();
  const { friends, isLoading, error } = useFriendsList({ limit: 50 });

  const isLoggedIn = identityStatus === 'logged_in';

  if (!isLoggedIn) {
    return (
      <div className="sidebar-friends-empty">
        {isExpanded && <p>{t('sidebar.friends.loginRequired')}</p>}
      </div>
    );
  }

  if (isLoading && friends.length === 0) {
    return (
      <div className="sidebar-friends-loading">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="sidebar-friends-error">
        {isExpanded && <p>{t('sidebar.friends.error')}</p>}
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="sidebar-friends-empty">
        {isExpanded && (
          <>
            <p>{t('sidebar.friends.empty')}</p>
            <Link to="/search" onClick={closeMobile} className="sidebar-friends-find-link">
              {t('sidebar.friends.findFriends')}
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar-friends-list">
      {friends.map((friend) => (
        <FriendListItem
          key={friend.identity.id}
          friend={friend}
          onNavigate={closeMobile}
        />
      ))}
    </div>
  );
}
