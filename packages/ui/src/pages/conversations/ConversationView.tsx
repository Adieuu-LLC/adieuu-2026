/**
 * Conversation View Page
 *
 * Displays messages for a conversation with a message composer.
 * Uses the existing .conversation-* and .dm-message-* CSS classes
 * from the global stylesheet.
 */

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Checkbox, Dialog, Menu, Portal, Popover } from '@ark-ui/react';
import { Virtuoso } from 'react-virtuoso';
import { useConversations, type DisplayMessage } from '../../hooks/useConversations';
import { useConversationScroll } from '../../hooks/useConversationScroll';
import { useIdentity } from '../../hooks/useIdentity';
import { useFriends } from '../../hooks/useFriends';
import { usePreKeys } from '../../hooks/usePreKeys';
import { useReactions, type GroupedReaction } from '../../hooks/useReactions';
import { useFavoriteEmojis } from '../../hooks/useFavoriteEmojis';
import { loadConversationFsDefault, saveConversationFsDefault, loadShowMessageArtifacts, SECURITY_LEVEL_CONFIG } from '../../services/preKeyService';
import { convertShortcodes } from '../../utils/emojiShortcodes';
import { getEmojiMartShortcodeLabel } from '../../utils/emojiMartShortcode';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminTransferDialog } from '../../components/AdminTransferDialog';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { EmojiPicker } from '../../components/EmojiPicker';
import { ReportModal } from '../../components/ReportModal';
import { Tooltip } from '../../components/Tooltip';
import { useToast } from '../../components/Toast';
import { Icon } from '../../icons/Icon';
import { useMessageLayoutPreference } from '../../hooks/useMessageLayoutPreference';
import { useMemberColorPreference, setMemberColorDisplay, type MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { uploadMediaFile, type MediaUploadResult } from '../../hooks/useConversationMediaUpload';
import { serializePayload, mediaPayload, parsePayload, type MediaAttachment } from '../../services/messagePayload';
import { MediaMessage } from '../../components/MediaMessage';
import { useE2EMediaDownload, clearMediaCache } from '../../hooks/useE2EMediaDownload';
import { stripExifMetadata } from '../../utils/imageProcessing';
import { extractDomain } from '../../utils/urlParsing';
import { renderFormattedMessage } from '../../utils/markdownParser';
import { isDomainTrusted } from '../../hooks/useExternalLinkPreferences';
import { ExternalLinkModal } from '../../components/ExternalLinkModal';
import { encrypt as encryptBytes, randomBytes, toBase64 } from '@adieuu/crypto';
import { createApiClient } from '@adieuu/shared';
import type { SystemEvent, FormerMember, PublicIdentity } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import type { TFunction } from 'i18next';

function buildReplySnippet(parent: DisplayMessage | undefined, t: TFunction): string {
  if (!parent) return t('conversations.replyOriginal', 'Original message');
  if (parent.deleted) return t('conversations.replyDeleted', 'Message deleted');
  if (parent.messageType === 'system') return t('conversations.replySystem', 'System message');
  const raw = parent.decryptedContent?.trim();
  if (!raw) return t('conversations.replyOriginal', 'Original message');
  const parsed = parsePayload(raw);
  const text = parsed.text.trim();
  if (!text && parsed.attachments.length > 0) {
    return t('conversations.replyMediaOnly', 'Image');
  }
  if (!text) return t('conversations.replyOriginal', 'Original message');
  const words = text.split(/\s+/).filter(Boolean);
  const lead = words.slice(0, 6).join(' ');
  return words.length > 6 ? `${lead}…` : lead;
}

function replyComposerLabel(
  target: DisplayMessage,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  t: TFunction
): string {
  const name = resolveDisplayName(target.fromIdentityId, profiles, settings);
  const snippet = buildReplySnippet(target, t);
  return `${name}: ${snippet}`;
}

/** Preview of the quoted message author for inline reply UI (avatar + name). */
type ReplyQuoteAuthorPreview = {
  displayName: string;
  avatarUrl?: string;
};

function resolveQuotedAuthorPreview(
  parent: DisplayMessage | undefined,
  participantProfiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  self: PublicIdentity | null | undefined
): ReplyQuoteAuthorPreview | undefined {
  if (!parent) return undefined;
  const profile =
    parent.fromIdentityId === self?.id
      ? self ?? undefined
      : participantProfiles[parent.fromIdentityId];
  const nickname = settings[parent.fromIdentityId]?.nickname;
  if (nickname) {
    return { displayName: nickname, avatarUrl: profile?.avatarUrl };
  }
  if (profile) {
    return {
      displayName: profile.displayName?.trim() || profile.username || '?',
      avatarUrl: profile.avatarUrl,
    };
  }
  return { displayName: '?' };
}

const MEMBER_COLORS = [
  '#e57373', '#f06292', '#ba68c8', '#9575cd',
  '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1',
  '#4db6ac', '#81c784', '#aed581', '#dce775',
  '#ffd54f', '#ffb74d', '#ff8a65', '#a1887f',
] as const;

function MemberEditPanel({
  initialNickname,
  initialColor,
  onSave,
  onCancel,
}: {
  initialNickname: string;
  initialColor: string | undefined;
  onSave: (nickname: string, color: string | undefined) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initialNickname);
  const [color, setColor] = useState(initialColor);

  return (
    <div className="conversation-member-edit-panel">
      <label className="conversation-member-edit-field">
        <span className="conversation-member-edit-label">{t('conversations.nickname', 'Nickname')}</span>
        <input
          type="text"
          className="conversation-member-edit-input"
          placeholder={t('conversations.nicknamePlaceholder', 'Custom name...')}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
        />
      </label>
      <div className="conversation-member-edit-field">
        <span className="conversation-member-edit-label">{t('conversations.memberColor', 'Colour')}</span>
        <div className="conversation-member-color-swatches">
          <button
            type="button"
            className={`conversation-member-color-swatch conversation-member-color-swatch--none${!color ? ' conversation-member-color-swatch--active' : ''}`}
            onClick={() => setColor(undefined)}
            aria-label={t('conversations.clearColor', 'Clear colour')}
          />
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`conversation-member-color-swatch${color === c ? ' conversation-member-color-swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="conversation-member-edit-actions">
        <button type="button" className="conversation-member-edit-save" onClick={() => onSave(nickname, color)}>
          {t('conversations.saveMemberSettings', 'Save')}
        </button>
        <button type="button" className="conversation-member-edit-cancel" onClick={onCancel}>
          {t('conversations.cancelMemberSettings', 'Cancel')}
        </button>
      </div>
    </div>
  );
}

function resolveDisplayName(
  identityId: string,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  selfId?: string,
  t?: (key: string, fallback: string) => string,
): string {
  if (selfId && identityId === selfId && t) {
    return settings[identityId]?.nickname || t('conversations.you', 'You');
  }
  const nickname = settings[identityId]?.nickname;
  if (nickname) return nickname;
  const p = profiles[identityId];
  return p?.displayName ?? p?.username ?? identityId.slice(0, 8);
}

type ReplyQuotePayload = {
  text: string;
  onQuoteClick: () => void;
  quotedAuthor?: ReplyQuoteAuthorPreview;
};

function ReplyQuoteButton({ replyQuote }: { replyQuote: ReplyQuotePayload }) {
  const { text, quotedAuthor, onQuoteClick } = replyQuote;
  const ariaLabel = quotedAuthor ? `${quotedAuthor.displayName}: ${text}` : text;

  return (
    <button
      type="button"
      className="dm-message-reply-quote"
      onClick={(e) => {
        e.stopPropagation();
        onQuoteClick();
      }}
      aria-label={ariaLabel}
    >
      <span className="dm-message-reply-quote-inner">
        {quotedAuthor && (
          <>
            <span className="dm-message-reply-quote-avatar" aria-hidden>
              {quotedAuthor.avatarUrl ? (
                <img src={quotedAuthor.avatarUrl} alt="" className="dm-message-reply-quote-avatar-img" />
              ) : (
                <span className="dm-message-reply-quote-avatar-placeholder">
                  {quotedAuthor.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="dm-message-reply-quote-author">{quotedAuthor.displayName}</span>
          </>
        )}
        <span className="dm-message-reply-quote-snippet">{text}</span>
      </span>
    </button>
  );
}

const MESSAGE_ACTION_BAR_POPOVER_POSITIONING = { placement: 'top' as const, gutter: 0 };

function MessageActionBar({
  isOwn,
  onDeleteForSelf,
  onDeleteForEveryone,
  onReact,
  onReport,
  favoriteEmojis,
  onAddFavorite,
  onRemoveFavorite,
  onReply,
  onPopoverOpenChange,
}: {
  isOwn: boolean;
  onDeleteForSelf: () => void;
  onDeleteForEveryone: () => void;
  onReact: (emoji: string) => void;
  onReport?: () => void;
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onReply?: () => void;
  /** Called when the add-favourite or react emoji popover opens or closes (portaled outside the message row). */
  onPopoverOpenChange?: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [showFavPicker, setShowFavPicker] = useState(false);
  const [reactPickerOpen, setReactPickerOpen] = useState(false);

  useEffect(() => {
    onPopoverOpenChange?.(showFavPicker || reactPickerOpen);
  }, [showFavPicker, reactPickerOpen, onPopoverOpenChange]);

  useEffect(() => {
    return () => {
      onPopoverOpenChange?.(false);
    };
  }, [onPopoverOpenChange]);

  return (
    <div className={`message-action-bar${isOwn ? ' message-action-bar--own' : ''}`}>
      {onReply && (
        <Tooltip content={t('conversations.reply', 'Reply')} position="top">
          <button
            type="button"
            className="message-action-bar-btn"
            onClick={onReply}
            aria-label={t('conversations.reply', 'Reply')}
          >
            <Icon name="reply" className="message-action-bar-icon" />
          </button>
        </Tooltip>
      )}
      <div className="message-action-bar-favorites">
        {favoriteEmojis.map((emoji) => (
          <Tooltip
            key={emoji}
            content={`${getEmojiMartShortcodeLabel(emoji)} \u00b7 React \u00b7 Shift+click to remove`}
            position="top"
          >
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
            positioning={MESSAGE_ACTION_BAR_POPOVER_POSITIONING}
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
      <Popover.Root
        open={reactPickerOpen}
        onOpenChange={(e) => setReactPickerOpen(e.open)}
        positioning={MESSAGE_ACTION_BAR_POPOVER_POSITIONING}
      >
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
      {onReport && (
        <Menu.Root>
          <Menu.Trigger asChild>
            <button type="button" className="message-action-bar-btn" aria-label="More actions">
              <Icon name="ellipsis" className="message-action-bar-icon" />
            </button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content className="dm-context-menu">
                <Menu.Item
                  value="report"
                  className="dm-context-menu-item dm-context-menu-item--danger"
                  onClick={onReport}
                >
                  <Icon name="warning" className="dm-context-menu-item-icon" />
                  {t('report.reportMessage', 'Report Message')}
                </Menu.Item>
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      )}
    </div>
  );
}

function buildReactionTooltip(
  reaction: GroupedReaction,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  currentIdentityId: string | undefined,
): string {
  const shortcode = getEmojiMartShortcodeLabel(reaction.emoji);
  const MAX_NAMED = 3;

  const names: string[] = [];
  if (reaction.isOwn) names.push('You');

  for (const id of reaction.fromIdentityIds) {
    if (id === currentIdentityId) continue;
    if (names.length >= MAX_NAMED) break;
    names.push(resolveDisplayName(id, profiles, settings));
  }

  const othersCount = reaction.count - names.length;
  let label = names.join(', ');
  if (othersCount > 0) label += ` + ${othersCount} other${othersCount === 1 ? '' : 's'}`;

  return `${label} reacted with ${shortcode}`;
}

const ReactionChip = memo(
  function ReactionChip({
    messageId,
    emoji,
    count,
    isOwn,
    ownReactionId,
    tooltipContent,
    onToggleReaction,
  }: {
    messageId: string;
    emoji: string;
    count: number;
    isOwn: boolean;
    ownReactionId: string | undefined;
    tooltipContent: string;
    onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  }) {
    const prevCountRef = useRef<number | null>(null);
    const [countTick, setCountTick] = useState<'up' | 'down' | null>(null);

    const handleClick = useCallback(() => {
      onToggleReaction(messageId, emoji, ownReactionId);
    }, [messageId, emoji, ownReactionId, onToggleReaction]);

    useLayoutEffect(() => {
      const prev = prevCountRef.current;
      if (prev !== null && prev !== count) {
        setCountTick(count > prev ? 'up' : 'down');
        const id = window.setTimeout(() => setCountTick(null), 480);
        prevCountRef.current = count;
        return () => clearTimeout(id);
      }
      prevCountRef.current = count;
    }, [count]);

    const chipClass =
      `message-reaction-chip${isOwn ? ' message-reaction-chip--own' : ''}` +
      (countTick === 'up' ? ' message-reaction-chip--count-tick-up' : '') +
      (countTick === 'down' ? ' message-reaction-chip--count-tick-down' : '');

    const countClass =
      'message-reaction-chip-count' +
      (countTick === 'up' ? ' message-reaction-chip-count--tick-up' : '') +
      (countTick === 'down' ? ' message-reaction-chip-count--tick-down' : '');

    return (
      <Tooltip content={tooltipContent} position="top">
        <button type="button" className={chipClass} onClick={handleClick}>
          <span className="message-reaction-chip-emoji">{emoji}</span>
          <span className={countClass}>{count}</span>
        </button>
      </Tooltip>
    );
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.emoji === next.emoji &&
    prev.count === next.count &&
    prev.isOwn === next.isOwn &&
    prev.ownReactionId === next.ownReactionId &&
    prev.tooltipContent === next.tooltipContent &&
    prev.onToggleReaction === next.onToggleReaction
);

const ReactionBar = memo(function ReactionBar({
  messageId,
  reactions,
  onToggleReaction,
  participantProfiles,
  memberSettings,
  currentIdentityId,
}: {
  messageId: string;
  reactions: GroupedReaction[];
  onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  currentIdentityId: string | undefined;
}) {
  if (reactions.length === 0) return null;

  return (
    <div className="message-reaction-bar">
      {reactions.map((r) => (
        <ReactionChip
          key={`${messageId}:${r.emoji}`}
          messageId={messageId}
          emoji={r.emoji}
          count={r.count}
          isOwn={r.isOwn}
          ownReactionId={r.ownReactionId}
          tooltipContent={buildReactionTooltip(r, participantProfiles, memberSettings, currentIdentityId)}
          onToggleReaction={onToggleReaction}
        />
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.messageId !== next.messageId) return false;
  if (prev.currentIdentityId !== next.currentIdentityId) return false;
  if (prev.participantProfiles !== next.participantProfiles) return false;
  if (prev.memberSettings !== next.memberSettings) return false;
  const pr = prev.reactions;
  const nr = next.reactions;
  if (pr.length !== nr.length) return false;
  for (let i = 0; i < pr.length; i++) {
    if (pr[i]!.emoji !== nr[i]!.emoji || pr[i]!.count !== nr[i]!.count ||
        pr[i]!.isOwn !== nr[i]!.isOwn || pr[i]!.ownReactionId !== nr[i]!.ownReactionId) return false;
  }
  return true;
});

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

const MessageMediaAttachment = memo(function MessageMediaAttachment({
  attachment,
}: {
  attachment: MediaAttachment;
}) {
  const { state, imageUrl, rejectionReason, errorMessage, retry } =
    useE2EMediaDownload(attachment);

  return (
    <MediaMessage
      attachment={attachment}
      state={state}
      imageUrl={imageUrl ?? undefined}
      rejectionReason={rejectionReason ?? undefined}
      errorMessage={errorMessage ?? undefined}
      onRetry={retry}
    />
  );
});

const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  onDelete,
  onReact,
  onToggleReaction,
  onReport,
  groupedReactions,
  favoriteEmojis,
  onAddFavorite,
  onRemoveFavorite,
  fsInfo,
  senderProfile,
  ownProfile,
  layout,
  participantProfiles,
  memberSettings,
  memberColorDisplay,
  replyQuote,
  onReply,
  isFlashHighlight,
  onLinkClick,
}: {
  message: DisplayMessage;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onReact: (messageId: string, emoji: string) => void;
  onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  onReport: (messageId: string) => void;
  groupedReactions: GroupedReaction[];
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  fsInfo: { rotationLabel: string; readableWindow: string; tooltip: string };
  senderProfile?: PublicIdentity;
  ownProfile?: PublicIdentity;
  layout: 'linear' | 'bubble';
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  memberColorDisplay: MemberColorDisplay;
  replyQuote?: ReplyQuotePayload | null;
  onReply?: () => void;
  isFlashHighlight?: boolean;
  onLinkClick: (href: string) => void;
}) {
  const { t } = useTranslation();
  const [showActions, setShowActions] = useState(false);
  const [actionBarPopoverOpen, setActionBarPopoverOpen] = useState(false);
  const [showContextReactionPicker, setShowContextReactionPicker] = useState(false);
  const countdown = useExpiryCountdown(message.expiresAt);

  const rawContent = message.decryptedContent ?? '';
  const parsed = useMemo(() => parsePayload(rawContent), [rawContent]);
  const content = parsed.text;
  const renderedContent = useMemo(
    () => (content ? renderFormattedMessage(content, onLinkClick) : null),
    [content, onLinkClick],
  );
  const hasDecryptionError = !message.decryptedContent && !message.deleted;
  const isFsExpired = hasDecryptionError && message.decryptionError?.startsWith('forward-secrecy-expired:');
  const decryptionDisplayText = isFsExpired
    ? t('conversations.fsExpired', 'This message used a one-time key that has since been consumed. It cannot be decrypted again.')
    : (message.decryptionError ?? t('conversations.decryptFailed', 'Unable to decrypt'));
  const decryptionLabel = isFsExpired
    ? t('conversations.fsExpiredLabel', 'Forward secrecy key expired')
    : `Encrypted${message.decryptionError ? `: ${message.decryptionError}` : ''}`;

  function handleContextAction(details: { value: string }) {
    if (details.value === 'reply') onReply?.();
    else if (details.value === 'report') onReport(message.id);
    else if (details.value === 'delete-for-me') onDelete(message.id, false);
    else if (details.value === 'delete-for-everyone') onDelete(message.id, true);
    else if (details.value === 'react') {
      // Defer opening so the menu's close + pointer sequence does not immediately
      // count as an interact-outside dismiss on the new popover (Ark/Zag default).
      window.setTimeout(() => {
        setShowContextReactionPicker(true);
      }, 0);
    }
  }

  const contextMenuContent = (
    <Portal>
      <Menu.Positioner>
        <Menu.Content className="dm-context-menu">
          {onReply && !message.deleted && (
            <Menu.Item value="reply" className="dm-context-menu-item">
              <Icon name="reply" className="dm-context-menu-item-icon" />
              {t('conversations.reply', 'Reply')}
            </Menu.Item>
          )}
          <Menu.Item value="react" className="dm-context-menu-item">
            <Icon name="smilePlus" className="dm-context-menu-item-icon" />
            React
          </Menu.Item>
          {!isOwn && !message.deleted && (
            <Menu.Item value="report" className="dm-context-menu-item dm-context-menu-item--danger">
              <Icon name="warning" className="dm-context-menu-item-icon" />
              {t('report.reportMessage', 'Report Message')}
            </Menu.Item>
          )}
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
      messageId={message.id}
      reactions={groupedReactions}
      onToggleReaction={onToggleReaction}
      participantProfiles={participantProfiles}
      memberSettings={memberSettings}
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

  const senderColor = memberSettings[message.fromIdentityId]?.color;
  const senderNameStyle: React.CSSProperties | undefined = senderColor ? { color: senderColor } : undefined;
  const bubbleTintStyle: React.CSSProperties | undefined =
    senderColor && !isOwn && memberColorDisplay === 'name-and-bubble'
      ? { background: `color-mix(in srgb, ${senderColor} 8%, var(--color-bg-tertiary))` }
      : undefined;
  const avatarAccentStyle: React.CSSProperties | undefined =
    senderColor && !isOwn && memberColorDisplay === 'name-and-accent'
      ? { boxShadow: `0 0 0 2px ${senderColor}` }
      : undefined;
  const linearHoverStyle: React.CSSProperties | undefined =
    senderColor && memberColorDisplay !== 'name-only'
      ? ({ '--member-hover-bg': `color-mix(in srgb, ${senderColor} 6%, var(--color-bg-hover))` } as React.CSSProperties)
      : undefined;

  if (layout === 'linear') {
    const profile = isOwn ? ownProfile : senderProfile;
    const displayName = resolveDisplayName(message.fromIdentityId, participantProfiles, memberSettings);
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
      <>
        {renderedContent}
        {parsed.attachments.length > 1 ? (
          <div className="dm-message-attachments">
            {parsed.attachments.map((att) => (
              <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
            ))}
          </div>
        ) : (
          parsed.attachments.map((att) => (
            <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
          ))
        )}
      </>
    );

    const replyQuoteEl =
      replyQuote && !message.deleted ? <ReplyQuoteButton replyQuote={replyQuote} /> : null;

    const messageRow = (
      <div
        className={`dm-message dm-message--linear${isFlashHighlight ? ' dm-message--flash-highlight' : ''}`}
        style={linearHoverStyle}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => {
          if (!actionBarPopoverOpen) setShowActions(false);
        }}
      >
        {profile ? (
          <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
            <button type="button" className="dm-message-avatar-btn" style={avatarAccentStyle}>
              {avatarContent}
            </button>
          </IdentityHoverCard>
        ) : (
          <div className="dm-message-avatar" style={avatarAccentStyle}>{avatarContent}</div>
        )}
        <div className="dm-message-content">
          <div className="dm-message-header">
            {profile ? (
              <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
                <button type="button" className="dm-message-sender" style={senderNameStyle}>
                  {displayName}
                </button>
              </IdentityHoverCard>
            ) : (
              <span className="dm-message-sender" style={senderNameStyle}>{displayName}</span>
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
              <Tooltip content={t('conversations.ttlCountdown', 'This message will disappear when the timer expires')} position="top">
                <span className="dm-message-expiry">{countdown}</span>
              </Tooltip>
            )}
          </div>
          {replyQuoteEl}
          {messageBody}
          {reactionBar}
        </div>
        {showActions && !message.deleted && (
          <MessageActionBar
            isOwn={isOwn}
            onDeleteForSelf={() => onDelete(message.id, false)}
            onDeleteForEveryone={() => onDelete(message.id, true)}
            onReact={(emoji) => onReact(message.id, emoji)}
            onReport={!isOwn ? () => onReport(message.id) : undefined}
            favoriteEmojis={favoriteEmojis}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
            onReply={onReply}
            onPopoverOpenChange={setActionBarPopoverOpen}
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
      className={`dm-message${applyOwnAlignment ? ' dm-message--own' : ''}${isFlashHighlight ? ' dm-message--flash-highlight' : ''}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        if (!actionBarPopoverOpen) setShowActions(false);
      }}
    >
      {!isOwn && senderProfile && (
        <IdentityHoverCard
          identity={senderProfile}
          positioning={{ placement: 'right', gutter: 8 }}
        >
          <button type="button" className="dm-message-sender" style={senderNameStyle}>
            {resolveDisplayName(message.fromIdentityId, participantProfiles, memberSettings)}
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
            onReport={!isOwn ? () => onReport(message.id) : undefined}
            favoriteEmojis={favoriteEmojis}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
            onReply={onReply}
            onPopoverOpenChange={setActionBarPopoverOpen}
          />
        )}
        <div className={`dm-message-bubble${applyOwnAlignment ? ' dm-message-bubble--own' : ''}`} style={bubbleTintStyle}>
          {replyQuote && !message.deleted && <ReplyQuoteButton replyQuote={replyQuote} />}
          {hasDecryptionError ? (
            <Tooltip content={decryptionDisplayText} position="bottom">
              <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
                [{decryptionLabel}]
              </p>
            </Tooltip>
          ) : (
            <>
              {renderedContent}
              {parsed.attachments.length > 1 ? (
                <div className="dm-message-attachments">
                  {parsed.attachments.map((att) => (
                    <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
                  ))}
                </div>
              ) : (
                parsed.attachments.map((att) => (
                  <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
                ))
              )}
            </>
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
          <Tooltip content={t('conversations.ttlCountdown', 'This message will disappear when the timer expires')} position="top">
            <span className="dm-message-expiry">{countdown}</span>
          </Tooltip>
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
}, (prev, next) => {
  if (prev.isOwn !== next.isOwn) return false;
  if (prev.layout !== next.layout) return false;
  if (prev.isFlashHighlight !== next.isFlashHighlight) return false;
  if (prev.memberColorDisplay !== next.memberColorDisplay) return false;

  const pm = prev.message;
  const nm = next.message;
  if (pm.id !== nm.id) return false;
  if (pm.decryptedContent !== nm.decryptedContent) return false;
  if (pm.deleted !== nm.deleted) return false;
  if (pm.forwardSecrecy !== nm.forwardSecrecy) return false;
  if (pm.expiresAt !== nm.expiresAt) return false;
  if (pm.decryptionError !== nm.decryptionError) return false;
  if (pm.replyToMessageId !== nm.replyToMessageId) return false;

  if (prev.senderProfile?.id !== next.senderProfile?.id) return false;
  if (prev.senderProfile?.avatarUrl !== next.senderProfile?.avatarUrl) return false;
  if (prev.senderProfile?.displayName !== next.senderProfile?.displayName) return false;
  if (prev.ownProfile?.id !== next.ownProfile?.id) return false;
  if (prev.ownProfile?.avatarUrl !== next.ownProfile?.avatarUrl) return false;

  if (prev.participantProfiles !== next.participantProfiles) return false;
  if (prev.memberSettings !== next.memberSettings) return false;

  if (prev.fsInfo.rotationLabel !== next.fsInfo.rotationLabel ||
      prev.fsInfo.readableWindow !== next.fsInfo.readableWindow ||
      prev.fsInfo.tooltip !== next.fsInfo.tooltip) return false;

  const pr = prev.groupedReactions;
  const nr = next.groupedReactions;
  if (pr.length !== nr.length) return false;
  for (let i = 0; i < pr.length; i++) {
    if (pr[i]!.emoji !== nr[i]!.emoji || pr[i]!.count !== nr[i]!.count ||
        pr[i]!.isOwn !== nr[i]!.isOwn || pr[i]!.ownReactionId !== nr[i]!.ownReactionId) return false;
  }

  if (prev.favoriteEmojis.length !== next.favoriteEmojis.length) return false;
  for (let i = 0; i < prev.favoriteEmojis.length; i++) {
    if (prev.favoriteEmojis[i] !== next.favoriteEmojis[i]) return false;
  }

  const pq = prev.replyQuote;
  const nq = next.replyQuote;
  if (!pq !== !nq) return false;
  if (pq && nq) {
    if (pq.text !== nq.text) return false;
    if (pq.quotedAuthor?.displayName !== nq.quotedAuthor?.displayName) return false;
    if (pq.quotedAuthor?.avatarUrl !== nq.quotedAuthor?.avatarUrl) return false;
  }

  return true;
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

type AttachmentUploadStatus = 'pending' | 'encrypting' | 'uploading' | 'scanning' | 'done' | 'error';

/** Pending attachment state in the composer. */
interface PendingAttachment {
  file: File;
  previewUrl: string;
  uploadStatus: AttachmentUploadStatus;
  uploadProgress: number;
  uploadError?: string;
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const PLACEHOLDER_VERB_KEYS = [
  'message',
  'ping',
  'poke',
  'nudge',
  'sendLove',
  'whisper',
  'shout',
  'wave',
  'holla',
  'buzz',
  'serenade',
  'sing',
  'pigeon',
  'dropLine',
  'converse',
  'sonnet',
  'telepathy',
  'vibes',
  'beam',
  'raven',
  'smoke',
] as const;

const TTL_OPTIONS: { label: string; seconds: number }[] = [
  { label: '30s', seconds: 30 },
  { label: '1 min', seconds: 60 },
  { label: '5 min', seconds: 300 },
  { label: '10 min', seconds: 600 },
  { label: '15 min', seconds: 900 },
  { label: '30 min', seconds: 1800 },
  { label: '45 min', seconds: 2700 },
  { label: '1 hr', seconds: 3600 },
  { label: '1.5 hr', seconds: 5400 },
  { label: '3 hr', seconds: 10800 },
  { label: '6 hr', seconds: 21600 },
  { label: '12 hr', seconds: 43200 },
  { label: '18 hr', seconds: 64800 },
  { label: '24 hr', seconds: 86400 },
  { label: '36 hr', seconds: 129600 },
  { label: '48 hr', seconds: 172800 },
  { label: '1 week', seconds: 604800 },
  { label: '2 weeks', seconds: 1209600 },
];

function MessageComposer({
  conversationId,
  sending,
  sendTextMessage,
  useFs,
  onToggleFs,
  replyingTo,
  onCancelReply,
  onSendSucceeded,
  participantProfiles,
  memberSettings,
  onReplyClick,
  placeholderTarget,
}: {
  conversationId: string;
  sending: boolean;
  sendTextMessage: (
    conversationId: string,
    plaintext: string,
    options?: { useForwardSecrecy?: boolean; replyToMessageId?: string; e2eMediaIds?: string[]; expiresInSeconds?: number }
  ) => Promise<unknown>;
  useFs: boolean;
  onToggleFs: () => void;
  replyingTo: DisplayMessage | null;
  onCancelReply: () => void;
  /** Called after a message is accepted by the server so the list can scroll to show it. */
  onSendSucceeded?: () => void;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  /** Called when the user clicks the reply preview to jump to the referenced message. */
  onReplyClick?: () => void;
  /** Display name of the other participant (DM) or group name. */
  placeholderTarget?: string;
}) {
  const { t } = useTranslation();
  const { warning: toastWarning, error: toastError } = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [placeholderSeed, setPlaceholderSeed] = useState(0);

  const placeholder = useMemo(() => {
    if (!placeholderTarget) return t('conversations.messagePlaceholder', 'Type a message...');
    const key = PLACEHOLDER_VERB_KEYS[Math.floor(Math.random() * PLACEHOLDER_VERB_KEYS.length)]!;
    const verb = t(`conversations.placeholderVerbs.${key}` as const);
    return `${verb} ${placeholderTarget}...`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, placeholderTarget, placeholderSeed, t]);

  const [messageText, setMessageTextRaw] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stripExif, setStripExif] = useState(true);
  const [ttlSeconds, setTtlSeconds] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;

  // --- Undo / redo history ---
  const undoStack = useRef<{ text: string; cursor: number }[]>([{ text: '', cursor: 0 }]);
  const redoStack = useRef<{ text: string; cursor: number }[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMessageText = useCallback((next: string, cursor?: number) => {
    setMessageTextRaw(next);

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      const top = undoStack.current[undoStack.current.length - 1];
      if (top && top.text === next) return;
      undoStack.current.push({ text: next, cursor: cursor ?? next.length });
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
    }, 300);
  }, []);

  // --- Composer mini-toast ---
  const [composerToast, setComposerToast] = useState<string | null>(null);
  const composerToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showComposerToast = useCallback((label: string) => {
    if (composerToastTimer.current) clearTimeout(composerToastTimer.current);
    setComposerToast(label);
    composerToastTimer.current = setTimeout(() => setComposerToast(null), 1500);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let oversized = false;
    const newAttachments: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        oversized = true;
        continue;
      }
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS) break;
      newAttachments.push({ file, previewUrl: URL.createObjectURL(file), uploadStatus: 'pending', uploadProgress: 0 });
    }

    if (oversized) {
      const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
      toastWarning(
        t('conversations.fileTooLarge', 'File too large'),
        t('conversations.fileTooLargeDesc', 'Attachments must be under {{maxMb}} MB.', { maxMb })
      );
    }

    setAttachments((prev) => [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachments.length, toastWarning, t]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1);
      removed.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [conversationId]);

  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus();
    }
  }, [sending]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [replyingTo]);

  const [isMultiLine, setIsMultiLine] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    el.style.height = `${scrollH}px`;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const verticalPadding = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const multi = scrollH > lineHeight + verticalPadding + 2;
    setIsMultiLine(multi);
    el.style.overflowY = scrollH >= 500 ? 'auto' : 'hidden';
  }, [messageText]);

  const updateAttachmentStatus = useCallback((index: number, patch: Partial<PendingAttachment>) => {
    setAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }, []);

  const handleSend = useCallback(async () => {
    const text = messageTextRef.current.trim();
    if (!conversationId || (!text && attachments.length === 0) || sending || uploadingMedia) return;

    const pendingAttachments = [...attachments];
    setMessageText('');
    undoStack.current = [{ text: '', cursor: 0 }];
    redoStack.current = [];

    if (pendingAttachments.length > 0) {
      setUploadingMedia(true);

      interface UploadedMedia extends MediaUploadResult {
        encryptionKey: string;
        encryptionNonce: string;
      }

      let uploadedMedia: UploadedMedia[];

      try {
        const settled = await Promise.allSettled(
          pendingAttachments.map(async (att, i) => {
            updateAttachmentStatus(i, { uploadStatus: 'encrypting', uploadProgress: 5 });

            const fileToEncrypt = stripExif ? await stripExifMetadata(att.file) : att.file;
            const fileBytes = new Uint8Array(await fileToEncrypt.arrayBuffer());
            const mediaKey = randomBytes(32);
            const { ciphertext, nonce } = encryptBytes(mediaKey, fileBytes);
            const encryptedBlob = new Blob([ciphertext.buffer as ArrayBuffer], { type: 'application/octet-stream' });

            updateAttachmentStatus(i, { uploadStatus: 'uploading', uploadProgress: 15 });

            const result = await uploadMediaFile(api, att.file, encryptedBlob, { stripExif });

            updateAttachmentStatus(i, { uploadStatus: 'done', uploadProgress: 100 });

            return {
              ...result,
              encryptionKey: toBase64(mediaKey),
              encryptionNonce: toBase64(nonce),
            };
          }),
        );

        const results: UploadedMedia[] = [];
        let firstError: string | undefined;

        for (let i = 0; i < settled.length; i++) {
          const s = settled[i]!;
          if (s.status === 'fulfilled') {
            results.push(s.value);
          } else {
            const errorMsg = s.reason instanceof Error
              ? s.reason.message
              : t('conversations.uploadFailed', 'Upload failed');
            updateAttachmentStatus(i, { uploadStatus: 'error', uploadError: errorMsg });
            firstError ??= errorMsg;
          }
        }

        if (firstError) {
          toastError(t('conversations.uploadFailed', 'Upload failed'), firstError);
          setUploadingMedia(false);
          return;
        }

        uploadedMedia = results;
      } catch (err) {
        console.error('[Composer] Media upload failed:', err);
        toastError(
          t('conversations.uploadFailed', 'Upload failed'),
          err instanceof Error ? err.message : t('conversations.uploadFailedDesc', 'One or more attachments could not be uploaded.')
        );
        setUploadingMedia(false);
        return;
      }

      setUploadingMedia(false);

      const mediaAttachments: MediaAttachment[] = uploadedMedia.map((m) => ({
        e2eMediaId: m.e2eMediaId,
        scanHash: m.scanHash,
        contentType: m.contentType,
        fileName: m.fileName,
        width: m.width,
        height: m.height,
        sizeBytes: m.sizeBytes,
        exifPreserved: m.exifPreserved,
        encryptionKey: m.encryptionKey,
        encryptionNonce: m.encryptionNonce,
      }));

      const payload = mediaPayload(convertShortcodes(text) || undefined, mediaAttachments);
      const plaintext = serializePayload(payload);
      const e2eMediaIds = uploadedMedia.map((m) => m.e2eMediaId);

      const sent = await sendTextMessage(conversationId, plaintext, {
        useForwardSecrecy: useFs,
        ...(replyingTo ? { replyToMessageId: replyingTo.id } : {}),
        ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
        e2eMediaIds,
      });

      onCancelReply();
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
      if (sent != null) {
        onSendSucceeded?.();
        setPlaceholderSeed((s) => s + 1);
      }
      inputRef.current?.focus();
    } else {
      const sent = await sendTextMessage(conversationId, convertShortcodes(text), {
        useForwardSecrecy: useFs,
        ...(replyingTo ? { replyToMessageId: replyingTo.id } : {}),
        ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
      });
      onCancelReply();
      if (sent != null) {
        onSendSucceeded?.();
        setPlaceholderSeed((s) => s + 1);
      }
      inputRef.current?.focus();
    }
  }, [conversationId, sending, uploadingMedia, sendTextMessage, useFs, replyingTo, onCancelReply, onSendSucceeded, attachments, stripExif, api, updateAttachmentStatus, toastError, t, ttlSeconds]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let oversized = false;
      const imageFiles: File[] = [];
      let hasTextData = false;
      for (const item of Array.from(items)) {
        if (item.type === 'text/plain') hasTextData = true;
        if (!item.type.startsWith('image/') || !ACCEPTED_IMAGE_TYPES.includes(item.type)) continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > MAX_ATTACHMENT_BYTES) {
          oversized = true;
          continue;
        }
        imageFiles.push(file);
      }

      if (imageFiles.length === 0 && !oversized) {
        if (hasTextData) showComposerToast(t('conversations.pasted', 'Pasted'));
        return;
      }

      e.preventDefault();

      if (oversized) {
        const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
        toastWarning(
          t('conversations.fileTooLarge', 'File too large'),
          t('conversations.fileTooLargeDesc', 'Attachments must be under {{maxMb}} MB.', { maxMb })
        );
      }

      if (imageFiles.length === 0) return;

      showComposerToast(t('conversations.pasted', 'Pasted'));

      setAttachments((prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        if (remaining <= 0) return prev;
        const toAdd = imageFiles.slice(0, remaining).map((file) => {
          const ext = file.type.split('/')[1] ?? 'png';
          const named = new File(
            [file],
            file.name && file.name !== 'image.png'
              ? file.name
              : `pasted-${Date.now()}.${ext}`,
            { type: file.type }
          );
          return { file: named, previewUrl: URL.createObjectURL(named), uploadStatus: 'pending' as const, uploadProgress: 0 };
        });
        return [...prev, ...toAdd];
      });
    },
    [toastWarning, t, showComposerToast]
  );

  const handleCopy = useCallback(() => {
    showComposerToast(t('conversations.copied', 'Copied'));
  }, [showComposerToast, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.current.length <= 1) return;
        const current = undoStack.current.pop()!;
        redoStack.current.push(current);
        const prev = undoStack.current[undoStack.current.length - 1]!;
        setMessageTextRaw(prev.text);
        messageTextRef.current = prev.text;
        requestAnimationFrame(() => {
          inputRef.current?.setSelectionRange(prev.cursor, prev.cursor);
        });
        return;
      }
      if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z'))) {
        e.preventDefault();
        if (redoStack.current.length === 0) return;
        const next = redoStack.current.pop()!;
        undoStack.current.push(next);
        setMessageTextRaw(next.text);
        messageTextRef.current = next.text;
        requestAnimationFrame(() => {
          inputRef.current?.setSelectionRange(next.cursor, next.cursor);
        });
        return;
      }
    },
    [handleSend]
  );

  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = inputRef.current;
    if (!textarea) {
      setMessageText(messageTextRef.current + emoji);
      return;
    }
    const current = messageTextRef.current;
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const newPos = start + emoji.length;
    setMessageText(current.slice(0, start) + emoji + current.slice(end), newPos);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [setMessageText]);

  return (
    <div className="conversation-composer">
      {composerToast && (
        <div className="conversation-composer-mini-toast" role="status" aria-live="polite">
          {composerToast}
        </div>
      )}
      {replyingTo && (
        <div className="conversation-composer-reply">
          <button
            type="button"
            className="conversation-composer-reply-text"
            title={replyComposerLabel(replyingTo, participantProfiles, memberSettings, t)}
            onClick={onReplyClick}
          >
            {replyComposerLabel(replyingTo, participantProfiles, memberSettings, t)}
          </button>
          <button
            type="button"
            className="conversation-composer-reply-cancel"
            onClick={onCancelReply}
            aria-label={t('conversations.cancelReply', 'Cancel reply')}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="conversation-composer-attachments">
          <div className="conversation-composer-attachments-thumbs">
            {attachments.map((att, idx) => (
              <div key={att.previewUrl} className={`conversation-composer-attachment conversation-composer-attachment--${att.uploadStatus}`}>
                <img src={att.previewUrl} alt="" className="conversation-composer-attachment-thumb" />
                {att.uploadStatus !== 'pending' && att.uploadStatus !== 'done' && (
                  <div className="conversation-composer-attachment-overlay">
                    {att.uploadStatus === 'error' ? (
                      <span className="conversation-composer-attachment-error-icon" title={att.uploadError}>
                        <Icon name="error" />
                      </span>
                    ) : (
                      <span className="conversation-composer-attachment-spinner" />
                    )}
                  </div>
                )}
                {att.uploadStatus === 'done' && (
                  <div className="conversation-composer-attachment-done">
                    <Icon name="success" />
                  </div>
                )}
                {att.uploadStatus === 'pending' && (
                  <button
                    type="button"
                    className="conversation-composer-attachment-remove"
                    onClick={() => removeAttachment(idx)}
                    aria-label={t('conversations.removeAttachment', 'Remove attachment')}
                  >
                    <Icon name="x" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="conversation-composer-exif-row">
            <Checkbox.Root
              checked={!stripExif}
              onCheckedChange={(e) => setStripExif(e.checked !== true)}
              className="conversation-composer-exif-toggle"
            >
              <Checkbox.Control className="conversation-composer-exif-control" />
              <Checkbox.Label className="conversation-composer-exif-label">
                {t('conversations.includeMetadata', 'Include original metadata')}
              </Checkbox.Label>
              <Checkbox.HiddenInput />
            </Checkbox.Root>
            <Tooltip
              content={t(
                'conversations.metadataWarning',
                'Images often contain metadata (EXIF) such as location, device info, and timestamps that could compromise your privacy or anonymity. By default, we strip this data. Enable this only if you understand the risks.'
              )}
              position="top"
            >
              <span className="conversation-composer-exif-info">
                <Icon name="info" />
              </span>
            </Tooltip>
          </div>
        </div>
      )}
      <div className={`conversation-composer-row${isMultiLine ? ' conversation-composer-row--multiline' : ''}`}>
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
            onClick={() => { onToggleFs(); requestAnimationFrame(() => inputRef.current?.focus()); }}
          >
            FS
          </button>
        </Tooltip>
        <Tooltip
          content={t('conversations.attachMedia', 'Attach image')}
          position="top"
        >
          <button
            type="button"
            className="conversation-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingMedia || attachments.length >= MAX_ATTACHMENTS}
          >
            <Icon name="image" />
          </button>
        </Tooltip>
        <Menu.Root
          onSelect={(details) => {
            const val = details.value;
            if (val === 'off') {
              setTtlSeconds(undefined);
            } else {
              setTtlSeconds(Number(val));
            }
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
          positioning={{ placement: 'top-start' }}
        >
          <Tooltip
            content={ttlSeconds
              ? t('conversations.ttlActive', 'Message expires after {{ttl}}', { ttl: TTL_OPTIONS.find((o) => o.seconds === ttlSeconds)?.label ?? '' })
              : t('conversations.ttlOff', 'Set message expiry')
            }
            position="top"
          >
            <span style={{ display: 'inline-flex' }}>
              <Menu.Trigger asChild>
                <button
                  type="button"
                  className={`conversation-ttl-toggle${ttlSeconds ? ' conversation-ttl-toggle--active' : ''}`}
                >
                  <Icon name="clock" />
                </button>
              </Menu.Trigger>
            </span>
          </Tooltip>
          <Portal>
            <Menu.Positioner>
              <Menu.Content className="conversation-ttl-menu">
                {ttlSeconds && (
                  <Menu.Item value="off" className="conversation-ttl-menu-item conversation-ttl-menu-item--off">
                    {t('conversations.ttlDisable', 'Off')}
                  </Menu.Item>
                )}
                {TTL_OPTIONS.map((opt) => (
                  <Menu.Item
                    key={opt.seconds}
                    value={String(opt.seconds)}
                    className={`conversation-ttl-menu-item${ttlSeconds === opt.seconds ? ' conversation-ttl-menu-item--selected' : ''}`}
                  >
                    {opt.label}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <textarea
          ref={inputRef}
          className="conversation-composer-field"
          placeholder={placeholder}
          value={messageText}
          onChange={(e) => {
            const raw = e.target.value;
            const converted = convertShortcodes(raw);
            if (converted !== raw) {
              const cursorPos = e.target.selectionStart ?? raw.length;
              const newCursorPos = Math.max(0, cursorPos - (raw.length - converted.length));
              setMessageText(converted, newCursorPos);
              requestAnimationFrame(() => {
                inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
              });
            } else {
              const cursorPos = e.target.selectionStart ?? raw.length;
              setMessageText(raw, cursorPos);
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={handleCopy}
          rows={1}
          disabled={sending || uploadingMedia}
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
    </div>
  );
}

export function ConversationView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
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
    updateMemberSettings,
    memberSettings,
    fetchRecipientKeys,
  } = useConversations();

  const messageLayout = useMessageLayoutPreference();
  const memberColorDisplay = useMemberColorPreference();

  const {
    fetchReactions,
    addReaction,
    removeReaction,
    getGroupedReactions,
  } = useReactions(id ?? null);
  const { favorites: favoriteEmojis, addFavorite, removeFavorite } = useFavoriteEmojis(identity?.id);

  const {
    virtuosoRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    followOutput,
    handleAtBottomStateChange,
    scrollToBottom,
    scrollToBottomIfPinned,
    markJustSent,
    saveVisibleIndex,
    cachedScrollIndex,
  } = useConversationScroll({ conversationId: id, setIsAtBottom, markConversationRead });

  const fetchedReactionsForRef = useRef<string | null>(null);
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const pendingScrollToRef = useRef<string | null>(null);
  const replyScrollLoadAttemptsRef = useRef(0);
  const [replyingTo, setReplyingTo] = useState<DisplayMessage | null>(null);
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [pendingLinkHref, setPendingLinkHref] = useState<string | null>(null);

  const handleLinkClick = useCallback((href: string) => {
    const domain = extractDomain(href);
    if (domain && isDomainTrusted(domain)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      setPendingLinkHref(href);
    }
  }, []);
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

  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const showArtifacts = identity ? loadShowMessageArtifacts(identity.id) : false;

  const reversedMessages = useMemo(
    () =>
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

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
      fetchedReactionsForRef.current = null;
    }
  }, [id, activeConversationId, setActiveConversation]);

  useEffect(() => {
    setReplyingTo(null);
    setFlashingMessageId(null);
    pendingScrollToRef.current = null;
    replyScrollLoadAttemptsRef.current = 0;
    clearMediaCache();
  }, [id]);

  // Clear activeConversationId and scroll state when this view unmounts
  // (e.g. navigating to About / Settings) so the WebSocket handler correctly
  // increments unreads. React Router keeps the component mounted for
  // conversation-to-conversation navigation (same <Route>, different param),
  // so this only fires on a true route change away from /conversations/:id.
  const setActiveConversationRef = useRef(setActiveConversation);
  setActiveConversationRef.current = setActiveConversation;
  const setIsAtBottomUnmountRef = useRef(setIsAtBottom);
  setIsAtBottomUnmountRef.current = setIsAtBottom;

  useEffect(() => {
    return () => {
      setActiveConversationRef.current(null);
      setIsAtBottomUnmountRef.current(false);
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

  const handleReact = useCallback(
    async (messageId: string, emoji: string) => {
      if (!id || !conversationRef.current) return;
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      pendingReactionsRef.current.add(key);
      try {
        const targetMsg = activeMessagesRef.current.find((m) => m.id === messageId);
        const useForwardSecrecy = targetMsg?.forwardSecrecy ?? false;
        const recipients = await fetchRecipientKeys(conversationRef.current.participants, useForwardSecrecy);
        if (recipients.length === 0) return;
        await addReaction(messageId, emoji, recipients);
        scrollToBottomIfPinned();
      } finally {
        pendingReactionsRef.current.delete(key);
      }
    },
    [id, addReaction, fetchRecipientKeys, scrollToBottomIfPinned]
  );

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string, ownReactionId?: string) => {
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      if (ownReactionId) {
        pendingReactionsRef.current.add(key);
        try {
          await removeReaction(ownReactionId, messageId);
          scrollToBottomIfPinned();
        } finally {
          pendingReactionsRef.current.delete(key);
        }
      } else {
        await handleReact(messageId, emoji);
      }
    },
    [removeReaction, handleReact, scrollToBottomIfPinned]
  );

  const handleStartReached = useCallback(() => {
    if (activeMessagesCursor && !messagesLoading) {
      loadMoreMessages();
    }
  }, [activeMessagesCursor, messagesLoading, loadMoreMessages]);

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

  const closeMemberEdit = useCallback(() => {
    setEditingMemberId(null);
  }, []);

  const saveMemberEdit = useCallback(async (memberId: string, nickname: string, color: string | undefined) => {
    if (!id) return;
    const updated: MemberSettingsMap = { ...memberSettings };
    const trimmed = nickname.trim();
    if (trimmed || color) {
      updated[memberId] = {
        ...(trimmed ? { nickname: trimmed } : {}),
        ...(color ? { color } : {}),
      };
    } else {
      delete updated[memberId];
    }
    await updateMemberSettings(id, updated);
    closeMemberEdit();
  }, [id, memberSettings, updateMemberSettings, closeMemberEdit]);

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!id) return;
      deleteMessage(id, messageId, forEveryone);
    },
    [id, deleteMessage]
  );

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<string | undefined>();

  const handleReportMessage = useCallback(
    (messageId: string) => {
      setReportTargetMessageId(messageId);
      setReportModalOpen(true);
    },
    []
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

  const virtuosoComponents = useMemo(() => ({
    Header: () =>
      messagesLoading ? (
        <div className="dm-messages-loading">
          <span className="spinner spinner-sm" />
        </div>
      ) : null,
    Item: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} className="dm-messages-item" />,
  }), [messagesLoading]);

  const unreadCount = conversation?.unreadCount ?? 0;

  const messagesById = useMemo(() => {
    const m = new Map<string, DisplayMessage>();
    for (const msg of activeMessages) {
      m.set(msg.id, msg);
    }
    return m;
  }, [activeMessages]);

  const [expiryTick, setExpiryTick] = useState(0);

  useEffect(() => {
    const hasExpiring = reversedMessages.some((m) => m.expiresAt);
    if (!hasExpiring) return;
    const interval = setInterval(() => setExpiryTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [reversedMessages]);

  const flatItems = useMemo(() => {
    const now = Date.now();
    const items: ChatItem[] = [];
    const unreadIdx =
      unreadCount > 0 && unreadCount < reversedMessages.length
        ? reversedMessages.length - unreadCount
        : -1;

    for (let i = 0; i < reversedMessages.length; i++) {
      const msg = reversedMessages[i]!;
      if (msg.expiresAt && new Date(msg.expiresAt).getTime() <= now) continue;

      const currDate = new Date(msg.createdAt);
      const prevItem = items.length > 0 ? items[items.length - 1] : null;
      const prevMsgDate = prevItem?.type === 'message' ? new Date(prevItem.msg.createdAt) : null;
      const showDaySep = !prevMsgDate || !isSameDay(prevMsgDate, currDate);

      if (i === unreadIdx) {
        items.push({ type: 'unread-separator', key: '__unread__' });
      }
      if (showDaySep) {
        items.push({ type: 'day-separator', date: currDate, key: `day-${msg.id}` });
      }
      items.push({ type: 'message', msg, key: msg.id });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reversedMessages, unreadCount, expiryTick]);

  const flatItemsLengthRef = useRef(flatItems.length);
  flatItemsLengthRef.current = flatItems.length;

  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    const firstItemIndex = FIRST_ITEM_INDEX - flatItemsLengthRef.current;
    const dataIndex = range.startIndex - firstItemIndex;
    saveVisibleIndex(dataIndex);
  }, [saveVisibleIndex]);

  /** Keep in sync with `.dm-message--flash-highlight` animation duration in styles.scss. */
  const FLASH_HIGHLIGHT_MS = 2800;

  const flashMessageHighlight = useCallback((targetId: string) => {
    setFlashingMessageId(targetId);
    window.setTimeout(() => {
      setFlashingMessageId((prev) => (prev === targetId ? null : prev));
    }, FLASH_HIGHLIGHT_MS);
  }, []);

  const scrollToMessageId = useCallback(
    (targetId: string) => {
      replyScrollLoadAttemptsRef.current = 0;
      const idx = flatItems.findIndex((i) => i.type === 'message' && i.msg.id === targetId);
      if (idx >= 0) {
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
        window.setTimeout(() => flashMessageHighlight(targetId), 350);
        return;
      }
      pendingScrollToRef.current = targetId;
    },
    [flatItems, flashMessageHighlight]
  );

  useEffect(() => {
    if (!pendingScrollToRef.current) return;
    const id = pendingScrollToRef.current;
    const idx = flatItems.findIndex((i) => i.type === 'message' && i.msg.id === id);
    if (idx >= 0) {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({ index: idx, align: 'center', behavior: 'smooth' });
      });
      pendingScrollToRef.current = null;
      replyScrollLoadAttemptsRef.current = 0;
      window.setTimeout(() => flashMessageHighlight(id), 350);
      return;
    }
    if (messagesLoading) return;
    if (replyScrollLoadAttemptsRef.current >= 25) {
      pendingScrollToRef.current = null;
      replyScrollLoadAttemptsRef.current = 0;
      return;
    }
    if (activeMessagesCursor) {
      replyScrollLoadAttemptsRef.current += 1;
      void loadMoreMessages();
    } else {
      pendingScrollToRef.current = null;
      replyScrollLoadAttemptsRef.current = 0;
    }
  }, [
    activeMessages,
    flatItems,
    activeMessagesCursor,
    messagesLoading,
    loadMoreMessages,
    flashMessageHighlight,
  ]);

  const deepLinkMessageId = searchParams.get('messageId');
  useEffect(() => {
    if (!deepLinkMessageId || !id) return;
    scrollToMessageId(deepLinkMessageId);
    setSearchParams((prev) => { prev.delete('messageId'); return prev; }, { replace: true });
  }, [deepLinkMessageId, id, scrollToMessageId, setSearchParams]);

  if (!conversation) {
    return (
      <div className="conversation-not-found">
        <p>{t('conversations.notFound', 'Conversation not found')}</p>
        <Link to="/">{t('conversations.backHome', 'Back to home')}</Link>
      </div>
    );
  }

  const resolveToolbarName = (pid: string) => {
    const nickname = memberSettings[pid]?.nickname;
    if (nickname) return nickname;
    const profile = participantProfiles[pid];
    return profile?.displayName ?? profile?.username ?? pid;
  };

  const otherParticipants = conversation.participants.filter((p) => p !== identity?.id);
  const displayName = conversation.type === 'group'
    ? (conversation.decryptedName ?? t('conversations.group', 'Group'))
    : otherParticipants.map(resolveToolbarName).join(', ');
  const subtitle = conversation.type === 'group'
    ? `${conversation.participants.length} ${t('conversations.members', 'members')}`
    : t('conversations.directMessage', 'Direct message');

  const isCurrentUserAdmin = !!(identity?.id && conversation.admins?.includes(identity.id));
  const canEditMemberSettings = conversation.type === 'dm' || isCurrentUserAdmin;
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
            <div className="conversation-messages" ref={messagesContainerRef}>
              {id !== activeConversationId ? (
                <div className="dm-messages-loading">
                  <div className="dm-messages-spinner" />
                </div>
              ) : reversedMessages.length === 0 && !messagesLoading ? (
                <div className="conversation-messages-empty">
                  <p>{t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
                </div>
              ) : (
                <Virtuoso
                  key={id}
                  ref={virtuosoRef}
                  className={`dm-messages${messageLayout === 'linear' ? ' dm-messages--linear' : ''}`}
                  data={flatItems}
                  computeItemKey={(_, item) => item.key}
                  firstItemIndex={FIRST_ITEM_INDEX - flatItems.length}
                  initialTopMostItemIndex={
                    cachedScrollIndex != null && flatItems.length > 0
                      ? { index: Math.min(cachedScrollIndex, flatItems.length - 1), align: 'start' }
                      : flatItems.length > 0
                        ? { index: flatItems.length - 1, align: 'end' }
                        : 0
                  }
                  alignToBottom
                  followOutput={followOutput}
                  rangeChanged={handleRangeChanged}
                  startReached={handleStartReached}
                  atBottomStateChange={handleAtBottomStateChange}
                  atBottomThreshold={250}
                  overscan={{ main: 800, reverse: 800 }}
                  defaultItemHeight={72}
                  increaseViewportBy={{ top: 600, bottom: 600 }}
                  components={virtuosoComponents}
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
                        onReact={handleReact}
                        onToggleReaction={handleToggleReaction}
                        onReport={handleReportMessage}
                        groupedReactions={getGroupedReactions(msg.id)}
                        favoriteEmojis={favoriteEmojis}
                        onAddFavorite={addFavorite}
                        onRemoveFavorite={removeFavorite}
                        fsInfo={fsInfo}
                        senderProfile={msg.fromIdentityId !== identity?.id ? participantProfiles[msg.fromIdentityId] : undefined}
                        ownProfile={identity ?? undefined}
                        layout={messageLayout}
                        participantProfiles={participantProfiles}
                        memberSettings={memberSettings}
                        memberColorDisplay={memberColorDisplay}
                        replyQuote={
                          msg.replyToMessageId
                            ? {
                                text: buildReplySnippet(messagesById.get(msg.replyToMessageId), t),
                                quotedAuthor: resolveQuotedAuthorPreview(
                                  messagesById.get(msg.replyToMessageId),
                                  participantProfiles,
                                  memberSettings,
                                  identity
                                ),
                                onQuoteClick: () => scrollToMessageId(msg.replyToMessageId!),
                              }
                            : null
                        }
                        onReply={() => setReplyingTo(msg)}
                        isFlashHighlight={flashingMessageId === msg.id}
                        onLinkClick={handleLinkClick}
                      />
                    );
                  }}
                />
              )}
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
            </div>

            <MessageComposer
              conversationId={id!}
              sending={sending}
              sendTextMessage={sendTextMessage}
              useFs={useFs}
              onToggleFs={handleToggleFs}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              onSendSucceeded={markJustSent}
              participantProfiles={participantProfiles}
              memberSettings={memberSettings}
              onReplyClick={replyingTo ? () => scrollToMessageId(replyingTo.id) : undefined}
              placeholderTarget={displayName}
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

                <div className="conversation-settings-color-display">
                  <span className="app-settings-toggle-title">
                    {t('conversations.colorDisplayMode', 'Member colour display')}
                  </span>
                  <div className="conversation-settings-color-options">
                    {(['name-only', 'name-and-accent', 'name-and-bubble'] as const).map((mode) => (
                      <label key={mode} className="conversation-settings-color-option">
                        <input
                          type="radio"
                          name="memberColorDisplay"
                          checked={memberColorDisplay === mode}
                          onChange={() => setMemberColorDisplay(mode)}
                        />
                        <span>
                          {mode === 'name-only' && t('conversations.colorDisplayNameOnly', 'Name only')}
                          {mode === 'name-and-accent' && t('conversations.colorDisplayNameAccent', 'Name + avatar accent')}
                          {mode === 'name-and-bubble' && t('conversations.colorDisplayNameBubble', 'Name + bubble tint')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
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
                  const customisation = memberSettings[participantId];
                  const displayedName = resolveDisplayName(participantId, participantProfiles, memberSettings, identity?.id, t);
                  const realName = isSelf
                    ? t('conversations.you', 'You')
                    : (profile?.displayName ?? profile?.username ?? participantId);
                  const initial = displayedName.charAt(0).toUpperCase();
                  const isMemberAdmin = conversation.admins?.includes(participantId);
                  const isEditing = editingMemberId === participantId;

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
                          <span className="conversation-member-name" style={customisation?.color ? { color: customisation.color } : undefined}>
                            {displayedName}
                            {isMemberAdmin && (
                              <span className="conversation-member-admin-badge">
                                {t('conversations.admin', 'Admin')}
                              </span>
                            )}
                          </span>
                          {customisation?.nickname && !isSelf && (
                            <span className="conversation-member-username">{realName}</span>
                          )}
                          {!customisation?.nickname && profile?.username && !isSelf && (
                            <span className="conversation-member-username">@{profile.username}</span>
                          )}
                        </div>
                      </Link>
                      <div className="conversation-member-actions">
                        {canEditMemberSettings && (
                          <Tooltip content={t('conversations.editMember', 'Edit member')} position="top">
                            <button
                              type="button"
                              className="conversation-member-action-btn"
                              onClick={() => setEditingMemberId(isEditing ? null : participantId)}
                            >
                              <Icon name="pen" className="conversation-member-action-icon" />
                            </button>
                          </Tooltip>
                        )}
                        {isCurrentUserAdmin && !isSelf && conversation.type === 'group' && (
                          <>
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
                          </>
                        )}
                      </div>
                      {isEditing && (
                        <MemberEditPanel
                          initialNickname={customisation?.nickname ?? ''}
                          initialColor={customisation?.color}
                          onSave={(nick, col) => void saveMemberEdit(participantId, nick, col)}
                          onCancel={closeMemberEdit}
                        />
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

      {/* Report message modal */}
      <ReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        mode="message"
        targetMessageId={reportTargetMessageId}
      />

      {/* External link confirmation modal */}
      {pendingLinkHref && (
        <ExternalLinkModal
          href={pendingLinkHref}
          onClose={() => setPendingLinkHref(null)}
        />
      )}
    </div>
  );
}
