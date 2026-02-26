/**
 * Conversation list item component for displaying a conversation in the sidebar.
 * Shows avatar(s), conversation title, and unread badge.
 */

import { Link, useLocation } from 'react-router-dom';
import type { Conversation, PublicIdentity } from '@adieuu/shared';
import { useSidebar } from './Sidebar';
import { AvatarGroup } from './AvatarGroup';

export interface ConversationListItemProps {
  /** Conversation data */
  conversation: Conversation;
  /** Callback when navigating (to close mobile sidebar) */
  onNavigate?: () => void;
}

/**
 * Gets initials from a display name for avatar placeholder.
 */
function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Generates a display title for a group conversation.
 * Shows first 2 names alphabetically + overflow count if > 3 members.
 */
function getGroupTitle(members: { identity: PublicIdentity }[]): string {
  if (members.length === 0) return 'Empty conversation';

  const sortedNames = members
    .map((m) => m.identity.displayName)
    .sort((a, b) => a.localeCompare(b));

  if (members.length <= 3) {
    return sortedNames.join(', ');
  }

  const firstTwo = sortedNames.slice(0, 2);
  const overflow = members.length - 2;
  return `${firstTwo.join(', ')} +${overflow}`;
}

/**
 * Conversation list item that displays differently for direct vs group chats.
 */
export function ConversationListItem({
  conversation,
  onNavigate,
}: ConversationListItemProps) {
  const { isExpanded } = useSidebar();
  const location = useLocation();
  const { id, type, members, customTitle, unreadCount } = conversation;

  const handleClick = () => {
    onNavigate?.();
  };

  const isDirect = type === 'direct';
  const otherMember = isDirect ? members[0]?.identity : null;
  const isActive = location.pathname === `/conversation/${id}`;

  const title = isDirect
    ? otherMember?.displayName ?? 'Unknown'
    : customTitle ?? getGroupTitle(members);

  const memberIdentities = members.map((m) => m.identity);

  return (
    <Link
      to={`/conversation/${id}`}
      className={`conversation-list-item ${isActive ? 'conversation-list-item-active' : ''}`}
      onClick={handleClick}
    >
      {isDirect && otherMember ? (
        <div className="conversation-list-item-avatar">
          {otherMember.avatarUrl ? (
            <img
              src={otherMember.avatarUrl}
              alt={otherMember.displayName}
              className="conversation-list-item-avatar-img"
            />
          ) : (
            <span className="conversation-list-item-avatar-placeholder">
              {getInitials(otherMember.displayName)}
            </span>
          )}
        </div>
      ) : (
        <AvatarGroup members={memberIdentities} maxVisible={3} size="sm" />
      )}

      {isExpanded && (
        <div className="conversation-list-item-info">
          <span className="conversation-list-item-title">{title}</span>
          {!isDirect && (
            <span className="conversation-list-item-members">
              {members.length} members
            </span>
          )}
        </div>
      )}

      {unreadCount > 0 && (
        <span className="conversation-list-item-badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
