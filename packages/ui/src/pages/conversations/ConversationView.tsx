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
import { usePreKeys } from '../../hooks/usePreKeys';
import { loadConversationFsDefault, saveConversationFsDefault, SECURITY_LEVEL_CONFIG } from '../../services/preKeyService';
import { Button } from '../../components/Button';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
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

function formatRotationInterval(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours}h`;
  const days = hours / 24;
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

function MessageBubble({
  message,
  isOwn,
  onDelete,
  fsInfo,
}: {
  message: DisplayMessage;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  fsInfo: { rotationLabel: string; readableWindow: string; tooltip: string };
}) {
  const { t } = useTranslation();
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
        {message.forwardSecrecy !== undefined && (
          <span
            className={`dm-message-fs-indicator${message.forwardSecrecy ? ' dm-message-fs-indicator--active' : ''}`}
            title={message.forwardSecrecy
              ? fsInfo.tooltip
              : t('conversations.fsIndicatorOff', 'No forward secrecy. This message remains readable as long as your device keys exist.')
            }
          >
            {message.forwardSecrecy ? `FS ${fsInfo.readableWindow}` : 'No FS'}
          </span>
        )}
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
  const { config: fsConfig } = usePreKeys();
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
  const [showSettings, setShowSettings] = useState(false);

  // FS state: per-conversation override -> global default
  const resolveDefaultFs = useCallback(() => {
    if (!id) return fsConfig.enabled;
    const convOverride = loadConversationFsDefault(id);
    return convOverride ?? fsConfig.enabled;
  }, [id, fsConfig.enabled]);

  const [useFs, setUseFs] = useState(resolveDefaultFs);
  const [convFsOverride, setConvFsOverride] = useState<boolean | null>(() =>
    id ? loadConversationFsDefault(id) : null
  );

  // Reset FS state when conversation changes
  useEffect(() => {
    if (id) {
      const override = loadConversationFsDefault(id);
      setConvFsOverride(override);
      setUseFs(override ?? fsConfig.enabled);
    }
  }, [id, fsConfig.enabled]);

  const handleConvFsToggle = useCallback((enabled: boolean) => {
    if (!id) return;
    setConvFsOverride(enabled);
    saveConversationFsDefault(id, enabled);
    setUseFs(enabled);
  }, [id]);

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
    await sendTextMessage(id, text, { useForwardSecrecy: useFs });
  }, [id, messageText, sending, sendTextMessage, useFs]);

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

  const levelConfig = SECURITY_LEVEL_CONFIG[fsConfig.securityLevel];
  const rotationLabel = formatRotationInterval(levelConfig.spkRotationIntervalMs);
  const hardDeleteLabel = formatRotationInterval(levelConfig.hardDeleteCapMs);

  const fsInfo = (() => {
    const policy = fsConfig.spkDeletionPolicy;
    let readableWindow: string;
    let tooltip: string;

    if (policy === 'immediate') {
      readableWindow = rotationLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and are deleted immediately. Message becomes unreadable after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
    } else if (policy === 'timed') {
      readableWindow = rotationLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel} and retired keys are deleted on the same timer. Readable for up to ~${rotationLabel} after key rotation${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared)' : ' unless locally cached'}.`;
    } else {
      readableWindow = hardDeleteLabel;
      tooltip = `Forward secrecy enabled. Keys rotate every ${rotationLabel}. Retired keys are kept for up to ${hardDeleteLabel} before deletion. Readable for up to ~${hardDeleteLabel}${fsConfig.clearCacheOnRotation ? ' (local cache is also cleared on rotation)' : ''}.`;
    }

    return { rotationLabel, readableWindow, tooltip };
  })();

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
              className={`conversation-toolbar-btn${showSettings ? ' active' : ''}`}
              onClick={() => setShowSettings((v) => !v)}
            >
              {t('conversations.settings', 'Settings')}
            </Button>
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

        <ChatConnectionBanner />

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
                      fsInfo={fsInfo}
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
              <button
                type="button"
                className={`conversation-fs-toggle${useFs ? ' conversation-fs-toggle--active' : ''}`}
                onClick={() => setUseFs((v) => !v)}
                title={useFs
                  ? t('conversations.fsEnabled', 'Forward secrecy is on for this message')
                  : t('conversations.fsDisabled', 'Forward secrecy is off for this message')
                }
              >
                FS
              </button>
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

          {/* Settings sidebar */}
          {showSettings && (
            <div className="conversation-settings-sidebar">
              <div className="conversation-settings-header">
                <h3>{t('conversations.settings', 'Settings')}</h3>
              </div>
              <div className="conversation-settings-body">
                <label className="app-settings-toggle">
                  <input
                    type="checkbox"
                    checked={convFsOverride ?? fsConfig.enabled}
                    onChange={(e) => handleConvFsToggle(e.target.checked)}
                  />
                  <span className="app-settings-toggle-label">
                    <span className="app-settings-toggle-title">
                      {t('conversations.settingsFs', 'Forward Secrecy')}
                    </span>
                    <span className="app-settings-toggle-hint">
                      {t('conversations.settingsFsHint', 'Default messages in this conversation to use forward secrecy. Messages without FS remain end-to-end encrypted but persist in history.')}
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

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
