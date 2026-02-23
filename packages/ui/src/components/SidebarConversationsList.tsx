/**
 * Conversations list component for the sidebar.
 * Displays a scrollable list of the current identity's conversations.
 */

import { useTranslation } from 'react-i18next';
import { useConversationsList } from '../hooks/useConversations';
import { useIdentity } from '../hooks/useIdentity';
import { useSidebar } from './Sidebar';
import { ConversationListItem } from './ConversationListItem';
import { Spinner } from './Spinner';

/**
 * Displays the current identity's conversations in the sidebar.
 * Shows loading state, empty state, or list of conversations.
 */
export function SidebarConversationsList() {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { closeMobile, isExpanded } = useSidebar();
  const { conversations, isLoading, error } = useConversationsList({ limit: 50 });

  const isLoggedIn = identityStatus === 'logged_in';

  if (!isLoggedIn) {
    return (
      <div className="sidebar-conversations-empty">
        {isExpanded && <p>{t('sidebar.conversations.loginRequired')}</p>}
      </div>
    );
  }

  if (isLoading && conversations.length === 0) {
    return (
      <div className="sidebar-conversations-loading">
        <Spinner size="sm" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="sidebar-conversations-error">
        {isExpanded && <p>{t('sidebar.conversations.error')}</p>}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="sidebar-conversations-empty">
        {isExpanded && (
          <p>{t('sidebar.conversations.empty')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar-conversations-list">
      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          onNavigate={closeMobile}
        />
      ))}
    </div>
  );
}
