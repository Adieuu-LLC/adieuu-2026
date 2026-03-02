/**
 * Conversation page for viewing and interacting with a conversation.
 * Displays messages with a toolbar and optional members sidebar.
 * Supports DM conversations with end-to-end encryption.
 */

import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Conversation as ConversationType, PublicIdentity } from '@adieuu/shared';
import { createApiClient } from '@adieuu/shared';
import { Button } from '../components/Button';
import { AvatarGroup } from '../components/AvatarGroup';
import { XIcon, UsersIcon } from '../components/Icons';
import { MessageComposer } from '../components/MessageComposer';
import { Popover } from '../components/Popover';
import { useConversationsList } from '../hooks/useConversations';
import { useConversationsContext } from '../hooks/ConversationsProvider';
import { useIdentity } from '../hooks/useIdentity';
import { useDmMessages, useSendDmMessage, type DecryptedDmMessage } from '../hooks/useDmMessages';
import { useDmSubscription, type DmNewMessageEvent, type DmDeletedEvent } from '../hooks/useDmSubscription';
import { useDeleteMessage } from '../hooks/useDeleteMessage';
import { useDocumentVisibility } from '../hooks/useDocumentVisibility';
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

/**
 * Format remaining time until expiration.
 */
function formatRemainingTime(expiresAt: string): string | null {
  const expiresAtMs = new Date(expiresAt).getTime();
  const now = Date.now();
  const remainingMs = expiresAtMs - now;

  if (remainingMs <= 0) return null;

  const seconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

/**
 * Hook to get remaining time until expiration, updating every second.
 */
function useExpiryCountdown(expiresAt: string | undefined): string | null {
  const [remaining, setRemaining] = useState<string | null>(() => {
    if (!expiresAt) return null;
    return formatRemainingTime(expiresAt);
  });

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }

    const updateRemaining = () => {
      const formatted = formatRemainingTime(expiresAt);
      setRemaining(formatted);
    };

    updateRemaining();
    const intervalId = setInterval(updateRemaining, 1000);

    return () => clearInterval(intervalId);
  }, [expiresAt]);

  return remaining;
}

interface MessageBubbleProps {
  message: DecryptedDmMessage;
  isOwn: boolean;
  onDeleteForEveryone?: (messageId: string) => void;
  onDeleteForSelf?: (messageId: string) => void;
  isDeleting?: boolean;
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  onDeleteForEveryone,
  onDeleteForSelf,
  isDeleting,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const expiryCountdown = useExpiryCountdown(message.raw.expiresAt);

  const showActions = isHovered || isPopoverOpen;

  const handleDeleteForEveryone = useCallback(() => {
    if (onDeleteForEveryone && message.raw.id) {
      onDeleteForEveryone(message.raw.id);
    }
  }, [onDeleteForEveryone, message.raw.id]);

  const handleDeleteForSelf = useCallback(() => {
    if (onDeleteForSelf && message.raw.id) {
      onDeleteForSelf(message.raw.id);
    }
  }, [onDeleteForSelf, message.raw.id]);

  const hasActions = (isOwn && onDeleteForEveryone) || onDeleteForSelf;

  if (message.isDeleted) {
    return (
      <div className={`dm-message dm-message--deleted ${isOwn ? 'dm-message--own' : ''}`}>
        <div className="dm-message-bubble dm-message-bubble--deleted">
          <span className="dm-message-deleted-text">{t('messages.deleted')}</span>
        </div>
        <span className="dm-message-time">{formatMessageTime(message.raw.createdAt)}</span>
      </div>
    );
  }

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
    <div
      className={`dm-message ${isOwn ? 'dm-message--own' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`dm-message-bubble ${isOwn ? 'dm-message-bubble--own' : ''}`}>
        <p className="dm-message-text">{message.decrypted?.text}</p>
      </div>
      <div className="dm-message-footer">
        <span className="dm-message-time">{formatMessageTime(message.raw.createdAt)}</span>
        {expiryCountdown && (
          <span className="dm-message-expiry" title={t('messages.expiresIn')}>
            {expiryCountdown}
          </span>
        )}
        {hasActions && showActions && (
          <Popover
            trigger={
              <button
                className="dm-message-actions-btn"
                aria-label={t('messages.actions')}
                disabled={isDeleting}
              >
                <span className="dm-message-actions-icon">...</span>
              </button>
            }
            positioning={{ placement: isOwn ? 'bottom-end' : 'bottom-start' }}
            onOpenChange={setIsPopoverOpen}
          >
            <div className="dm-message-actions-menu">
              {isOwn && onDeleteForEveryone && (
                <button
                  className="dm-message-actions-item dm-message-actions-item--danger"
                  onClick={handleDeleteForEveryone}
                  disabled={isDeleting}
                >
                  {t('messages.deleteForEveryone')}
                </button>
              )}
              {onDeleteForSelf && (
                <button
                  className="dm-message-actions-item"
                  onClick={handleDeleteForSelf}
                  disabled={isDeleting}
                >
                  {t('messages.deleteForMe')}
                </button>
              )}
            </div>
          </Popover>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to avoid re-renders when callbacks change reference
  return (
    prevProps.message.raw.id === nextProps.message.raw.id &&
    prevProps.message.isDeleted === nextProps.message.isDeleted &&
    prevProps.message.decrypted?.text === nextProps.message.decrypted?.text &&
    prevProps.message.decryptionError === nextProps.message.decryptionError &&
    prevProps.message.raw.expiresAt === nextProps.message.raw.expiresAt &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.isDeleting === nextProps.isDeleting
  );
});

interface ConversationMessagesProps {
  messages: DecryptedDmMessage[];
  isLoading: boolean;
  error: string | null;
  currentIdentityId: string | undefined;
  otherParticipantName?: string;
  onDeleteForEveryone?: (messageId: string) => void;
  onDeleteForSelf?: (messageId: string) => void;
  isDeleting?: boolean;
}

const ConversationMessages = memo(function ConversationMessages({
  messages,
  isLoading,
  error,
  currentIdentityId,
  otherParticipantName,
  onDeleteForEveryone,
  onDeleteForSelf,
  isDeleting,
}: ConversationMessagesProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 80;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }, []);

  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (prevCount === 0 && messages.length > 0) {
      // Initial load: jump to bottom instantly
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isNearBottomRef.current = true;
    } else if (messages.length > prevCount && isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Messages come from API newest-first, reverse for display (oldest at top, newest at bottom)
  const displayMessages = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <div className="dm-messages" ref={containerRef} onScroll={handleScroll}>
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
          onDeleteForEveryone={onDeleteForEveryone}
          onDeleteForSelf={onDeleteForSelf}
          isDeleting={isDeleting}
        />
      ))}

      <div ref={messagesEndRef} />
    </div>
  );
});

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
  const { conversations, isLoading: conversationsLoading, markConversationRead } = useConversationsList();
  const { dmConversations } = useConversationsContext();
  const { isVisible, isVisibleRef } = useDocumentVisibility();
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [otherParticipant, setOtherParticipant] = useState<PublicIdentity | null>(null);
  const [otherParticipantId, setOtherParticipantId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const isLoggedIn = identityStatus === 'logged_in' && identity !== null;

  // Find conversation in list (if exists)
  const conversation = useMemo(() => {
    return conversations.find((c) => c.id === conversationId);
  }, [conversations, conversationId]);

  // Get the crypto profile for this conversation (needed for read state encryption)
  const cryptoProfile = useMemo(() => {
    const dm = dmConversations.find((c) => c.conversationId === conversationId);
    return dm?.cryptoProfile ?? 'default';
  }, [dmConversations, conversationId]);

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
    appendNewMessage,
    removeMessage,
  } = useDmMessages({
    conversationId: conversationId ?? '',
    immediate: !!conversationId && isLoggedIn,
  });

  // Send message hook
  const { sendMessage, isSending, error: sendError } = useSendDmMessage();

  // Delete message hook
  const { deleteForEveryone, deleteForSelf, isDeleting } = useDeleteMessage();

  // Subscribe to real-time updates for THIS conversation only.
  // The ConversationsProvider handles global list updates separately.
  useDmSubscription({
    conversationId: conversationId ?? undefined,
    onNewMessage: useCallback(
      (event: DmNewMessageEvent) => {
        appendNewMessage(event.payload.message);
        if (conversationId && isVisibleRef.current) {
          markConversationRead(conversationId, event.payload.message.id, cryptoProfile);
        }
      },
      [appendNewMessage, conversationId, cryptoProfile, isVisibleRef, markConversationRead]
    ),
    onDeleted: useCallback(
      (event: DmDeletedEvent) => {
        removeMessage(event.payload.messageId);
      },
      [removeMessage]
    ),
    onReconnect: useCallback(() => {
      refreshMessages();
    }, [refreshMessages]),
  });

  // Mark as read when viewing messages or tab becomes visible again
  useEffect(() => {
    if (!conversationId || messages.length === 0 || !isVisible) return;

    const newestMessage = messages[0];
    if (newestMessage?.raw?.id) {
      markConversationRead(conversationId, newestMessage.raw.id, cryptoProfile);
    }
  }, [conversationId, messages, isVisible, cryptoProfile, markConversationRead]);

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

    if (result.success && result.message) {
      appendNewMessage(result.message);
    }
  }, [otherParticipantId, appendNewMessage, sendMessage]);

  const handleDeleteForEveryone = useCallback(async (messageId: string) => {
    const result = await deleteForEveryone(messageId);
    if (result.success) {
      removeMessage(messageId);
    }
  }, [deleteForEveryone, removeMessage]);

  const handleDeleteForSelf = useCallback(async (messageId: string) => {
    const result = await deleteForSelf(messageId);
    if (result.success) {
      removeMessage(messageId);
    }
  }, [deleteForSelf, removeMessage]);

  if (!isLoggedIn) {
    return (
      <div className="dm-page">
        <div className="dm-error">
          <p>{t('conversation.loginRequired')}</p>
        </div>
      </div>
    );
  }

  if ((conversationsLoading && conversations.length === 0) || isInitializing) {
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
              onDeleteForEveryone={handleDeleteForEveryone}
              onDeleteForSelf={handleDeleteForSelf}
              isDeleting={isDeleting}
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
