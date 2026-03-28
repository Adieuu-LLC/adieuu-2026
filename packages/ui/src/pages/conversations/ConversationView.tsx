/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useIdentity } from '../../hooks/useIdentity';
import { Button } from '../../components/Button';
import { TrashIcon } from '../../components/Icons';
import type { SystemEvent } from '@adieuu/shared';

function MessageActionBar({
  isOwn,
  onDeleteForSelf,
  onDeleteForEveryone,
}: {
  isOwn: boolean;
  onDeleteForSelf: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <div className={`message-action-bar${isOwn ? ' message-action-bar--own' : ''}`}>
      <button
        type="button"
        className="message-action-bar-btn"
        onClick={onDeleteForSelf}
        title="Delete for me"
      >
        <TrashIcon className="message-action-bar-icon" />
      </button>
      {isOwn && (
        <button
          type="button"
          className="message-action-bar-btn"
          onClick={onDeleteForEveryone}
          title="Delete for everyone"
        >
          <TrashIcon className="message-action-bar-icon" style={{ color: 'var(--color-error)' }} />
        </button>
      )}
    </div>
  );
}

function useExpiryCountdown(expiresAt?: string): string | null {
  const [remaining, setRemaining] = useState<string | null>(null);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(null);
      return;
    }

    const update = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('Expired');
        return;
      }
      const totalSec = Math.ceil(ms / 1000);
      if (totalSec < 60) {
        setRemaining(`${totalSec}s`);
      } else if (totalSec < 3600) {
        setRemaining(`${Math.ceil(totalSec / 60)}m`);
      } else if (totalSec < 86400) {
        setRemaining(`${Math.ceil(totalSec / 3600)}h`);
      } else {
        setRemaining(`${Math.ceil(totalSec / 86400)}d`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return remaining;
}

function SystemMessageRow({ event }: { event: SystemEvent }) {
  const { t } = useTranslation();
  const name = event.displayName ?? event.identityId.slice(0, 8);

  let text: string;
  switch (event.type) {
    case 'member_joined':
      text = t('conversations.systemMessage.memberJoined', {
        name,
        defaultValue: `${name} has joined the conversation`,
      });
      break;
    case 'member_left':
      text = t('conversations.systemMessage.memberLeft', {
        name,
        defaultValue: `${name} has left the conversation`,
      });
      break;
    default:
      text = event.type;
  }

  return (
    <div className="dm-system-message">
      <span className="dm-system-message-text">{text}</span>
    </div>
  );
}

function MessageBubble({
  message,
  isOwn,
  onDelete,
}: {
  message: DisplayMessage;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const countdown = useExpiryCountdown(message.expiresAt);

  if (message.deleted) {
    return (
      <div className={`dm-message${isOwn ? ' dm-message--own' : ''}`}>
        <div className="dm-message-bubble-wrapper">
          <div className={`dm-message-bubble${isOwn ? ' dm-message-bubble--own' : ''}`}>
            <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              Message deleted
            </p>
          </div>
        </div>
      </div>
    );
  }

  const content = message.decryptedContent ?? '';
  const hasDecryptionError = !message.decryptedContent && !message.deleted;

  return (
    <div
      className={`dm-message${isOwn ? ' dm-message--own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="dm-message-bubble-wrapper">
        {showActions && (
          <MessageActionBar
            isOwn={isOwn}
            onDeleteForSelf={() => onDelete(message.id, false)}
            onDeleteForEveryone={() => onDelete(message.id, true)}
          />
        )}
        <div className={`dm-message-bubble${isOwn ? ' dm-message-bubble--own' : ''}`}>
          {hasDecryptionError ? (
            <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}
              title={message.decryptionError ?? 'Unable to decrypt'}>
              [Encrypted{message.decryptionError ? `: ${message.decryptionError}` : ''}]
            </p>
          ) : (
            <p className="dm-message-text">{content}</p>
          )}
        </div>
      </div>
      <div className="dm-message-footer">
        <span className="dm-message-time">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {countdown && (
          <span className="dm-message-expiry">{countdown}</span>
        )}
      </div>
    </div>
  );
}

export function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identity } = useIdentity();
  const {
    conversations,
    activeConversationId,
    activeMessages,
    activeMessagesCursor,
    messagesLoading,
    sending,
    participantProfiles,
    setActiveConversation,
    sendTextMessage,
    loadMoreMessages,
    leaveGroup,
    deleteMessage,
  } = useConversations();

  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [showMembers, setShowMembers] = useState(false);

  const conversation = conversations.find((c) => c.id === id);

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
    }
  }, [id, activeConversationId, setActiveConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const handleSend = useCallback(async () => {
    if (!id || !messageText.trim() || sending) return;
    const text = messageText.trim();
    setMessageText('');
    await sendTextMessage(id, text);
  }, [id, messageText, sending, sendTextMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    if (container.scrollTop === 0 && activeMessagesCursor && !messagesLoading) {
      loadMoreMessages();
    }
  }, [activeMessagesCursor, messagesLoading, loadMoreMessages]);

  const handleLeave = useCallback(async () => {
    if (!id) return;
    const left = await leaveGroup(id);
    if (left) navigate('/');
  }, [id, leaveGroup, navigate]);

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!id) return;
      deleteMessage(id, messageId, forEveryone);
    },
    [id, deleteMessage]
  );

  if (!conversation) {
    return (
      <div className="conversation-not-found">
        <p>{t('conversations.notFound', 'Conversation not found')}</p>
        <Link to="/">{t('conversations.backHome', 'Back to home')}</Link>
      </div>
    );
  }

  const resolveDisplayName = (pid: string) => {
    const profile = participantProfiles[pid];
    return profile?.displayName ?? profile?.username ?? pid;
  };

  const otherParticipants = conversation.participants.filter((p) => p !== identity?.id);
  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? t('conversations.group', 'Group'))
    : otherParticipants.map(resolveDisplayName).join(', ');
  const subtitle = conversation.type === 'group'
    ? `${conversation.participants.length} ${t('conversations.members', 'members')}`
    : t('conversations.directMessage', 'Direct message');

  const reversedMessages = [...activeMessages].reverse();

  return (
    <div className="conversation-page">
      <div className="conversation-container">
        {/* Toolbar / Header */}
        <div className="conversation-toolbar">
          <div className="conversation-toolbar-left">
            <div className="conversation-toolbar-avatar">
              <span className="conversation-toolbar-avatar-placeholder">
                {displayName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="conversation-toolbar-info">
              <span className="conversation-toolbar-title">{displayName}</span>
              <span className="conversation-toolbar-subtitle">{subtitle}</span>
            </div>
          </div>
          <div className="conversation-toolbar-right">
            <Button
              variant="ghost"
              size="sm"
              className={`conversation-toolbar-btn${showMembers ? ' active' : ''}`}
              onClick={() => setShowMembers((v) => !v)}
            >
              {t('conversations.members', 'Members')}
            </Button>
            {conversation.type === 'group' && (
              <Button variant="ghost" size="sm" onClick={handleLeave}>
                {t('conversations.leave', 'Leave')}
              </Button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="conversation-body">
          <div className="conversation-main">
            {/* Messages */}
            <div
              className="conversation-messages"
              ref={messagesContainerRef}
              onScroll={handleScroll}
            >
              {messagesLoading && (
                <div className="dm-messages-loading">
                  <span className="spinner spinner-sm" />
                </div>
              )}

              <div className="dm-messages">
                {reversedMessages.map((msg) =>
                  msg.messageType === 'system' && msg.systemEvent ? (
                    <SystemMessageRow key={msg.id} event={msg.systemEvent} />
                  ) : (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isOwn={msg.fromIdentityId === identity?.id}
                      onDelete={handleDeleteMessage}
                    />
                  )
                )}
              </div>

              {reversedMessages.length === 0 && !messagesLoading && (
                <div className="conversation-messages-empty">
                  <p>{t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="conversation-input">
              <textarea
                className="conversation-input-field"
                placeholder={t('conversations.messagePlaceholder', 'Type a message...')}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={sending}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleSend}
                disabled={!messageText.trim() || sending}
              >
                {sending ? <span className="spinner spinner-sm" /> : t('conversations.send', 'Send')}
              </Button>
            </div>
          </div>

          {/* Members sidebar */}
          {showMembers && (
            <div className="conversation-members-sidebar">
              <div className="conversation-members-header">
                <h3>{t('conversations.members', 'Members')}</h3>
                <span className="conversation-members-count">
                  {conversation.participants.length}
                </span>
              </div>
              <div className="conversation-members-list">
                {conversation.participants.map((participantId) => {
                  const profile = participantProfiles[participantId];
                  const name = participantId === identity?.id
                    ? t('conversations.you', 'You')
                    : (profile?.displayName ?? profile?.username ?? participantId);
                  const initial = name.charAt(0).toUpperCase();

                  return (
                    <Link
                      key={participantId}
                      to={`/identity/${participantId}`}
                      className="conversation-member-item"
                    >
                      <div className="conversation-member-avatar">
                        {profile?.avatarUrl ? (
                          <img src={profile.avatarUrl} alt="" className="conversation-member-avatar-img" />
                        ) : (
                          <span className="conversation-member-avatar-placeholder">{initial}</span>
                        )}
                      </div>
                      <div className="conversation-member-info">
                        <span className="conversation-member-name">{name}</span>
                        {profile?.username && participantId !== identity?.id && (
                          <span className="conversation-member-username">@{profile.username}</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
