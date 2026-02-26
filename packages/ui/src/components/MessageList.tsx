/**
 * MessageList Component
 *
 * Displays a list of decrypted DM messages with support for:
 * - Message grouping by sender
 * - Timestamps and read status
 * - Error states for failed decryption
 * - Loading states and infinite scroll
 * - Message actions (delete)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecryptedDmMessage } from '../hooks/useDmMessages';
import { Avatar } from './Avatar';
import { Spinner } from './Spinner';
import { Popover } from './Popover';

/**
 * Formats a date for display in message timestamps.
 */
function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Gets initials from a display name.
 */
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export interface MessageListProps {
  /** Array of decrypted messages to display */
  messages: DecryptedDmMessage[];
  /** Current user's identity ID for determining message alignment */
  currentIdentityId: string;
  /** Whether currently loading messages */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Whether there are more messages to load */
  hasMore: boolean;
  /** Callback to load more messages */
  onLoadMore: () => void;
  /** Optional callback when a message is clicked */
  onMessageClick?: (message: DecryptedDmMessage) => void;
  /** Callback to delete message for everyone (sender only) */
  onDeleteForEveryone?: (messageId: string) => void;
  /** Callback to delete message for self only */
  onDeleteForSelf?: (messageId: string) => void;
  /** Whether a delete operation is in progress */
  isDeleting?: boolean;
}

interface MessageBubbleProps {
  message: DecryptedDmMessage;
  isOwn: boolean;
  showAvatar: boolean;
  senderName?: string;
  onDeleteForEveryone?: (messageId: string) => void;
  onDeleteForSelf?: (messageId: string) => void;
  isDeleting?: boolean;
}

function MessageBubble({
  message,
  isOwn,
  showAvatar,
  senderName,
  onDeleteForEveryone,
  onDeleteForSelf,
  isDeleting,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);

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
      <div className={`message-bubble message-bubble--deleted ${isOwn ? 'message-bubble--own' : ''}`}>
        <div className="message-bubble-content">
          <span className="message-deleted-text">
            {t('messages.deleted')}
          </span>
        </div>
        <span className="message-time">{formatMessageTime(message.raw.createdAt)}</span>
      </div>
    );
  }

  if (message.decryptionError || !message.decrypted) {
    return (
      <div className={`message-bubble message-bubble--error ${isOwn ? 'message-bubble--own' : ''}`}>
        <div className="message-bubble-content">
          <span className="message-error-icon">!</span>
          <span className="message-error-text">
            {message.decryptionError ?? t('messages.decryptionFailed')}
          </span>
        </div>
        <span className="message-time">{formatMessageTime(message.raw.createdAt)}</span>
      </div>
    );
  }

  return (
    <div
      className={`message-bubble ${isOwn ? 'message-bubble--own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {showAvatar && !isOwn && (
        <div className="message-avatar">
          <Avatar
            size="sm"
            fallbackInitial={senderName ? getInitials(senderName).charAt(0) : '?'}
          />
        </div>
      )}
      <div className="message-content-wrapper">
        {showAvatar && !isOwn && senderName && (
          <span className="message-sender-name">{senderName}</span>
        )}
        <div className="message-bubble-content">
          <p className="message-text">{message.decrypted.text}</p>
        </div>
        <div className="message-footer">
          <span className="message-time">{formatMessageTime(message.raw.createdAt)}</span>
          {hasActions && showActions && (
            <Popover
              trigger={
                <button
                  className="message-actions-btn"
                  aria-label={t('messages.actions')}
                  disabled={isDeleting}
                >
                  <span className="message-actions-icon">...</span>
                </button>
              }
              positioning={{ placement: isOwn ? 'bottom-end' : 'bottom-start' }}
            >
              <div className="message-actions-menu">
                {isOwn && onDeleteForEveryone && (
                  <button
                    className="message-actions-menu-item message-actions-menu-item--danger"
                    onClick={handleDeleteForEveryone}
                    disabled={isDeleting}
                  >
                    {t('messages.deleteForEveryone')}
                  </button>
                )}
                {onDeleteForSelf && (
                  <button
                    className="message-actions-menu-item"
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
    </div>
  );
}

export function MessageList({
  messages,
  currentIdentityId,
  isLoading,
  error,
  hasMore,
  onLoadMore,
  onDeleteForEveryone,
  onDeleteForSelf,
  isDeleting,
}: MessageListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!listRef.current || !hasMore || isLoading) return;

    const { scrollTop } = listRef.current;
    if (scrollTop < 100) {
      onLoadMore();
    }
  }, [hasMore, isLoading, onLoadMore]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    list.addEventListener('scroll', handleScroll);
    return () => list.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (listRef.current && messages.length > 0) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length]);

  if (error) {
    return (
      <div className="message-list message-list--error">
        <div className="message-list-error">
          <span className="message-list-error-icon">!</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className="message-list message-list--loading">
        <Spinner size="md" />
        <p>{t('messages.loading')}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list message-list--empty">
        <p>{t('messages.noMessages')}</p>
        <p className="message-list-empty-hint">{t('messages.startConversation')}</p>
      </div>
    );
  }

  return (
    <div className="message-list" ref={listRef}>
      {hasMore && (
        <div className="message-list-load-more" ref={loadMoreTriggerRef}>
          {isLoading ? (
            <Spinner size="sm" />
          ) : (
            <button onClick={onLoadMore} className="message-list-load-more-btn">
              {t('messages.loadMore')}
            </button>
          )}
        </div>
      )}
      <div className="message-list-content">
        {messages.map((message, index) => {
          const isOwn = message.decrypted?.fromIdentityId === currentIdentityId;
          const prevMessage = messages[index - 1];
          const showAvatar =
            !isOwn &&
            (!prevMessage ||
              prevMessage.decrypted?.fromIdentityId !== message.decrypted?.fromIdentityId);

          return (
            <MessageBubble
              key={message.raw.id}
              message={message}
              isOwn={isOwn}
              showAvatar={showAvatar}
              senderName={message.decrypted?.fromIdentityId}
              onDeleteForEveryone={onDeleteForEveryone}
              onDeleteForSelf={onDeleteForSelf}
              isDeleting={isDeleting}
            />
          );
        })}
      </div>
    </div>
  );
}
