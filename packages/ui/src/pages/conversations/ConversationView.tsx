/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Handles both DM and group conversations.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useIdentity } from '../../hooks/useIdentity';
import { Button } from '../../components/Button';

function MessageBubble({ message, isOwn }: { message: DisplayMessage; isOwn: boolean }) {
  if (message.deleted) {
    return (
      <div className={`conversation-message conversation-message-deleted ${isOwn ? 'conversation-message-own' : ''}`}>
        <div className="conversation-message-bubble conversation-message-bubble-deleted">
          <em>Message deleted</em>
        </div>
      </div>
    );
  }

  const content = message.decryptedContent ?? message.ciphertext ?? '';
  const isEncrypted = !message.decryptedContent && message.ciphertext;

  return (
    <div className={`conversation-message ${isOwn ? 'conversation-message-own' : ''}`}>
      <div className="conversation-message-bubble">
        {isEncrypted ? (
          <span className="conversation-message-encrypted">[Encrypted]</span>
        ) : (
          <span className="conversation-message-text">{content}</span>
        )}
        <span className="conversation-message-time">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
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
    setActiveConversation,
    sendTextMessage,
    loadMoreMessages,
    leaveGroup,
  } = useConversations();

  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

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

  if (!conversation) {
    return (
      <div className="conversation-view-empty">
        <p>{t('conversations.notFound', 'Conversation not found')}</p>
        <Link to="/">{t('conversations.backHome', 'Back to home')}</Link>
      </div>
    );
  }

  const otherParticipants = conversation.participants.filter((p) => p !== identity?.id);
  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? t('conversations.group', 'Group'))
    : otherParticipants.join(', ');

  const reversedMessages = [...activeMessages].reverse();

  return (
    <div className="conversation-view">
      <div className="conversation-view-header">
        <div className="conversation-view-header-info">
          <h2 className="conversation-view-header-name">{displayName}</h2>
          <span className="conversation-view-header-meta">
            {conversation.participants.length} {t('conversations.members', 'members')}
          </span>
        </div>
        <div className="conversation-view-header-actions">
          {conversation.type === 'group' && (
            <Button variant="ghost" size="sm" onClick={handleLeave}>
              {t('conversations.leave', 'Leave')}
            </Button>
          )}
        </div>
      </div>

      <div
        className="conversation-view-messages"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {messagesLoading && (
          <div className="conversation-view-loading">
            <span className="spinner spinner-sm" />
          </div>
        )}

        {reversedMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isOwn={msg.fromIdentityId === identity?.id}
          />
        ))}

        {reversedMessages.length === 0 && !messagesLoading && (
          <div className="conversation-view-empty-messages">
            <p>{t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="conversation-view-composer">
        <textarea
          className="conversation-view-composer-input"
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
          className="conversation-view-composer-send"
        >
          {sending ? <span className="spinner spinner-sm" /> : t('conversations.send', 'Send')}
        </Button>
      </div>
    </div>
  );
}
