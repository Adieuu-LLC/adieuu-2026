import { useState, useEffect, useMemo, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal, Popover } from '@ark-ui/react';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { GroupedReaction } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { parsePayload } from '../../services/messagePayload';
import { renderFormattedMessage, injectMentionMarkers, type MentionRenderContext } from '../../utils/markdownParser';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { useBlockContext } from '../../hooks/useBlockContext';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useToast } from '../../components/Toast';
import { EmojiPicker } from '../../components/EmojiPicker';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import {
  type ReplyQuotePayload,
  resolveDisplayName,
  formatMessageTime,
  formatAbsoluteTime,
} from './conversationUtils';
import { MessageActionBar } from './MessageActionBar';
import { ReactionBar } from './ReactionBar';
import { MessageMediaAttachment } from './MessageMediaAttachment';
import { MessageGifAttachment } from './MessageGifAttachment';

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

export const MessageBubble = memo(function MessageBubble({
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
  onMentionClick,
  selfId,
  gifsEnabled,
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
  onMentionClick?: (identityId: string) => void;
  selfId?: string;
  gifsEnabled: boolean;
}) {
  const { t } = useTranslation();
  const { block: blockIdentity } = useBlockContext();
  const toast = useToast();
  const [showActions, setShowActions] = useState(false);
  const [actionBarPopoverOpen, setActionBarPopoverOpen] = useState(false);
  const [showContextReactionPicker, setShowContextReactionPicker] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);
  const countdown = useExpiryCountdown(message.expiresAt);

  const handleBlockConfirm = async () => {
    setBlockLoading(true);
    try {
      const result = await blockIdentity(message.fromIdentityId);
      if (result.success) {
        toast.success(t('blocked.userBlocked'));
      } else {
        toast.error(result.error ?? t('blocked.blockUser'));
      }
    } finally {
      setBlockLoading(false);
      setBlockConfirmOpen(false);
    }
  };

  const rawContent = message.decryptedContent ?? '';
  const parsed = useMemo(() => parsePayload(rawContent), [rawContent]);
  const content = parsed.text;
  const mentionRenderCtx: MentionRenderContext | undefined = useMemo(() => ({
    profiles: participantProfiles,
    memberSettings,
    selfId,
    onMentionClick,
  }), [participantProfiles, memberSettings, selfId, onMentionClick]);
  const renderedContent = useMemo(() => {
    if (!content) return null;
    const markedText = parsed.mentions.length > 0
      ? injectMentionMarkers(content, parsed.mentions)
      : content;
    return renderFormattedMessage(markedText, onLinkClick, mentionRenderCtx);
  }, [content, parsed.mentions, onLinkClick, mentionRenderCtx]);
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
        {parsed.gifAttachments.map((gif, i) => (
          <MessageGifAttachment key={`gif-${i}`} gif={gif} gifsEnabled={gifsEnabled} />
        ))}
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
          <IdentityHoverCard
            identity={profile}
            positioning={{ placement: 'right', gutter: 8 }}
          >
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
              <IdentityHoverCard
                identity={profile}
                positioning={{ placement: 'right', gutter: 8 }}
              >
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
            onBlock={!isOwn ? () => setBlockConfirmOpen(true) : undefined}
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
        {!isOwn && (
          <ConfirmDialog
            open={blockConfirmOpen}
            onOpenChange={setBlockConfirmOpen}
            title={t('blocked.blockUser')}
            description={t('blocked.confirmBlock')}
            confirmLabel={t('blocked.blockUser')}
            variant="danger"
            loading={blockLoading}
            onConfirm={handleBlockConfirm}
          />
        )}
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
            onBlock={!isOwn ? () => setBlockConfirmOpen(true) : undefined}
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
              {parsed.gifAttachments.map((gif, i) => (
                <MessageGifAttachment key={`gif-${i}`} gif={gif} gifsEnabled={gifsEnabled} />
              ))}
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
      {!isOwn && (
        <ConfirmDialog
          open={blockConfirmOpen}
          onOpenChange={setBlockConfirmOpen}
          title={t('blocked.blockUser')}
          description={t('blocked.confirmBlock')}
          confirmLabel={t('blocked.blockUser')}
          variant="danger"
          loading={blockLoading}
          onConfirm={handleBlockConfirm}
        />
      )}
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
