/**
 * Conversation page for viewing and interacting with a conversation.
 * Displays messages with a toolbar and optional members sidebar.
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Conversation as ConversationType, PublicIdentity } from '@adieuu/shared';
import { Button } from '../components/Button';
import { Avatar } from '../components/Avatar';
import { AvatarGroup } from '../components/AvatarGroup';
import { XIcon, UsersIcon } from '../components/Icons';
import { useConversationsList } from '../hooks/useConversations';
import { useIdentity } from '../hooks/useIdentity';

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

interface ConversationToolbarProps {
  conversation: ConversationType;
  showMembersSidebar: boolean;
  onToggleMembersSidebar: () => void;
  onClose: () => void;
}

function ConversationToolbar({
  conversation,
  showMembersSidebar,
  onToggleMembersSidebar,
  onClose,
}: ConversationToolbarProps) {
  const { t } = useTranslation();
  const isDirect = conversation.type === 'direct';
  const otherMember = isDirect ? conversation.members[0]?.identity : null;
  const memberIdentities = conversation.members.map((m) => m.identity);

  const title = isDirect
    ? otherMember?.displayName ?? t('conversation.unknown')
    : conversation.customTitle ?? getGroupTitle(conversation.members);

  return (
    <div className="conversation-toolbar">
      <div className="conversation-toolbar-left">
        {isDirect && otherMember ? (
          <Link to={`/profile/${otherMember.username}`} className="conversation-toolbar-avatar-link">
            <div className="conversation-toolbar-avatar">
              {otherMember.avatarUrl ? (
                <img
                  src={otherMember.avatarUrl}
                  alt={otherMember.displayName}
                  className="conversation-toolbar-avatar-img"
                />
              ) : (
                <span className="conversation-toolbar-avatar-placeholder">
                  {getInitials(otherMember.displayName)}
                </span>
              )}
            </div>
          </Link>
        ) : (
          <AvatarGroup members={memberIdentities} maxVisible={3} size="sm" />
        )}
        <div className="conversation-toolbar-info">
          <span className="conversation-toolbar-title">{title}</span>
          {!isDirect && (
            <span className="conversation-toolbar-subtitle">
              {t('conversation.memberCount', { count: conversation.members.length })}
            </span>
          )}
          {isDirect && otherMember && (
            <span className="conversation-toolbar-subtitle">
              @{otherMember.username}
            </span>
          )}
        </div>
      </div>
      <div className="conversation-toolbar-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleMembersSidebar}
          className={`conversation-toolbar-btn ${showMembersSidebar ? 'active' : ''}`}
          title={t('conversation.toggleMembers')}
        >
          <UsersIcon />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="conversation-toolbar-btn"
          title={t('conversation.close')}
        >
          <XIcon />
        </Button>
      </div>
    </div>
  );
}

interface MembersSidebarProps {
  conversation: ConversationType;
}

function MembersSidebar({ conversation }: MembersSidebarProps) {
  const { t } = useTranslation();
  const isDirect = conversation.type === 'direct';
  const otherMember = isDirect ? conversation.members[0]?.identity : null;

  if (isDirect && otherMember) {
    return (
      <div className="conversation-members-sidebar">
        <div className="conversation-members-header">
          <h3>{t('conversation.profile')}</h3>
        </div>
        <div className="conversation-member-profile">
          <div className="conversation-member-profile-avatar">
            {otherMember.avatarUrl ? (
              <img
                src={otherMember.avatarUrl}
                alt={otherMember.displayName}
                className="conversation-member-profile-avatar-img"
              />
            ) : (
              <span className="conversation-member-profile-avatar-placeholder">
                {getInitials(otherMember.displayName)}
              </span>
            )}
          </div>
          <div className="conversation-member-profile-info">
            <span className="conversation-member-profile-name">
              {otherMember.displayName}
            </span>
            <span className="conversation-member-profile-username">
              @{otherMember.username}
            </span>
            {otherMember.bio && (
              <p className="conversation-member-profile-bio">{otherMember.bio}</p>
            )}
          </div>
          <Link to={`/profile/${otherMember.username}`} className="conversation-member-profile-link">
            <Button variant="secondary" size="sm">
              {t('conversation.viewProfile')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-members-sidebar">
      <div className="conversation-members-header">
        <h3>{t('conversation.members')}</h3>
        <span className="conversation-members-count">{conversation.members.length}</span>
      </div>
      <div className="conversation-members-list">
        {conversation.members.map((member) => (
          <Link
            key={member.identity.id}
            to={`/profile/${member.identity.username}`}
            className="conversation-member-item"
          >
            <div className="conversation-member-avatar">
              {member.identity.avatarUrl ? (
                <img
                  src={member.identity.avatarUrl}
                  alt={member.identity.displayName}
                  className="conversation-member-avatar-img"
                />
              ) : (
                <span className="conversation-member-avatar-placeholder">
                  {getInitials(member.identity.displayName)}
                </span>
              )}
            </div>
            <div className="conversation-member-info">
              <span className="conversation-member-name">{member.identity.displayName}</span>
              <span className="conversation-member-username">@{member.identity.username}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ConversationMessages() {
  const { t } = useTranslation();

  return (
    <div className="conversation-messages">
      <div className="conversation-messages-empty">
        <p>{t('conversation.messagesPlaceholder')}</p>
      </div>
    </div>
  );
}

function ConversationInput() {
  const { t } = useTranslation();

  return (
    <div className="conversation-input">
      <input
        type="text"
        placeholder={t('conversation.inputPlaceholder')}
        className="conversation-input-field"
        disabled
      />
      <Button variant="primary" size="sm" disabled>
        {t('conversation.send')}
      </Button>
    </div>
  );
}

export function Conversation() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { status: identityStatus } = useIdentity();
  const { conversations, isLoading } = useConversationsList();
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);

  const isLoggedIn = identityStatus === 'logged_in';

  const conversation = useMemo(() => {
    return conversations.find((c) => c.id === id);
  }, [conversations, id]);

  const handleClose = () => {
    navigate('/');
  };

  const handleToggleMembersSidebar = () => {
    setShowMembersSidebar((prev) => !prev);
  };

  if (!isLoggedIn) {
    return (
      <div className="conversation-page">
        <div className="conversation-not-found">
          <p>{t('conversation.loginRequired')}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="conversation-page">
        <div className="conversation-loading">
          <span className="spinner spinner-md" />
        </div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="conversation-page">
        <div className="conversation-not-found">
          <p>{t('conversation.notFound')}</p>
          <Button variant="secondary" onClick={handleClose}>
            {t('conversation.goHome')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="conversation-page">
      <div className="conversation-container">
        <ConversationToolbar
          conversation={conversation}
          showMembersSidebar={showMembersSidebar}
          onToggleMembersSidebar={handleToggleMembersSidebar}
          onClose={handleClose}
        />
        <div className="conversation-body">
          <div className="conversation-main">
            <ConversationMessages />
            <ConversationInput />
          </div>
          {showMembersSidebar && (
            <MembersSidebar conversation={conversation} />
          )}
        </div>
      </div>
    </div>
  );
}
