/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Menu, Portal, Popover } from '@ark-ui/react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useIdentity } from '../../hooks/useIdentity';
import { useFriends } from '../../hooks/useFriends';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useReactions, type GroupedReaction } from '../../hooks/useReactions';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { loadConversationFsDefault, saveConversationFsDefault, loadShowMessageArtifacts, SECURITY_LEVEL_CONFIG } from '../../services/preKeyService';
import { convertShortcodes, getShortcode } from '../../utils/emojiShortcodes';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminTransferDialog } from '../../components/AdminTransferDialog';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { useMessageLayoutPreference } from '../../hooks/useMessageLayoutPreference';
import type { SystemEvent, FormerMember, PublicIdentity } from '@adieuu/shared';

function MessageActionBar({
  isOwn,
  onDeleteForSelf,
  onDeleteForEveryone,
  onReact,
  favoriteEmojis,
  onAddFavorite,
  onRemoveFavorite,
}: {
  isOwn: boolean;
  onDeleteForSelf: () => void;
  onDeleteForEveryone: () => void;
  onReact: (emoji: string) => void;
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
}) {
  const [showFavPicker, setShowFavPicker] = useState(false);

  return (
    <div className={`message-action-bar${isOwn ? ' message-action-bar--own' : ''}`}>
      <div className="message-action-bar-favorites">
        {favoriteEmojis.map((emoji) => (
          <Tooltip key={emoji} content={`React ${emoji} \u00b7 Shift+click to remove`} position="top">
            <button
              type="button"
              className="message-action-bar-btn message-action-bar-btn--emoji"
              onClick={(e) => {
                if (e.shiftKey) {
                  onRemoveFavorite(emoji);
                } else {
                  onReact(emoji);
                }
              }}
            >
              {emoji}
            </button>
          </Tooltip>
        ))}
        {favoriteEmojis.length < 3 && (
          <Popover.Root
            open={showFavPicker}
            onOpenChange={(e) => setShowFavPicker(e.open)}
            positioning={{ placement: 'top', gutter: 4 }}
          >
            <Popover.Trigger asChild>
              <button
                type="button"
                className="message-action-bar-btn message-action-bar-btn--add-fav"
                title="Add favourite reaction"
              >
                <Icon name="plus" className="message-action-bar-icon message-action-bar-icon--sm" />
              </button>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <Popover.Content className="emoji-picker-popover">
                  <EmojiPicker
                    compact
                    onEmojiSelect={(emoji) => {
                      onAddFavorite(emoji);
                      setShowFavPicker(false);
                    }}
                  />
                </Popover.Content>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>
        )}
      </div>
      <Popover.Root positioning={{ placement: 'top', gutter: 4 }}>
        <Popover.Trigger asChild>
          <button type="button" className="message-action-bar-btn" title="React">
            <Icon name="smilePlus" className="message-action-bar-icon" />
          </button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content className="emoji-picker-popover">
              <EmojiPicker
                compact
                onEmojiSelect={(emoji) => {
                  onReact(emoji);
                }}
              />
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
      <Tooltip content="Delete for me" position="top">
        <button
          type="button"
          className="message-action-bar-btn"
          onClick={onDeleteForSelf}
        >
          <Icon name="trash" className="message-action-bar-icon" />
        </button>
      </Tooltip>
      {isOwn && (
        <Tooltip content="Delete for everyone" position="top">
          <button
            type="button"
            className="message-action-bar-btn"
            onClick={onDeleteForEveryone}
          >
            <Icon name="trash" className="message-action-bar-icon" style={{ color: 'var(--color-error)' }} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

function buildReactionTooltip(
  reaction: GroupedReaction,
  profiles: Record<string, PublicIdentity>,
  currentIdentityId: string | undefined,
): string {
  const shortcode = getShortcode(reaction.emoji);
  const MAX_NAMED = 3;

  const names: string[] = [];
  if (reaction.isOwn) names.push('You');

  for (const id of reaction.fromIdentityIds) {
    if (id === currentIdentityId) continue;
    if (names.length >= MAX_NAMED) break;
    const profile = profiles[id];
    names.push(profile?.displayName ?? profile?.username ?? id.slice(0, 8));
  }

  const othersCount = reaction.count - names.length;
  let label = names.join(', ');
  if (othersCount > 0) label += ` + ${othersCount} other${othersCount === 1 ? '' : 's'}`;

  return `${label} reacted with ${shortcode}`;
}

function ReactionBar({
  reactions,
  onToggleReaction,
  participantProfiles,
  currentIdentityId,
}: {
  reactions: GroupedReaction[];
  onToggleReaction: (emoji: string, ownReactionId?: string) => void;
  participantProfiles: Record<string, PublicIdentity>;
  currentIdentityId: string | undefined;
}) {
  if (reactions.length === 0) return null;

  return (
    <div className="message-reaction-bar">
      {reactions.map((r) => (
        <Tooltip
          key={r.emoji}
          content={buildReactionTooltip(r, participantProfiles, currentIdentityId)}
          position="top"
        >
          <button
            type="button"
            className={`message-reaction-chip${r.isOwn ? ' message-reaction-chip--own' : ''}`}
            onClick={() => onToggleReaction(r.emoji, r.ownReactionId)}
          >
            <span className="message-reaction-chip-emoji">{r.emoji}</span>
            <span className="message-reaction-chip-count">{r.count}</span>
          </button>
        </Tooltip>
      ))}
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
  const actorName = event.actorDisplayName ?? event.actorIdentityId?.slice(0, 8);

  let text: string;
  switch (event.type) {
    case 'member_joined':
      text = t('conversations.systemMessage.memberJoined', {
        name,
        defaultValue: `${name} has joined the conversation`,
      });
      break;
    case 'member_invited':
      text = actorName
        ? t('conversations.systemMessage.memberInvited', {
            actor: actorName,
            name,
            defaultValue: `${actorName} invited ${name} to the group`,
          })
        : t('conversations.systemMessage.memberJoined', {
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
    case 'member_removed':
      text = actorName
        ? t('conversations.systemMessage.memberRemoved', {
            actor: actorName,
            name,
            defaultValue: `${actorName} removed ${name} from the group`,
          })
        : t('conversations.systemMessage.memberRemovedSimple', {
            name,
            defaultValue: `${name} was removed from the group`,
          });
      break;
    case 'admin_promoted':
      text = actorName
        ? t('conversations.systemMessage.adminPromoted', {
            actor: actorName,
            name,
            defaultValue: `${actorName} made ${name} an admin`,
          })
        : t('conversations.systemMessage.adminPromotedSimple', {
            name,
            defaultValue: `${name} is now an admin`,
          });
      break;
    case 'group_renamed':
      text = actorName
        ? t('conversations.systemMessage.groupRenamed', {
            actor: actorName,
            defaultValue: `${actorName} renamed the group`,
          })
        : t('conversations.systemMessage.groupRenamedSimple', {
            name,
            defaultValue: `${name} renamed the group`,
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

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Yesterday at ${time}`;

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: 'long' });
    return `${dayName} at ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
  }

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${time}`;
}

function formatAbsoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

function formatDayLabel(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

type ChatItem =
  | { type: 'day-separator'; date: Date; key: string }
  | { type: 'unread-separator'; key: string }
  | { type: 'message'; msg: DisplayMessage; key: string };

const FIRST_ITEM_INDEX = 1_000_000;

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  onDelete,
  onReact,
  onToggleReaction,
  groupedReactions,
  favoriteEmojis,
  onAddFavorite,
  onRemoveFavorite,
  fsInfo,
  senderProfile,
  ownProfile,
  layout,
  participantProfiles,
}: {
  message: DisplayMessage;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
  onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  groupedReactions: GroupedReaction[];
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  fsInfo: { rotationLabel: string; readableWindow: string; tooltip: string };
  senderProfile?: PublicIdentity;
  ownProfile?: PublicIdentity;
  layout: 'linear' | 'bubble';
  participantProfiles: Record<string, PublicIdentity>;
}) {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  const [showContextReactionPicker, setShowContextReactionPicker] = useState(false);
  const countdown = useExpiryCountdown(message.expiresAt);

  const content = message.decryptedContent ?? '';
  const hasDecryptionError = !message.decryptedContent && !message.deleted;
  const isFsExpired = hasDecryptionError && message.decryptionError?.startsWith('forward-secrecy-expired:');
  const decryptionDisplayText = isFsExpired
    ? t('conversations.fsExpired', 'This message used a one-time key that has since been consumed. It cannot be decrypted again.')
    : (message.decryptionError ?? t('conversations.decryptFailed', 'Unable to decrypt'));
  const decryptionLabel = isFsExpired
    ? t('conversations.fsExpiredLabel', 'Forward secrecy key expired')
    : `Encrypted${message.decryptionError ? `: ${message.decryptionError}` : ''}`;

  function handleContextAction(details: { value: string }) {
    if (details.value === 'delete-for-me') onDelete(message.id, false);
    else if (details.value === 'delete-for-everyone') onDelete(message.id, true);
    else if (details.value === 'react') setShowContextReactionPicker(true);
  }

  const contextMenuContent = (
    <Portal>
      <Menu.Positioner>
        <Menu.Content className="dm-context-menu">
          <Menu.Item value="react" className="dm-context-menu-item">
            <Icon name="smilePlus" className="dm-context-menu-item-icon" />
            React
          </Menu.Item>
          <Menu.Item value="delete-for-me" className="dm-context-menu-item">
            <Icon name="trash" className="dm-context-menu-item-icon" />
            Delete for me
          </Menu.Item>
          {isOwn && (
            <Menu.Item value="delete-for-everyone" className="dm-context-menu-item dm-context-menu-item--danger">
              <Icon name="trash" className="dm-context-menu-item-icon" />
              Delete for everyone
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Positioner>
    </Portal>
  );

  const reactionBar = (
    <ReactionBar
      reactions={groupedReactions}
      onToggleReaction={(emoji, ownReactionId) =>
        onToggleReaction(message.id, emoji, ownReactionId)
      }
      participantProfiles={participantProfiles}
      currentIdentityId={ownProfile?.id}
    />
  );

  const contextReactionPickerPopover = (
    <Popover.Root
      open={showContextReactionPicker}
      onOpenChange={(e) => setShowContextReactionPicker(e.open)}
    >
      <Portal>
        <Popover.Positioner>
          <Popover.Content className="emoji-picker-popover emoji-picker-popover--context">
            <EmojiPicker
              compact
              onEmojiSelect={(emoji) => {
                onReact(message.id, emoji);
                setShowContextReactionPicker(false);
              }}
            />
            <button
              type="button"
              className="emoji-picker-popover-close"
              onClick={() => setShowContextReactionPicker(false)}
            >
              x
            </button>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );

  if (layout === 'linear') {
    const profile = isOwn ? ownProfile : senderProfile;
    const displayName = profile?.displayName ?? '?';
    const avatarUrl = profile?.avatarUrl;

    const avatarContent = avatarUrl ? (
      <img src={avatarUrl} alt="" className="dm-message-avatar-img" />
    ) : (
      <span className="dm-message-avatar-placeholder">
        {displayName.charAt(0).toUpperCase()}
      </span>
    );

    const messageBody = message.deleted ? (
      <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
        Message deleted
      </p>
    ) : hasDecryptionError ? (
      <Tooltip content={decryptionDisplayText} position="bottom">
        <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
          [{decryptionLabel}]
        </p>
      </Tooltip>
    ) : (
      <p className="dm-message-text">{content}</p>
    );

    const messageRow = (
      <div
        className="dm-message dm-message--linear"
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        {profile ? (
          <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
            <button type="button" className="dm-message-avatar-btn">
              {avatarContent}
            </button>
          </IdentityHoverCard>
        ) : (
          <div className="dm-message-avatar">{avatarContent}</div>
        )}
        <div className="dm-message-content">
          <div className="dm-message-header">
            {profile ? (
              <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
                <button type="button" className="dm-message-sender">
                  {displayName}
                </button>
              </IdentityHoverCard>
            ) : (
              <span className="dm-message-sender">{displayName}</span>
            )}
            <Tooltip content={formatAbsoluteTime(message.createdAt)} position="top">
              <span className="dm-message-time">
                {formatMessageTime(message.createdAt)}
              </span>
            </Tooltip>
            {message.forwardSecrecy !== undefined && (
              <Tooltip
                content={message.forwardSecrecy
                  ? fsInfo.tooltip
                  : t('conversations.fsIndicatorOff', 'No forward secrecy. This message remains readable as long as your device keys exist.')
                }
                position="top"
              >
                <span
                  className={`dm-message-fs-indicator${message.forwardSecrecy ? ' dm-message-fs-indicator--active' : ''}`}
                >
                  {message.forwardSecrecy && `FS ${fsInfo.readableWindow}`}
                </span>
              </Tooltip>
            )}
            {countdown && (
              <span className="dm-message-expiry">{countdown}</span>
            )}
          </div>
          {messageBody}
          {reactionBar}
        </div>
        {showActions && !message.deleted && (
          <MessageActionBar
            isOwn={isOwn}
            onDeleteForSelf={() => onDelete(message.id, false)}
            onDeleteForEveryone={() => onDelete(message.id, true)}
            onReact={(emoji) => onReact(message.id, emoji)}
            favoriteEmojis={favoriteEmojis}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
          />
        )}
      </div>
    );

    if (message.deleted) return messageRow;

    return (
      <>
        <Menu.Root onSelect={handleContextAction}>
          <Menu.ContextTrigger asChild>{messageRow}</Menu.ContextTrigger>
          {contextMenuContent}
        </Menu.Root>
        {contextReactionPickerPopover}
      </>
    );
  }

  const applyOwnAlignment = isOwn;

  if (message.deleted) {
    return (
      <div className={`dm-message${applyOwnAlignment ? ' dm-message--own' : ''}`}>
        <div className="dm-message-bubble-wrapper">
          <div className={`dm-message-bubble${applyOwnAlignment ? ' dm-message-bubble--own' : ''}`}>
            <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
              Message deleted
            </p>
          </div>
        </div>
      </div>
    );
  }

  const bubbleRow = (
    <div
      className={`dm-message${applyOwnAlignment ? ' dm-message--own' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isOwn && senderProfile && (
        <IdentityHoverCard
          identity={senderProfile}
          positioning={{ placement: 'right', gutter: 8 }}
        >
          <button type="button" className="dm-message-sender">
            {senderProfile.displayName}
          </button>
        </IdentityHoverCard>
      )}
      <div className="dm-message-bubble-wrapper">
        {showActions && (
          <MessageActionBar
            isOwn={isOwn}
            onDeleteForSelf={() => onDelete(message.id, false)}
            onDeleteForEveryone={() => onDelete(message.id, true)}
            onReact={(emoji) => onReact(message.id, emoji)}
            favoriteEmojis={favoriteEmojis}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
          />
        )}
        <div className={`dm-message-bubble${applyOwnAlignment ? ' dm-message-bubble--own' : ''}`}>
          {hasDecryptionError ? (
            <Tooltip content={decryptionDisplayText} position="bottom">
              <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                [{decryptionLabel}]
              </p>
            </Tooltip>
          ) : (
            <p className="dm-message-text">{content}</p>
          )}
        </div>
        {reactionBar}
      </div>
      <div className="dm-message-footer">
        <Tooltip content={formatAbsoluteTime(message.createdAt)} position="top">
          <span className="dm-message-time">
            {formatMessageTime(message.createdAt)}
          </span>
        </Tooltip>
        {message.forwardSecrecy !== undefined && (
          <Tooltip
            content={message.forwardSecrecy
              ? fsInfo.tooltip
              : t('conversations.fsIndicatorOff', 'No forward secrecy. This message remains readable as long as your device keys exist.')
            }
            position="top"
          >
            <span
              className={`dm-message-fs-indicator${message.forwardSecrecy ? ' dm-message-fs-indicator--active' : ''}`}
            >
              {message.forwardSecrecy && `FS ${fsInfo.readableWindow}`}
            </span>
          </Tooltip>
        )}
        {countdown && (
          <span className="dm-message-expiry">{countdown}</span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <Menu.Root onSelect={handleContextAction}>
        <Menu.ContextTrigger asChild>{bubbleRow}</Menu.ContextTrigger>
        {contextMenuContent}
      </Menu.Root>
      {contextReactionPickerPopover}
    </>
  );
});

function InviteMemberModal({
  open,
  onOpenChange,
  conversationId,
  currentParticipants,
  onCreateNewConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  currentParticipants: string[];
  onCreateNewConversation: () => void;
}) {
  const { t } = useTranslation();
  const { friends } = useFriends();
  const { addMember, getFormerMembers } = useConversations();
  const [searchQuery, setSearchQuery] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [formerMembers, setFormerMembers] = useState<FormerMember[]>([]);
  const [formerMembersLoaded, setFormerMembersLoaded] = useState(false);

  useEffect(() => {
    if (open && !formerMembersLoaded) {
      void getFormerMembers(conversationId).then((members) => {
        setFormerMembers(members);
        setFormerMembersLoaded(true);
      });
    }
    if (!open) {
      setSearchQuery('');
      setInviting(null);
      setFormerMembersLoaded(false);
      setFormerMembers([]);
    }
  }, [open, conversationId, formerMembersLoaded, getFormerMembers]);

  const currentParticipantSet = new Set(currentParticipants);
  const formerMemberSet = new Set(formerMembers.map((m) => m.id));

  const eligibleFriends = friends.filter(
    (f) => !currentParticipantSet.has(f.identity.id)
  );

  const filteredFriends = searchQuery.trim()
    ? eligibleFriends.filter(
        (f) =>
          f.identity.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.identity.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : eligibleFriends;

  const handleInvite = useCallback(
    async (identityId: string) => {
      setInviting(identityId);
      const success = await addMember(conversationId, identityId);
      setInviting(null);
      if (success) {
        onOpenChange(false);
      }
    },
    [addMember, conversationId, onOpenChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content invite-member-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('conversations.inviteMember.title', 'Invite Member')}
              </Dialog.Title>
            </div>

            <div className="invite-member-modal-notice">
              <Icon name="info" className="invite-member-modal-notice-icon" />
              <span>
                {t(
                  'conversations.inviteMember.privacyNote',
                  'Invitees will be able to see current and invited member lists, but the group name will be hidden until they join.'
                )}
              </span>
            </div>

            <div className="invite-member-modal-search">
              <Input
                inputSize="sm"
                leftIcon={<Icon name="search" />}
                placeholder={t('conversations.searchFriendsPlaceholder', 'Search friends...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="invite-member-modal-list">
              {filteredFriends.map((friend) => {
                const isFormer = formerMemberSet.has(friend.identity.id);
                const isInviting = inviting === friend.identity.id;

                return (
                  <div
                    key={friend.identity.id}
                    className={`invite-member-modal-item${isFormer ? ' invite-member-modal-item--former' : ''}`}
                  >
                    <div className="invite-member-modal-item-avatar">
                      {friend.identity.avatarUrl ? (
                        <img
                          src={friend.identity.avatarUrl}
                          alt=""
                          className="invite-member-modal-item-avatar-img"
                        />
                      ) : (
                        <span className="invite-member-modal-item-avatar-placeholder">
                          {friend.identity.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="invite-member-modal-item-text">
                      <span className="invite-member-modal-item-name">
                        {friend.identity.displayName}
                      </span>
                      <span className="invite-member-modal-item-username">
                        @{friend.identity.username}
                      </span>
                      {isFormer && (
                        <span className="invite-member-modal-item-left-badge">
                          {t('conversations.inviteMember.previouslyLeft', 'Previously left')}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleInvite(friend.identity.id)}
                      disabled={!!inviting}
                    >
                      {isInviting ? (
                        <span className="spinner spinner-sm" />
                      ) : (
                        t('conversations.inviteMember.invite', 'Invite')
                      )}
                    </Button>
                  </div>
                );
              })}

              {filteredFriends.length === 0 && (
                <div className="invite-member-modal-empty">
                  {searchQuery
                    ? t('conversations.noMatchingFriends', 'No matching friends')
                    : t('conversations.inviteMember.noEligible', 'No friends available to invite')}
                </div>
              )}
            </div>

            <div className="confirm-dialog-footer invite-member-modal-footer">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onCreateNewConversation();
                }}
                disabled={!!inviting}
              >
                {t('conversations.inviteMember.createNew', 'Create New Conversation Instead')}
              </Button>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={!!inviting}>
                {t('common.close', 'Close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function MessageComposer({
  conversationId,
  sending,
  sendTextMessage,
  useFs,
  onToggleFs,
}: {
  conversationId: string;
  sending: boolean;
  sendTextMessage: (
    conversationId: string,
    plaintext: string,
    options?: { useForwardSecrecy?: boolean }
  ) => Promise<unknown>;
  useFs: boolean;
  onToggleFs: () => void;
}) {
  const { t } = useTranslation();
  const [messageText, setMessageText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;

  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus();
    }
  }, [sending]);

  const handleSend = useCallback(async () => {
    const text = messageTextRef.current.trim();
    if (!conversationId || !text || sending) return;
    setMessageText('');
    await sendTextMessage(conversationId, convertShortcodes(text), { useForwardSecrecy: useFs });
    inputRef.current?.focus();
  }, [conversationId, sending, sendTextMessage, useFs]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend]
  );

  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = inputRef.current;
    if (!textarea) {
      setMessageText((prev) => prev + emoji);
      return;
    }
    const current = messageTextRef.current;
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    setMessageText(current.slice(0, start) + emoji + current.slice(end));
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, []);

  return (
    <div className="conversation-composer">
      <Tooltip
        content={useFs
          ? t('conversations.fsEnabled', 'Forward secrecy is on for this message')
          : t('conversations.fsDisabled', 'Forward secrecy is off for this message')
        }
        position="top"
      >
        <button
          type="button"
          className={`conversation-fs-toggle${useFs ? ' conversation-fs-toggle--active' : ''}`}
          onClick={onToggleFs}
        >
          FS
        </button>
      </Tooltip>
      <textarea
        ref={inputRef}
        className="conversation-composer-field"
        placeholder={t('conversations.messagePlaceholder', 'Type a message...')}
        value={messageText}
        onChange={(e) => {
          const raw = e.target.value;
          const converted = convertShortcodes(raw);
          if (converted !== raw) {
            const cursorPos = e.target.selectionStart ?? raw.length;
            const newCursorPos = Math.max(0, cursorPos - (raw.length - converted.length));
            setMessageText(converted);
            requestAnimationFrame(() => {
              inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
            });
          } else {
            setMessageText(raw);
          }
        }}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={sending}
      />
      <Popover.Root
        open={showEmojiPicker}
        onOpenChange={(e) => setShowEmojiPicker(e.open)}
        positioning={{ placement: 'top-end' }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="message-composer-emoji-btn"
            title={t('conversations.emojiButton', 'Emoji')}
          >
            <Icon name="smile" className="message-composer-emoji-icon" />
          </button>
        </Popover.Trigger>
        <Portal>
          <Popover.Positioner>
            <Popover.Content className="emoji-picker-popover">
              <EmojiPicker onEmojiSelect={handleEmojiSelect} />
            </Popover.Content>
          </Popover.Positioner>
        </Portal>
      </Popover.Root>
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
    setIsAtBottom,
    markConversationRead,
    sendTextMessage,
    loadMoreMessages,
    leaveGroup,
    removeMember,
    promoteToAdmin,
    terminateGroup,
    deleteMessage,
    renameGroup,
    fetchRecipientKeys,
  } = useConversations();

  const messageLayout = useMessageLayoutPreference();

  const {
    fetchReactions,
    addReaction,
    removeReaction,
    getGroupedReactions,
  } = useReactions(id ?? null);
  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  const isAtBottomLocalRef = useRef(true);
  const shouldScrollToBottomRef = useRef(true);
  const fetchedReactionsForRef = useRef<string | null>(null);
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);

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

  const handleToggleFs = useCallback(() => {
    setUseFs((v) => !v);
  }, []);

  const handleRename = useCallback(async () => {
    if (!id || !renameValue.trim() || renaming) return;
    setRenaming(true);
    await renameGroup(id, renameValue.trim());
    setRenameValue('');
    setRenaming(false);
  }, [id, renameValue, renaming, renameGroup]);

  const conversation = conversations.find((c) => c.id === id);

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
      isAtBottomLocalRef.current = true;
      shouldScrollToBottomRef.current = true;
      setIsAtBottom(true);
      fetchedReactionsForRef.current = null;
    }
  }, [id, activeConversationId, setActiveConversation, setIsAtBottom]);

  // Clear activeConversationId and scroll state when this view unmounts
  // (e.g. navigating to About / Settings) so the WebSocket handler correctly
  // increments unreads. React Router keeps the component mounted for
  // conversation-to-conversation navigation (same <Route>, different param),
  // so this only fires on a true route change away from /conversations/:id.
  const setActiveConversationRef = useRef(setActiveConversation);
  setActiveConversationRef.current = setActiveConversation;
  const setIsAtBottomRef = useRef(setIsAtBottom);
  setIsAtBottomRef.current = setIsAtBottom;

  useEffect(() => {
    return () => {
      setActiveConversationRef.current(null);
      isAtBottomLocalRef.current = false;
      setIsAtBottomRef.current(false);
    };
  }, []);

  useEffect(() => {
    if (!id || activeMessages.length === 0) return;

    const key = `${id}:${activeMessages.length}`;
    if (fetchedReactionsForRef.current === key) return;
    fetchedReactionsForRef.current = key;

    const messageIds = activeMessages.map((m) => m.id);
    void fetchReactions(messageIds);
  }, [id, activeMessages, fetchReactions]);

  useEffect(() => {
    if (shouldScrollToBottomRef.current) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
      });
      shouldScrollToBottomRef.current = false;
    }
  }, [activeMessages.length]);

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!id || !conversation) return;
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      pendingReactionsRef.current.add(key);
      try {
        const targetMsg = activeMessages.find((m) => m.id === messageId);
        const useForwardSecrecy = targetMsg?.forwardSecrecy ?? false;
        const recipients = await fetchRecipientKeys(conversation.participants, useForwardSecrecy);
        if (recipients.length === 0) return;
        await addReaction(messageId, emoji, recipients);
      } finally {
        pendingReactionsRef.current.delete(key);
      }
    },
    [id, conversation, activeMessages, addReaction, fetchRecipientKeys]
  );

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string, ownReactionId?: string) => {
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      if (ownReactionId) {
        pendingReactionsRef.current.add(key);
        try {
          await removeReaction(ownReactionId, messageId);
        } finally {
          pendingReactionsRef.current.delete(key);
        }
      } else {
        await handleReact(messageId, emoji);
      }
    },
    [removeReaction, handleReact]
  );

  const handleStartReached = useCallback(() => {
    if (activeMessagesCursor && !messagesLoading) {
      loadMoreMessages();
    }
  }, [activeMessagesCursor, messagesLoading, loadMoreMessages]);

  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      const wasAtBottom = isAtBottomLocalRef.current;
      isAtBottomLocalRef.current = atBottom;
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom);

      if (atBottom && !wasAtBottom && id) {
        markConversationRead(id);
      }
    },
    [setIsAtBottom, markConversationRead, id]
  );

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'smooth' });
  }, []);

  const handleLeaveClick = useCallback(() => {
    if (!conversation) return;
    const isAdmin = identity?.id && conversation.admins.includes(identity.id);
    const otherAdmins = conversation.admins.filter((a) => a !== identity?.id);
    const isSoleMember = conversation.participants.length <= 1;

    if (isAdmin && otherAdmins.length === 0 && !isSoleMember) {
      setAdminTransferOpen(true);
    } else {
      setLeaveConfirmOpen(true);
    }
  }, [conversation, identity?.id]);

  const handleLeaveConfirm = useCallback(async () => {
    if (!id) return;
    setLeaving(true);
    const left = await leaveGroup(id);
    setLeaving(false);
    setLeaveConfirmOpen(false);
    if (left) navigate('/');
  }, [id, leaveGroup, navigate]);

  const handleAdminTransferLeave = useCallback(
    async (options: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }) => {
      if (!id) return;
      setLeaving(true);
      const left = await leaveGroup(id, options);
      setLeaving(false);
      setAdminTransferOpen(false);
      if (left) navigate('/');
    },
    [id, leaveGroup, navigate]
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!id) return;
    setDeletingGroup(true);
    const deleted = await terminateGroup(id);
    setDeletingGroup(false);
    setDeleteGroupOpen(false);
    if (deleted) navigate('/');
  }, [id, terminateGroup, navigate]);

  const handlePromoteToAdmin = useCallback(
    async (memberId: string) => {
      if (!id) return;
      await promoteToAdmin(id, memberId);
    },
    [id, promoteToAdmin]
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!id) return;
      await removeMember(id, memberId);
    },
    [id, removeMember]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!id) return;
      deleteMessage(id, messageId, forEveryone);
    },
    [id, deleteMessage]
  );

  const fsInfo = useMemo(() => {
    const levelConfig = SECURITY_LEVEL_CONFIG[fsConfig.securityLevel];
    const rotationLabel = formatRotationInterval(levelConfig.spkRotationIntervalMs);
    const hardDeleteLabel = formatRotationInterval(levelConfig.hardDeleteCapMs);
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
  }, [fsConfig.securityLevel, fsConfig.spkDeletionPolicy, fsConfig.clearCacheOnRotation]);

  const showArtifacts = identity ? loadShowMessageArtifacts(identity.id) : false;

  const reversedMessages = useMemo(() =>
    [...activeMessages]
      .reverse()
      .filter((msg) => {
        if (showArtifacts) return true;
        if (msg.messageType === 'system') return true;
        if (msg.deleted) return false;
        if (!msg.decryptedContent && msg.decryptionError) return false;
        return true;
      }),
    [activeMessages, showArtifacts]
  );

  const unreadCount = conversation?.unreadCount ?? 0;

  const flatItems = useMemo(() => {
    const items: ChatItem[] = [];
    const unreadIdx =
      unreadCount > 0 && unreadCount < reversedMessages.length
        ? reversedMessages.length - unreadCount
        : -1;

    for (let i = 0; i < reversedMessages.length; i++) {
      const msg = reversedMessages[i]!;
      const currDate = new Date(msg.createdAt);
      const prevMsg = i > 0 ? reversedMessages[i - 1] : null;
      const showDaySep = !prevMsg || !isSameDay(new Date(prevMsg.createdAt), currDate);

      if (i === unreadIdx) {
        items.push({ type: 'unread-separator', key: '__unread__' });
      }
      if (showDaySep) {
        items.push({ type: 'day-separator', date: currDate, key: `day-${msg.id}` });
      }
      items.push({ type: 'message', msg, key: msg.id });
    }
    return items;
  }, [reversedMessages, unreadCount]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);

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

  const isCurrentUserAdmin = !!(identity?.id && conversation.admins?.includes(identity.id));
  const isSoleMember = conversation.participants.length <= 1;

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
            {conversation.type === 'group' && isCurrentUserAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="conversation-toolbar-btn conversation-toolbar-btn--danger"
                onClick={() => setDeleteGroupOpen(true)}
              >
                {t('conversations.deleteGroup', 'Delete Group')}
              </Button>
            )}
            {conversation.type === 'group' && (
              <Button variant="ghost" size="sm" onClick={handleLeaveClick}>
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
            <div className="conversation-messages">
              {reversedMessages.length === 0 && !messagesLoading ? (
                <div className="conversation-messages-empty">
                  <p>{t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
                </div>
              ) : (
                <Virtuoso
                  ref={virtuosoRef}
                  className={`dm-messages${messageLayout === 'linear' ? ' dm-messages--linear' : ''}`}
                  data={flatItems}
                  computeItemKey={(_, item) => item.key}
                  firstItemIndex={FIRST_ITEM_INDEX - flatItems.length}
                  initialTopMostItemIndex={flatItems.length - 1}
                  alignToBottom
                  followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
                  startReached={handleStartReached}
                  atBottomStateChange={handleAtBottomStateChange}
                  atBottomThreshold={80}
                  overscan={{ main: 200, reverse: 200 }}
                  defaultItemHeight={60}
                  increaseViewportBy={{ top: 200, bottom: 200 }}
                  components={{
                    Header: () =>
                      messagesLoading ? (
                        <div className="dm-messages-loading">
                          <span className="spinner spinner-sm" />
                        </div>
                      ) : null,
                    Item: (props) => <div {...props} className="dm-messages-item" />,
                  }}
                  itemContent={(_, item) => {
                    if (item.type === 'unread-separator') {
                      return (
                        <div className="dm-unread-separator">
                          <div className="dm-unread-separator-line" />
                          <span className="dm-unread-separator-text">
                            {t('conversations.newUnreads', 'New messages')}
                          </span>
                          <div className="dm-unread-separator-line" />
                        </div>
                      );
                    }

                    if (item.type === 'day-separator') {
                      return (
                        <div className="dm-day-separator">
                          <div className="dm-day-separator-line" />
                          <span className="dm-day-separator-text">{formatDayLabel(item.date)}</span>
                          <div className="dm-day-separator-line" />
                        </div>
                      );
                    }

                    const msg = item.msg;
                    if (msg.messageType === 'system' && msg.systemEvent) {
                      return <SystemMessageRow event={msg.systemEvent} />;
                    }

                    return (
                      <MessageBubble
                        message={msg}
                        isOwn={msg.fromIdentityId === identity?.id}
                        onDelete={handleDeleteMessage}
                        onReact={(messageId, emoji) => void handleReact(messageId, emoji)}
                        onToggleReaction={(messageId, emoji, ownReactionId) => void handleToggleReaction(messageId, emoji, ownReactionId)}
                        groupedReactions={getGroupedReactions(msg.id)}
                        favoriteEmojis={favoriteEmojis}
                        onAddFavorite={addFavorite}
                        onRemoveFavorite={removeFavorite}
                        fsInfo={fsInfo}
                        senderProfile={msg.fromIdentityId !== identity?.id ? participantProfiles[msg.fromIdentityId] : undefined}
                        ownProfile={identity ?? undefined}
                        layout={messageLayout}
                        participantProfiles={participantProfiles}
                      />
                    );
                  }}
                />
              )}
            </div>

            {/* Scroll to bottom */}
            <Tooltip content={t('conversations.jumpToLatest', 'Jump to latest message')} position="top">
              <button
                type="button"
                className={`conversation-scroll-to-bottom${showScrollButton ? ' conversation-scroll-to-bottom--visible' : ''}`}
                onClick={scrollToBottom}
                aria-label={t('conversations.jumpToLatest', 'Jump to latest message')}
              >
                <Icon name="chevronDown" />
              </button>
            </Tooltip>

            <MessageComposer
              conversationId={id!}
              sending={sending}
              sendTextMessage={sendTextMessage}
              useFs={useFs}
              onToggleFs={handleToggleFs}
            />
          </div>

          {/* Settings sidebar */}
          {showSettings && (
            <div className="conversation-settings-sidebar">
              <div className="conversation-settings-header">
                <h3>{t('conversations.settings', 'Settings')}</h3>
              </div>
              <div className="conversation-settings-body">
                {conversation.type === 'group' && isCurrentUserAdmin && (
                  <div className="conversation-settings-rename">
                    <span className="app-settings-toggle-title">
                      {t('conversations.settingsRenameTitle', 'Group Name')}
                    </span>
                    <div className="conversation-settings-rename-row">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder={conversation.decryptedName ?? t('conversations.settingsRenamePlaceholder', 'Enter new name...')}
                        disabled={renaming}
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleRename}
                        disabled={!renameValue.trim() || renaming}
                      >
                        {renaming
                          ? <span className="spinner spinner-sm" />
                          : t('conversations.settingsRenameSave', 'Save')}
                      </Button>
                    </div>
                  </div>
                )}

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
              {conversation.type === 'dm' && (
                <div className="conversation-members-invite-row">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="conversation-members-invite-btn"
                    onClick={() => navigate('/conversations/new', {
                      state: { preSelectedIds: otherParticipants },
                    })}
                  >
                    <Icon name="plus" />
                    {t('conversations.addMember', 'Add Member')}
                  </Button>
                </div>
              )}
              {isCurrentUserAdmin && conversation.type === 'group' && (
                <div className="conversation-members-invite-row">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="conversation-members-invite-btn"
                    onClick={() => setInviteMemberOpen(true)}
                  >
                    <Icon name="plus" />
                    {t('conversations.inviteMember.button', 'Invite Member')}
                  </Button>
                </div>
              )}
              <div className="conversation-members-list">
                {conversation.participants.map((participantId) => {
                  const profile = participantProfiles[participantId];
                  const isSelf = participantId === identity?.id;
                  const name = isSelf
                    ? t('conversations.you', 'You')
                    : (profile?.displayName ?? profile?.username ?? participantId);
                  const initial = name.charAt(0).toUpperCase();
                  const isMemberAdmin = conversation.admins?.includes(participantId);

                  return (
                    <div key={participantId} className="conversation-member-item">
                      <Link to={`/identity/${participantId}`} className="conversation-member-item-link">
                        <div className="conversation-member-avatar">
                          {profile?.avatarUrl ? (
                            <img src={profile.avatarUrl} alt="" className="conversation-member-avatar-img" />
                          ) : (
                            <span className="conversation-member-avatar-placeholder">{initial}</span>
                          )}
                        </div>
                        <div className="conversation-member-info">
                          <span className="conversation-member-name">
                            {name}
                            {isMemberAdmin && (
                              <span className="conversation-member-admin-badge">
                                {t('conversations.admin', 'Admin')}
                              </span>
                            )}
                          </span>
                          {profile?.username && !isSelf && (
                            <span className="conversation-member-username">@{profile.username}</span>
                          )}
                        </div>
                      </Link>
                      {isCurrentUserAdmin && !isSelf && conversation.type === 'group' && (
                        <div className="conversation-member-actions">
                          {!isMemberAdmin && (
                            <Tooltip content={t('conversations.makeAdmin', 'Make Admin')} position="top">
                              <button
                                type="button"
                                className="conversation-member-action-btn"
                                onClick={() => void handlePromoteToAdmin(participantId)}
                              >
                                <Icon name="shield" className="conversation-member-action-icon" />
                              </button>
                            </Tooltip>
                          )}
                          {!isMemberAdmin && (
                            <Tooltip content={t('conversations.removeMember', 'Remove')} position="top">
                              <button
                                type="button"
                                className="conversation-member-action-btn conversation-member-action-btn--danger"
                                onClick={() => void handleRemoveMember(participantId)}
                              >
                                <Icon name="x" className="conversation-member-action-icon" />
                              </button>
                            </Tooltip>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Leave confirmation dialog */}
      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title={t('conversations.leaveGroup.title', 'Leave group?')}
        description={
          isSoleMember
            ? t('conversations.leaveGroup.lastMember', 'You are the last member. The group and all messages will be permanently deleted.')
            : t('conversations.leaveGroup.confirm', "You won't be able to rejoin without a new invite.")
        }
        confirmLabel={t('conversations.leaveGroup.confirmBtn', 'Leave')}
        variant={isSoleMember ? 'danger' : 'warning'}
        loading={leaving}
        onConfirm={handleLeaveConfirm}
      />

      {/* Admin transfer dialog */}
      {conversation.type === 'group' && (
        <AdminTransferDialog
          open={adminTransferOpen}
          onOpenChange={setAdminTransferOpen}
          members={conversation.participants
            .filter((p) => p !== identity?.id)
            .map((p) => ({
              id: p,
              displayName: participantProfiles[p]?.displayName,
              username: participantProfiles[p]?.username,
            }))}
          loading={leaving}
          onConfirm={handleAdminTransferLeave}
          onSkip={() => void handleAdminTransferLeave({ transferStrategy: 'oldest' })}
        />
      )}

      {/* Delete group confirmation dialog */}
      <ConfirmDialog
        open={deleteGroupOpen}
        onOpenChange={setDeleteGroupOpen}
        title={t('conversations.deleteGroup.title', 'Delete group?')}
        description={t('conversations.deleteGroup.confirm', 'This will permanently delete the group and all messages for everyone.')}
        confirmLabel={t('conversations.deleteGroup.confirmBtn', 'Delete')}
        variant="danger"
        loading={deletingGroup}
        onConfirm={handleDeleteGroup}
      />

      {/* Invite member modal (group admins only) */}
      {conversation.type === 'group' && isCurrentUserAdmin && (
        <InviteMemberModal
          open={inviteMemberOpen}
          onOpenChange={setInviteMemberOpen}
          conversationId={conversation.id}
          currentParticipants={conversation.participants}
          onCreateNewConversation={() => navigate('/conversations/new', {
            state: { preSelectedIds: otherParticipants },
          })}
        />
      )}
    </div>
  );
}
