/**
 * MessageList Component
 *
 * Displays a list of decrypted DM messages with support for:
 * - Message grouping by sender
 * - Timestamps and read status
 * - Error states for failed decryption
 * - Loading states and infinite scroll
 */

import { useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecryptedDmMessage } from '../hooks/useDmMessages';
import { Avatar } from './Avatar';
import { Spinner } from './Spinner';

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
}

interface MessageBubbleProps {
  message: DecryptedDmMessage;
  isOwn: boolean;
  showAvatar: boolean;
  senderName?: string;
}

function MessageBubble({ message, isOwn, showAvatar, senderName }: MessageBubbleProps) {
  const { t } = useTranslation();

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
    <div className={`message-bubble ${isOwn ? 'message-bubble--own' : ''}`}>
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
        <span className="message-time">{formatMessageTime(message.raw.createdAt)}</span>
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
            />
          );
        })}
      </div>
    </div>
  );
}
