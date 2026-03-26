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
import { XIcon, UsersIcon, SettingsIcon, LockIcon } from '../components/Icons';
import { MessageComposer } from '../components/MessageComposer';
import { MessageActionBar, type MessageMetadata } from '../components/MessageActionBar';
import { useConversationsList } from '../hooks/useConversations';
import { useConversationsContext } from '../hooks/ConversationsProvider';
import { useIdentity } from '../hooks/useIdentity';
import { useDmMessages, useSendDmMessage, type DecryptedDmMessage } from '../hooks/useDmMessages';
import { useDmReactions, groupReactionsByMessageId, type GroupedReaction } from '../hooks/useDmReactions';
import {
  useDmSubscription,
  type DmNewMessageEvent,
  type DmDeletedEvent,
  type DmReactionNewEvent,
  type DmReactionRemovedEvent,
} from '../hooks/useDmSubscription';
import { useDeleteMessage } from '../hooks/useDeleteMessage';
import { useDocumentVisibility } from '../hooks/useDocumentVisibility';
import { useToast } from '../components/Toast';
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
  showSettingsSidebar: boolean;
  onToggleMembersSidebar: () => void;
  onToggleSettingsSidebar: () => void;
  onClose: () => void;
}

function ConversationToolbar({
  conversation,
  otherParticipant,
  showMembersSidebar,
  showSettingsSidebar,
  onToggleMembersSidebar,
  onToggleSettingsSidebar,
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
          onClick={onToggleSettingsSidebar}
          className={`conversation-toolbar-btn ${showSettingsSidebar ? 'active' : ''}`}
          title={t('conversation.toggleSettings')}
        >
          <SettingsIcon />
        </Button>
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

function SettingsSidebar() {
  const { t } = useTranslation();

  return (
    <div className="conversation-settings-sidebar">
      <div className="conversation-settings-header">
        <h3>{t('conversation.settings')}</h3>
      </div>
      <div className="conversation-settings-body">
        <div className="sidebar-coming-soon">
          <p>{t('conversation.settingsComingSoon')}</p>
        </div>
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

/**
 * Regex matching sequences of emoji characters (including skin tone modifiers,
 * ZWJ sequences, and keycap sequences). Whitespace between emojis is allowed.
 */
const EMOJI_ONLY_REGEX = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Regional_Indicator}{2}|[\u200D\uFE0F]|\s)+$/u;
const MAX_EMOJI_ONLY_LENGTH = 12;

const EMPTY_REACTIONS: GroupedReaction[] = [];

function isEmojiOnlyMessage(text: string | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_EMOJI_ONLY_LENGTH) return false;
  return EMOJI_ONLY_REGEX.test(trimmed);
}

interface ReactionBarProps {
  reactions: GroupedReaction[];
  onReactionClick: (
    emoji: string,
    includesMe: boolean,
    reactionIds: string[],
    reactorIds: string[]
  ) => void;
  /** When true, reaction chips are inert (add/remove in progress). */
  reactionDisabled?: boolean;
}

const ReactionBar = memo(function ReactionBar({
  reactions,
  onReactionClick,
  reactionDisabled = false,
}: ReactionBarProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="dm-message-reactions">
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`dm-message-reaction ${reaction.includesMe ? 'dm-message-reaction--own' : ''}`}
          disabled={reactionDisabled}
          onClick={() => {
            if (reactionDisabled) return;
            onReactionClick(reaction.emoji, reaction.includesMe, reaction.reactionIds, reaction.reactorIds);
          }}
          title={`${reaction.emoji} ${reaction.count}`}
        >
          <span className="dm-message-reaction-emoji">{reaction.emoji}</span>
          <span className="dm-message-reaction-count">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
});

interface MessageBubbleProps {
  message: DecryptedDmMessage;
  isOwn: boolean;
  onDeleteForEveryone?: (messageId: string) => void;
  onDeleteForSelf?: (messageId: string) => void;
  isDeleting?: boolean;
  /** Parent supplies stable handler; bubble passes `messageId` for each row. */
  onReact?: (messageId: string, emoji: string) => void | Promise<void>;
  reactions?: GroupedReaction[];
  onReactionClick?: (
    messageId: string,
    emoji: string,
    includesMe: boolean,
    reactionIds: string[],
    reactorIds: string[]
  ) => void | Promise<void>;
  reactionDisabled?: boolean;
}

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  onDeleteForEveryone,
  onDeleteForSelf,
  isDeleting,
  onReact,
  reactions = [],
  onReactionClick,
  reactionDisabled = false,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isActionBarPopoverOpen, setIsActionBarPopoverOpen] = useState(false);
  const expiryCountdown = useExpiryCountdown(message.raw.expiresAt);
  const fsEnabledForMessage = message.raw.wrappedKeys.some((wk) => wk.preKeyType !== 'static');

  const showActionBar = isHovered || isActionBarPopoverOpen;

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

  const hasMenuActions = (isOwn && onDeleteForEveryone) || onDeleteForSelf;

  const metadata: MessageMetadata = useMemo(
    () => ({
      messageId: message.raw.id,
      sentAt: message.raw.createdAt,
      cryptoProfile: message.raw.cryptoProfile,
      forwardSecrecy: fsEnabledForMessage,
      expiresAt: message.raw.expiresAt,
      conversationId: message.raw.conversationId,
      clientMessageId: message.raw.clientMessageId,
    }),
    [message.raw, fsEnabledForMessage],
  );

  const menuContent = hasMenuActions ? (
    <div className="message-action-bar-menu">
      {isOwn && onDeleteForEveryone && (
        <button
          className="message-action-bar-menu-item message-action-bar-menu-item--danger"
          onClick={handleDeleteForEveryone}
          disabled={isDeleting}
        >
          {t('messages.deleteForEveryone')}
        </button>
      )}
      {onDeleteForSelf && (
        <button
          className="message-action-bar-menu-item"
          onClick={handleDeleteForSelf}
          disabled={isDeleting}
        >
          {t('messages.deleteForMe')}
        </button>
      )}
    </div>
  ) : undefined;

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

  const emojiOnly = isEmojiOnlyMessage(message.decrypted?.text);

  const handleReact = useCallback(
    (emoji: string) => {
      if (!message.raw.id) return;
      void onReact?.(message.raw.id, emoji);
    },
    [onReact, message.raw.id],
  );

  const handleReactionClick = useCallback(
    (emoji: string, includesMe: boolean, reactionIds: string[], reactorIds: string[]) => {
      if (reactionDisabled || !message.raw.id) return;
      void onReactionClick?.(message.raw.id, emoji, includesMe, reactionIds, reactorIds);
    },
    [onReactionClick, message.raw.id, reactionDisabled],
  );

  return (
    <div
      className={`dm-message ${isOwn ? 'dm-message--own' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="dm-message-bubble-wrapper">
        <MessageActionBar
          metadata={metadata}
          menuContent={menuContent}
          visible={showActionBar}
          isOwn={isOwn}
          disabled={isDeleting || reactionDisabled}
          onPopoverOpenChange={setIsActionBarPopoverOpen}
          onReact={onReact ? handleReact : undefined}
        />
        {emojiOnly ? (
          <p className="dm-message-emoji-only">{message.decrypted?.text}</p>
        ) : (
          <div className={`dm-message-bubble ${isOwn ? 'dm-message-bubble--own' : ''}`}>
            <p className="dm-message-text">{message.decrypted?.text}</p>
          </div>
        )}
      </div>
      {reactions.length > 0 && (
        <ReactionBar
          reactions={reactions}
          onReactionClick={handleReactionClick}
          reactionDisabled={reactionDisabled}
        />
      )}
      <div className="dm-message-footer">
        <span className="dm-message-time">{formatMessageTime(message.raw.createdAt)}</span>
        {isOwn && (
          <span
            className={`dm-message-fs-indicator ${fsEnabledForMessage ? 'dm-message-fs-indicator--enabled' : 'dm-message-fs-indicator--disabled'}`}
            title={fsEnabledForMessage ? t('messages.fs.enabledHint') : t('messages.fs.disabledHint')}
          >
            {fsEnabledForMessage ? t('messages.fs.enabledShort') : t('messages.fs.disabledShort')}
          </span>
        )}
        {expiryCountdown && (
          <span className="dm-message-expiry" title={t('messages.expiresIn')}>
            {expiryCountdown}
          </span>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message.raw.id === nextProps.message.raw.id &&
    prevProps.message.isDeleted === nextProps.message.isDeleted &&
    prevProps.message.decrypted?.text === nextProps.message.decrypted?.text &&
    prevProps.message.decryptionError === nextProps.message.decryptionError &&
    prevProps.message.raw.expiresAt === nextProps.message.raw.expiresAt &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.isDeleting === nextProps.isDeleting &&
    prevProps.reactionDisabled === nextProps.reactionDisabled &&
    prevProps.onReact === nextProps.onReact &&
    prevProps.onReactionClick === nextProps.onReactionClick &&
    prevProps.reactions === nextProps.reactions
  );
});

const FS_KEY_ROTATION_ERRORS = [
  'SPK private key not found (may have been rotated/deleted)',
  'Failed to unwrap session key with pre-keys (key may have been rotated/deleted)',
] as const;

const FS_KEY_ROTATION_ERROR_PREFIXES = [
  'Pre-key private keys required to decrypt FS message',
] as const;

export function isFsKeyRotationError(error: string | undefined): boolean {
  if (!error) return false;
  if ((FS_KEY_ROTATION_ERRORS as readonly string[]).includes(error)) return true;
  return FS_KEY_ROTATION_ERROR_PREFIXES.some((prefix) => error.startsWith(prefix));
}

type MessageListItem =
  | { type: 'message'; message: DecryptedDmMessage }
  | { type: 'fs-rotation-group'; messages: DecryptedDmMessage[] };

function groupFsRotationErrors(messages: DecryptedDmMessage[]): MessageListItem[] {
  const items: MessageListItem[] = [];
  let currentGroup: DecryptedDmMessage[] = [];

  const flushGroup = () => {
    if (currentGroup.length > 0) {
      items.push({ type: 'fs-rotation-group', messages: [...currentGroup] });
      currentGroup = [];
    }
  };

  for (const msg of messages) {
    if (isFsKeyRotationError(msg.decryptionError)) {
      currentGroup.push(msg);
    } else {
      flushGroup();
      items.push({ type: 'message', message: msg });
    }
  }
  flushGroup();

  return items;
}

interface FsKeyRotationNoticeProps {
  messages: DecryptedDmMessage[];
}

function FsKeyRotationNotice({ messages }: FsKeyRotationNoticeProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="dm-fs-rotation-notice">
      <div className="dm-fs-rotation-notice-divider">
        <span className="dm-fs-rotation-notice-line" />
        <span className="dm-fs-rotation-notice-badge">
          <LockIcon className="dm-fs-rotation-notice-icon" />
          <span>{t('messages.fs.keyRotationNotice', { count: messages.length })}</span>
        </span>
        <span className="dm-fs-rotation-notice-line" />
      </div>
      <div className="dm-fs-rotation-notice-body">
        <p className="dm-fs-rotation-notice-explanation">
          {t('messages.fs.keyRotationExplanation')}
        </p>
        <div className="dm-fs-rotation-notice-actions">
          <Link
            to="/identity/devices?tab=forward-secrecy"
            className="dm-fs-rotation-notice-link"
          >
            {t('messages.fs.manageSettings')}
          </Link>
          <button
            className="dm-fs-rotation-notice-toggle"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? t('messages.fs.hideMessages') : t('messages.fs.showHiddenMessages')}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="dm-fs-rotation-notice-hidden-messages">
          {messages.map((msg) => (
            <div key={msg.raw.id} className="dm-fs-rotation-hidden-message">
              <LockIcon className="dm-fs-rotation-hidden-message-icon" />
              <span className="dm-fs-rotation-hidden-message-label">
                {t('messages.fs.messageUnavailable')}
              </span>
              <span className="dm-fs-rotation-hidden-message-time">
                {formatMessageTime(msg.raw.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ConversationMessagesProps {
  messages: DecryptedDmMessage[];
  isLoading: boolean;
  error: string | null;
  currentIdentityId: string | undefined;
  otherParticipantName?: string;
  onDeleteForEveryone?: (messageId: string) => void;
  onDeleteForSelf?: (messageId: string) => void;
  isDeleting?: boolean;
  reactionsByMessageId: Record<string, GroupedReaction[]>;
  isReactionBusy?: boolean;
  onMessageReact: (messageId: string, emoji: string) => void | Promise<void>;
  onReactionBarClick: (
    messageId: string,
    emoji: string,
    includesMe: boolean,
    reactionIds: string[],
    reactorIds: string[]
  ) => void | Promise<void>;
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
  reactionsByMessageId,
  isReactionBusy = false,
  onMessageReact,
  onReactionBarClick,
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

  const groupedItems = useMemo(() => groupFsRotationErrors(displayMessages), [displayMessages]);

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

      {groupedItems.map((item) => {
        if (item.type === 'fs-rotation-group') {
          const groupKey = item.messages.map((m) => m.raw.id).join('-');
          return <FsKeyRotationNotice key={groupKey} messages={item.messages} />;
        }
        const msg = item.message;
        return (
          <MessageBubble
            key={msg.raw.id}
            message={msg}
            isOwn={msg.decrypted?.fromIdentityId === currentIdentityId}
            onDeleteForEveryone={onDeleteForEveryone}
            onDeleteForSelf={onDeleteForSelf}
            isDeleting={isDeleting}
            onReact={onMessageReact}
            onReactionClick={onReactionBarClick}
            reactions={reactionsByMessageId[msg.raw.id] ?? EMPTY_REACTIONS}
            reactionDisabled={isReactionBusy}
          />
        );
      })}

      <div ref={messagesEndRef} />
    </div>
  );
});

interface ConversationInputProps {
  onSend: (text: string, expiresInSeconds?: number | null, forwardSecrecy?: boolean) => Promise<void>;
  isSending: boolean;
  error: string | null;
  forwardSecrecyStorageKey: string;
}

function ConversationInput({
  onSend,
  isSending,
  error,
  forwardSecrecyStorageKey,
}: ConversationInputProps) {
  return (
    <div className="dm-input-container">
      {error && (
        <div className="dm-input-error">
          <span>{error}</span>
        </div>
      )}
      <MessageComposer
        onSend={(data) => onSend(data.text, data.expiresInSeconds, data.forwardSecrecy)}
        isSending={isSending}
        showTtlSelector={true}
        showForwardSecrecyToggle={true}
        forwardSecrecyDefault={true}
        forwardSecrecyStorageKey={forwardSecrecyStorageKey}
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
  const { warning: toastWarning } = useToast();
  const toastWarningRef = useRef(toastWarning);
  toastWarningRef.current = toastWarning;
  const [showMembersSidebar, setShowMembersSidebar] = useState(true);
  const [showSettingsSidebar, setShowSettingsSidebar] = useState(false);
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

    let cancelled = false;

    const init = async () => {
      setIsInitializing(true);
      const api = createApiClient({ baseUrl: apiBaseUrl });

      // 1. Prefer the already-resolved conversation list (unified)
      if (conversation && conversation.members[0]?.identity) {
        setOtherParticipant(conversation.members[0].identity);
        setOtherParticipantId(conversation.members[0].identity.id);
        setIsInitializing(false);
        return;
      }

      // 2. Use participants from dmConversations (populated from API)
      const dmConv = dmConversations.find((c) => c.conversationId === conversationId);
      if (dmConv?.otherParticipant) {
        setOtherParticipant(dmConv.otherParticipant);
        setOtherParticipantId(dmConv.otherParticipant.id);
        setIsInitializing(false);
        return;
      }

      // 3. Fallback: participant cache (for pre-migration conversations)
      try {
        const cached = await getCachedParticipant(identity.id, conversationId);
        if (!cancelled && cached) {
          setOtherParticipantId(cached.otherIdentityId);
          const response = await api.identity.getById(cached.otherIdentityId);
          if (!cancelled && response.success && response.data) {
            setOtherParticipant(response.data);
            setIsInitializing(false);
            return;
          }
        }
      } catch {
        // Non-critical
      }

      // 4. For new conversations, use recipient ID from URL
      if (recipientIdFromUrl) {
        setOtherParticipantId(recipientIdFromUrl);
        try {
          const response = await api.identity.getById(recipientIdFromUrl);
          if (!cancelled && response.success && response.data) {
            setOtherParticipant(response.data);
          }
        } catch {
          // Non-critical
        }
      }

      if (!cancelled) setIsInitializing(false);
    };

    init();
    return () => { cancelled = true; };
  }, [apiBaseUrl, conversation, conversationId, dmConversations, identity, isLoggedIn, recipientIdFromUrl]);

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

  const refreshMessagesRef = useRef(refreshMessages);
  refreshMessagesRef.current = refreshMessages;

  // Send message hook
  const { sendMessage, isSending, error: sendError } = useSendDmMessage();

  // Delete message hook
  const { deleteForEveryone, deleteForSelf, isDeleting } = useDeleteMessage();

  const {
    fetchReactions,
    addReaction,
    removeReaction,
    isAdding: isAddingReaction,
  } = useDmReactions();

  const [reactionsByMessageId, setReactionsByMessageId] = useState<Record<string, GroupedReaction[]>>({});

  const reactionRecipientId = useMemo(
    () => otherParticipantId ?? conversation?.members[0]?.identity?.id ?? null,
    [otherParticipantId, conversation]
  );

  const messageIdsKey = useMemo(
    () =>
      messages
        .map((m) => m.raw.id)
        .filter(Boolean)
        .sort()
        .join(','),
    [messages]
  );

  const refreshReactionsForMessages = useCallback(
    async (messageIds: string[]) => {
      if (!conversationId || !identity?.id || messageIds.length === 0) return;
      const decrypted = await fetchReactions(
        conversationId,
        messageIds,
        reactionRecipientId
      );
      const grouped = groupReactionsByMessageId(decrypted, identity.id);
      setReactionsByMessageId((prev) => {
        const next = { ...prev };
        for (const mid of messageIds) {
          next[mid] = grouped[mid] ?? [];
        }
        return next;
      });
    },
    [conversationId, identity?.id, fetchReactions, reactionRecipientId]
  );

  useEffect(() => {
    setReactionsByMessageId({});
  }, [conversationId]);

  useEffect(() => {
    if (!isLoggedIn || !conversationId || !identity?.id) return;
    const ids = messages.map((m) => m.raw.id).filter(Boolean);
    if (ids.length === 0) {
      setReactionsByMessageId({});
      return;
    }
    let cancelled = false;
    (async () => {
      const decrypted = await fetchReactions(conversationId, ids, reactionRecipientId);
      if (cancelled) return;
      setReactionsByMessageId(groupReactionsByMessageId(decrypted, identity.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    isLoggedIn,
    conversationId,
    identity?.id,
    fetchReactions,
    messageIdsKey,
    messages,
    reactionRecipientId,
  ]);

  const handleMessageReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!conversationId || !reactionRecipientId) return;
      const result = await addReaction({
        messageId,
        conversationId,
        toIdentityId: reactionRecipientId,
        emoji,
      });
      if (result.success) {
        await refreshReactionsForMessages([messageId]);
      }
    },
    [conversationId, reactionRecipientId, addReaction, refreshReactionsForMessages]
  );

  const handleReactionBarClick = useCallback(
    async (
      messageId: string,
      emoji: string,
      includesMe: boolean,
      reactionIds: string[],
      reactorIds: string[]
    ) => {
      if (!conversationId || !identity?.id || !reactionRecipientId) return;

      if (includesMe) {
        const idx = reactorIds.indexOf(identity.id);
        const reactionId = idx >= 0 ? reactionIds[idx] : undefined;
        if (!reactionId) return;
        const result = await removeReaction(reactionId);
        if (result.success) {
          await refreshReactionsForMessages([messageId]);
        }
        return;
      }

      const result = await addReaction({
        messageId,
        conversationId,
        toIdentityId: reactionRecipientId,
        emoji,
      });
      if (result.success) {
        await refreshReactionsForMessages([messageId]);
      }
    },
    [conversationId, identity?.id, reactionRecipientId, addReaction, removeReaction, refreshReactionsForMessages]
  );

  // Subscribe to real-time updates for THIS conversation only.
  // The ConversationsProvider handles global list updates separately.
  useDmSubscription({
    conversationId: conversationId ?? undefined,
    onNewMessage: useCallback(
      (event: DmNewMessageEvent) => {
        void appendNewMessage(event.payload.message).then((ok) => {
          if (!ok) {
            toastWarningRef.current(t('messages.realtimeAppendFailed'));
            refreshMessagesRef.current();
          }
        });
        if (conversationId && isVisibleRef.current) {
          markConversationRead(conversationId, event.payload.message.id, cryptoProfile);
        }
      },
      [appendNewMessage, conversationId, cryptoProfile, isVisibleRef, markConversationRead, t]
    ),
    onDeleted: useCallback(
      (event: DmDeletedEvent) => {
        removeMessage(event.payload.messageId);
      },
      [removeMessage]
    ),
    onReactionNew: useCallback(
      (event: DmReactionNewEvent) => {
        void refreshReactionsForMessages([event.payload.reaction.messageId]);
      },
      [refreshReactionsForMessages]
    ),
    onReactionRemoved: useCallback(
      (event: DmReactionRemovedEvent) => {
        void refreshReactionsForMessages([event.payload.messageId]);
      },
      [refreshReactionsForMessages]
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
    setShowMembersSidebar((prev) => {
      if (!prev) setShowSettingsSidebar(false);
      return !prev;
    });
  };

  const handleToggleSettingsSidebar = () => {
    setShowSettingsSidebar((prev) => {
      if (!prev) setShowMembersSidebar(false);
      return !prev;
    });
  };

  const handleSendMessage = useCallback(async (
    text: string,
    expiresInSeconds?: number | null,
    forwardSecrecy?: boolean
  ) => {
    if (!otherParticipantId) return;

    const result = await sendMessage({
      toIdentityId: otherParticipantId,
      text,
      expiresInSeconds: expiresInSeconds ?? undefined,
      forwardSecrecy,
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
          showSettingsSidebar={showSettingsSidebar}
          onToggleMembersSidebar={handleToggleMembersSidebar}
          onToggleSettingsSidebar={handleToggleSettingsSidebar}
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
              reactionsByMessageId={reactionsByMessageId}
              isReactionBusy={isAddingReaction}
              onMessageReact={handleMessageReact}
              onReactionBarClick={handleReactionBarClick}
            />
            <ConversationInput
              onSend={handleSendMessage}
              isSending={isSending}
              error={sendError}
              forwardSecrecyStorageKey={`adieuu-dm-fs-default-${identity.id}-${conversationId ?? ''}`}
            />
          </div>
          {showSettingsSidebar && <SettingsSidebar />}
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
