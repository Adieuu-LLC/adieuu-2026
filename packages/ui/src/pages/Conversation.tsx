/**
 * Conversation page for viewing and interacting with a conversation.
 * Displays messages with a toolbar and optional members sidebar.
 * Supports DM conversations with end-to-end encryption.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Conversation as ConversationType, PublicIdentity } from '@adieuu/shared';
import { createApiClient } from '@adieuu/shared';
import { Button } from '../components/Button';
import { AvatarGroup } from '../components/AvatarGroup';
import { XIcon, UsersIcon } from '../components/Icons';
import { MessageComposer } from '../components/MessageComposer';
import { useConversationsList } from '../hooks/useConversations';
import { useIdentity } from '../hooks/useIdentity';
import { useDmMessages, useSendDmMessage, type DecryptedDmMessage } from '../hooks/useDmMessages';
import { useMarkAsRead } from '../hooks/useMarkAsRead';
import { useDmSubscription } from '../hooks/useDmSubscription';
import { getCachedParticipant } from '../services/participantCache';
import { useAppConfig } from '../config';

function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

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

function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface ConversationToolbarProps {
  conversation?: ConversationType;
  otherParticipant?: PublicIdentity | null;
  showMembersSidebar: boolean;
  onToggleMembersSidebar: () => void;
  onClose: () => void;
}

function ConversationToolbar({
  conversation,
  otherParticipant,
  showMembersSidebar,
  onToggleMembersSidebar,
  onClose,
}: ConversationToolbarProps) {
  const { t } = useTranslation();

  const isDirect = !conversation || conversation.type === 'direct';
  const otherMember = otherParticipant ?? conversation?.members[0]?.identity;
  const memberIdentities = conversation?.members.map((m) => m.identity) ?? [];

  const title = isDirect
    ? otherMember?.displayName ?? t('conversation.unknown')
    : conversation?.customTitle ?? getGroupTitle(conversation?.members ?? []);

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
          {!isDirect && conversation && (
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
  conversation?: ConversationType;
  otherParticipant?: PublicIdentity | null;
}

function MembersSidebar({ conversation, otherParticipant }: MembersSidebarProps) {
  const { t } = useTranslation();
  const isDirect = !conversation || conversation.type === 'direct';
  const otherMember = otherParticipant ?? conversation?.members[0]?.identity;

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

  if (!conversation) return null;

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

interface MessageBubbleProps {
  message: DecryptedDmMessage;
  isOwn: boolean;
}

function MessageBubble({ message, isOwn }: MessageBubbleProps) {
  if (message.decryptionError) {
    return (
      <div className={`dm-message dm-message--error ${isOwn ? 'dm-message--own' : ''}`}>
        <div className="dm-message-bubble dm-message-bubble--error">
          <span className="dm-message-error-icon">!</span>
          <span>{message.decryptionError}</span>
        </div>
        <span className="dm-message-time">{formatMessageTime(message.raw.createdAt)}</span>
      </div>
    );
  }

  return (
    <div className={`dm-message ${isOwn ? 'dm-message--own' : ''}`}>
      <div className={`dm-message-bubble ${isOwn ? 'dm-message-bubble--own' : ''}`}>
        <p className="dm-message-text">{message.decrypted?.text}</p>
      </div>
      <span className="dm-message-time">{formatMessageTime(message.raw.createdAt)}</span>
    </div>
  );
}

interface ConversationMessagesProps {
  messages: DecryptedDmMessage[];
  isLoading: boolean;
  error: string | null;
  currentIdentityId: string | undefined;
  otherParticipantName?: string;
}

function ConversationMessages({
  messages,
  isLoading,
  error,
  currentIdentityId,
  otherParticipantName,
}: ConversationMessagesProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Messages come from API newest-first, reverse for display (oldest at top, newest at bottom)
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <div className="dm-messages">
      {isLoading && messages.length === 0 && (
        <div className="dm-messages-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}

      {error && (
        <div className="dm-messages-error">
          <p>{error}</p>
        </div>
      )}

      {!isLoading && messages.length === 0 && (
        <div className="dm-messages-empty">
          <p>{t('conversation.noMessages', { name: otherParticipantName ?? 'them' })}</p>
        </div>
      )}

      {displayMessages.map((msg) => (
        <MessageBubble
          key={msg.raw.id}
          message={msg}
          isOwn={msg.decrypted?.fromIdentityId === currentIdentityId}
        />
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
}

interface ConversationInputProps {
  onSend: (text: string, expiresInSeconds?: number | null) => Promise<void>;
  isSending: boolean;
  error: string | null;
}

function ConversationInput({ onSend, isSending, error }: ConversationInputProps) {
  return (
    <div className="dm-input-container">
      {error && (
        <div className="dm-input-error">
          <span>{error}</span>
        </div>
      )}
      <MessageComposer
        onSend={(data) => onSend(data.text, data.expiresInSeconds)}
        isSending={isSending}
        showTtlSelector={true}
      />
    </div>
  );
}

export function Conversation() {
  const { t } = useTranslation();
  const { id: conversationId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const recipientIdFromUrl = searchParams.get('recipient');
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus, identity } = useIdentity();
  const { conversations, isLoading: conversationsLoading, refresh: refreshConversations } = useConversationsList();
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [otherParticipant, setOtherParticipant] = useState<PublicIdentity | null>(null);
  const [otherParticipantId, setOtherParticipantId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const isLoggedIn = identityStatus === 'logged_in' && identity !== null;

  // Find conversation in list (if exists)
  const conversation = useMemo(() => {
    return conversations.find((c) => c.id === conversationId);
  }, [conversations, conversationId]);

  // Initialize: get other participant info
  useEffect(() => {
    if (!isLoggedIn || !conversationId || !identity) {
      setIsInitializing(false);
      return;
    }

    const init = async () => {
      setIsInitializing(true);
      const api = createApiClient({ baseUrl: apiBaseUrl });

      // If conversation exists in list, use that
      if (conversation && conversation.members[0]?.identity) {
        setOtherParticipant(conversation.members[0].identity);
        setOtherParticipantId(conversation.members[0].identity.id);
        setIsInitializing(false);
        return;
      }

      // Try participant cache
      try {
        const cached = await getCachedParticipant(identity.id, conversationId);
        if (cached) {
          setOtherParticipantId(cached.otherIdentityId);

          // Fetch full identity info
          const response = await api.identity.getById(cached.otherIdentityId);
          if (response.success && response.data) {
            setOtherParticipant(response.data);
            setIsInitializing(false);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to get participant from cache:', err);
      }

      // For new conversations, use recipient ID from URL
      if (recipientIdFromUrl) {
        setOtherParticipantId(recipientIdFromUrl);
        try {
          const response = await api.identity.getById(recipientIdFromUrl);
          if (response.success && response.data) {
            setOtherParticipant(response.data);
          }
        } catch (err) {
          console.error('Failed to fetch recipient info:', err);
        }
      }

      setIsInitializing(false);
    };

    init();
  }, [apiBaseUrl, conversation, conversationId, identity, isLoggedIn, recipientIdFromUrl]);

  // Fetch messages
  const {
    messages,
    isLoading: messagesLoading,
    error: messagesError,
    refresh: refreshMessages,
  } = useDmMessages({
    conversationId: conversationId ?? '',
    immediate: !!conversationId && isLoggedIn,
  });

  // Send message hook
  const { sendMessage, isSending, error: sendError } = useSendDmMessage();

  // Mark as read hook
  const { markAsRead } = useMarkAsRead();

  // Subscribe to real-time updates
  useDmSubscription({
    conversationId: conversationId ?? undefined,
    onNewMessage: () => {
      refreshMessages();
      refreshConversations();
    },
    onDeleted: () => {
      refreshMessages();
      refreshConversations();
    },
  });

  // Mark as read when viewing messages
  // Messages are returned newest-first from API, so messages[0] is the newest
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;

    const newestMessage = messages[0];
    if (newestMessage?.raw?.id) {
      markAsRead(conversationId, newestMessage.raw.id);
    }
  }, [conversationId, messages, markAsRead]);

  const handleClose = () => {
    navigate('/');
  };

  const handleToggleMembersSidebar = () => {
    setShowMembersSidebar((prev) => !prev);
  };

  const handleSendMessage = useCallback(async (text: string, expiresInSeconds?: number | null) => {
    if (!otherParticipantId) return;

    const result = await sendMessage({
      toIdentityId: otherParticipantId,
      text,
      expiresInSeconds: expiresInSeconds ?? undefined,
    });

    if (result.success) {
      refreshMessages();
      refreshConversations();
    }
  }, [otherParticipantId, refreshConversations, refreshMessages, sendMessage]);

  if (!isLoggedIn) {
    return (
      <div className="dm-page">
        <div className="dm-error">
          <p>{t('conversation.loginRequired')}</p>
        </div>
      </div>
    );
  }

  if (conversationsLoading || isInitializing) {
    return (
      <div className="dm-page">
        <div className="dm-loading">
          <span className="spinner spinner-md" />
        </div>
      </div>
    );
  }

  // For DMs, we allow viewing even if conversation doesn't exist yet (new conversation)
  // We just need the other participant info
  const effectiveOtherParticipant = otherParticipant ?? conversation?.members[0]?.identity;
  const effectiveOtherParticipantId = otherParticipantId ?? conversation?.members[0]?.identity?.id;

  if (!effectiveOtherParticipantId) {
    return (
      <div className="dm-page">
        <div className="dm-error">
          <p>{t('conversation.notFound')}</p>
          <Button variant="secondary" onClick={handleClose}>
            {t('conversation.goHome')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dm-page">
      <div className="dm-container">
        <ConversationToolbar
          conversation={conversation}
          otherParticipant={effectiveOtherParticipant}
          showMembersSidebar={showMembersSidebar}
          onToggleMembersSidebar={handleToggleMembersSidebar}
          onClose={handleClose}
        />
        <div className="conversation-body">
          <div className="conversation-main">
            <ConversationMessages
              messages={messages}
              isLoading={messagesLoading}
              error={messagesError}
              currentIdentityId={identity?.id}
              otherParticipantName={effectiveOtherParticipant?.displayName}
            />
            <ConversationInput
              onSend={handleSendMessage}
              isSending={isSending}
              error={sendError}
            />
          </div>
          {showMembersSidebar && (
            <MembersSidebar
              conversation={conversation}
              otherParticipant={effectiveOtherParticipant}
            />
          )}
        </div>
      </div>
    </div>
  );
}
