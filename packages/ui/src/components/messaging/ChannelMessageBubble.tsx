import { useState, useMemo, useCallback, memo, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ChannelMessage } from './channelMessage';
import type { GroupedReaction, ReactionCustomEmoji } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { IdentityPublicKeys, PublicCustomEmoji, PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { renderFormattedMessage, injectEntityMarkers, type MentionRenderContext, type PageTagRenderContext } from '../../utils/markdownParser';
import { IdentityHoverCard } from '../IdentityHoverCard';
import { useBlockContext } from '../../hooks/useBlockContext';
import { ConfirmDialog } from '../ConfirmDialog';
import { useToast } from '../Toast';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import {
  type ReplyQuotePayload,
  resolveDisplayName,
  formatMessageTime,
  formatAbsoluteTime,
} from '../../pages/conversations/conversationUtils';
import { MessageActionBar } from './MessageActionBar';
import { MessageContextMenuFrame } from './MessageContextMenu';
import { captureMessageContextStash } from '../../utils/contextMenuMedia';
import { ReactionBar } from '../../pages/conversations/ReactionBar';
import type { MediaMessageLayout } from '../MediaMessage';
import { useMessageEmbeds } from './useMessageEmbeds';
import { useDeviceTrust } from './useDeviceTrust';
import { useExpiryCountdown } from './useExpiryCountdown';
import { MessageBody } from './MessageBody';
import { MessageMetaStrip } from './MessageMetaStrip';
import { MessageContextMenuItems } from './MessageContextMenuItems';
import { ReplyQuoteButton } from './ReplyQuoteButton';
import { areChannelMessageBubblePropsEqual } from './channelMessageBubbleMemo';

export interface ChannelMessageBubbleProps {
  message: ChannelMessage;
  isOwn: boolean;
  onDelete: (messageId: string, forEveryone: boolean) => void;
  onReact: (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  onToggleReaction: (
    messageId: string,
    emoji: string,
    ownReactionId?: string,
    customEmoji?: ReactionCustomEmoji,
  ) => void;
  onReport: (messageId: string) => void;
  groupedReactions: GroupedReaction[];
  favoriteEmojis: string[];
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  fsInfo?: { rotationLabel: string; readableWindow: string; tooltip: string };
  senderProfile?: PublicIdentity;
  ownProfile?: PublicIdentity;
  layout: 'linear' | 'bubble';
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  memberColorDisplay: MemberColorDisplay;
  replyQuote?: ReplyQuotePayload | null;
  onReply?: () => void;
  onStartEdit?: () => void;
  isFlashHighlight?: boolean;
  onLinkClick: (href: string) => void;
  onMentionClick?: (identityId: string) => void;
  selfId?: string;
  gifsEnabled: boolean;
  gifAnimateOnHoverOnly: boolean;
  isPinned?: boolean;
  canManagePin?: boolean;
  onPin?: () => void;
  onUnpin?: () => void;
  onOpenMemberSecurity?: (identityId: string, displayLabel: string) => void;
  onDeviceTrustMismatch?: (identityId: string, deviceId: string) => void;
  peerPublicKeysById?: Record<string, IdentityPublicKeys>;
  verificationRevision?: number;
  customEmojisDisabled?: boolean;
  customEmojis?: PublicCustomEmoji[];
  hideUnmoderatedMedia?: boolean;
  pageTagCtx?: PageTagRenderContext;
}

export const ChannelMessageBubble = memo(function ChannelMessageBubble({
  message, isOwn, onDelete, onReact, onToggleReaction, onReport,
  groupedReactions, favoriteEmojis, onAddFavorite, onRemoveFavorite,
  fsInfo, senderProfile, ownProfile, layout, participantProfiles,
  memberSettings, memberColorDisplay, replyQuote, onReply, onStartEdit,
  isFlashHighlight, onLinkClick, onMentionClick, selfId,
  gifsEnabled, gifAnimateOnHoverOnly,
  isPinned = false, canManagePin = false, onPin, onUnpin,
  onOpenMemberSecurity, onDeviceTrustMismatch,
  peerPublicKeysById = {}, verificationRevision = 0,
  customEmojisDisabled = false, customEmojis,
  hideUnmoderatedMedia = false, pageTagCtx,
}: ChannelMessageBubbleProps) {
  const { t } = useTranslation();
  const { block: blockIdentity } = useBlockContext();
  const toast = useToast();

  const [showActions, setShowActions] = useState(false);
  const [actionBarPopoverOpen, setActionBarPopoverOpen] = useState(false);
  const [showContextReactionPicker, setShowContextReactionPicker] = useState(false);
  const [messageContextStash, setMessageContextStash] = useState(() => captureMessageContextStash(null));
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockLoading, setBlockLoading] = useState(false);

  const countdown = useExpiryCountdown(message.expiresAt);
  const content = message.body;

  const embeds = useMessageEmbeds(content, selfId);
  const { deviceSignatureTrustIcon, signatureWarningIcon, fsDowngradeIcon } = useDeviceTrust({
    messageId: message.id, fromIdentityId: message.fromIdentityId,
    body: content, deleted: message.deleted,
    senderDeviceId: message.senderDeviceId, signatureVerified: message.signatureVerified,
    fsDowngraded: message.fsDowngraded, peerPublicKeysById, verificationRevision,
    onDeviceTrustMismatch,
  });

  const canShowEditControl =
    isOwn && !!onStartEdit && !message.deleted &&
    (message.messageType === 'user' || !message.messageType);
  const canStartEdit = canShowEditControl && (message.revisionCount ?? 0) < 3;
  const editMaxedReason = t('conversations.messageEditMax');
  const actionBarEditAction = !canShowEditControl
    ? undefined
    : canStartEdit
      ? ({ state: 'enabled' as const, onClick: () => onStartEdit!() })
      : ({ state: 'disabled' as const, reason: editMaxedReason });

  const mediaAttachmentLayout: MediaMessageLayout = message.attachments.length > 1 ? 'grid' : 'default';
  const effectiveCustomEmojis = customEmojisDisabled ? undefined : message.customEmojis;

  const mentionRenderCtx: MentionRenderContext | undefined = useMemo(() => ({
    profiles: participantProfiles, memberSettings, selfId, onMentionClick,
  }), [participantProfiles, memberSettings, selfId, onMentionClick]);

  const renderedContent = useMemo(() => {
    if (!content) return null;
    const markedText = injectEntityMarkers(content, message.mentions, message.pageTags);
    return renderFormattedMessage(markedText, onLinkClick, mentionRenderCtx, effectiveCustomEmojis, embeds.hiddenEmbedMap, pageTagCtx);
  }, [content, message.mentions, message.pageTags, effectiveCustomEmojis, onLinkClick, mentionRenderCtx, embeds.hiddenEmbedMap, pageTagCtx]);

  const hasDecryptionError = !!message.decryptionError && !message.deleted;
  const isFsExpired = hasDecryptionError && message.decryptionError?.startsWith('forward-secrecy-expired:');
  const decryptionDisplayText = isFsExpired
    ? t('conversations.fsExpired', 'This message used a one-time key that has since been consumed. It cannot be decrypted again.')
    : (message.decryptionError ?? t('conversations.decryptFailed', 'Unable to decrypt'));
  const decryptionLabel = isFsExpired
    ? t('conversations.fsExpiredLabel', 'Forward secrecy key expired')
    : `Encrypted${message.decryptionError ? `: ${message.decryptionError}` : ''}`;

  const memberSecurityHoverFooter =
    onOpenMemberSecurity != null ? (
      <button type="button" className="device-signatures-link-btn" onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        onOpenMemberSecurity(message.fromIdentityId, resolveDisplayName(message.fromIdentityId, participantProfiles, memberSettings, selfId, t));
      }}>
        <Icon name="shield" />
        {t('conversations.memberSecurity.link', 'Device Signatures')}
      </button>
    ) : undefined;

  const handleBlockConfirm = async () => {
    setBlockLoading(true);
    try {
      const result = await blockIdentity(message.fromIdentityId);
      if (result.success) toast.success(t('blocked.userBlocked'));
      else toast.error(result.error ?? t('blocked.blockUser'));
    } finally { setBlockLoading(false); setBlockConfirmOpen(false); }
  };

  const handleChatContextAction = useCallback(
    (value: string) => {
      if (value === 'reply') onReply?.();
      else if (value === 'report') onReport(message.id);
      else if (value === 'delete-for-me') onDelete(message.id, false);
      else if (value === 'delete-for-everyone') onDelete(message.id, true);
      else if (value === 'edit') { if (canStartEdit) onStartEdit?.(); }
      else if (value === 'pin') onPin?.();
      else if (value === 'unpin') onUnpin?.();
      else if (value === 'react') window.setTimeout(() => setShowContextReactionPicker(true), 0);
    },
    [canStartEdit, isOwn, message.id, onDelete, onPin, onReply, onReport, onStartEdit, onUnpin],
  );

  const contextMenuItems = (
    <MessageContextMenuItems
      isOwn={isOwn} isDeleted={message.deleted}
      canShowEditControl={canShowEditControl} canStartEdit={canStartEdit}
      editMaxedReason={editMaxedReason} canManagePin={canManagePin}
      isPinned={isPinned} hasReply={!!onReply}
    />
  );

  const reactionBar = (
    <ReactionBar messageId={message.id} reactions={groupedReactions} onToggleReaction={onToggleReaction}
      participantProfiles={participantProfiles} memberSettings={memberSettings} currentIdentityId={ownProfile?.id} />
  );

  const onStashMessageContext = useCallback((e: React.MouseEvent) => {
    flushSync(() => setMessageContextStash(captureMessageContextStash(e.target)));
  }, []);

  function contextMenuWithReactionPicker(row: ReactElement) {
    return (
      <MessageContextMenuFrame messageRow={row} onStashContext={onStashMessageContext}
        contextStash={messageContextStash} messagePlainText={content}
        parsedAttachments={message.attachments} gifAttachments={message.gifAttachments}
        showContextReactionPicker={showContextReactionPicker}
        onShowContextReactionPicker={setShowContextReactionPicker}
        onReact={onReact} messageId={message.id}
        onContextAction={handleChatContextAction} chatMenuItems={contextMenuItems}
        customEmojis={customEmojisDisabled ? undefined : customEmojis} />
    );
  }

  const actionBar = (
    <MessageActionBar isOwn={isOwn}
      onDeleteForSelf={() => onDelete(message.id, false)}
      onDeleteForEveryone={() => onDelete(message.id, true)}
      onReact={(emoji, ce) => onReact(message.id, emoji, ce)}
      onReport={!isOwn ? () => onReport(message.id) : undefined}
      onBlock={!isOwn ? () => setBlockConfirmOpen(true) : undefined}
      favoriteEmojis={favoriteEmojis} onAddFavorite={onAddFavorite} onRemoveFavorite={onRemoveFavorite}
      onReply={onReply} editAction={actionBarEditAction}
      onPopoverOpenChange={setActionBarPopoverOpen}
      canManagePin={canManagePin} isPinned={isPinned} onPin={onPin} onUnpin={onUnpin}
      customEmojis={customEmojisDisabled ? undefined : customEmojis} />
  );

  const bodyEl = (
    <MessageBody message={message} renderedContent={renderedContent}
      hasDecryptionError={hasDecryptionError} decryptionLabel={decryptionLabel}
      decryptionDisplayText={decryptionDisplayText} mediaAttachmentLayout={mediaAttachmentLayout}
      gifsEnabled={gifsEnabled} gifAnimateOnHoverOnly={gifAnimateOnHoverOnly}
      hideUnmoderatedMedia={hideUnmoderatedMedia} embeds={embeds} />
  );

  const metaStripProps = { message, deviceSignatureTrustIcon, signatureWarningIcon, fsDowngradeIcon, fsInfo, isPinned, countdown } as const;

  const blockConfirmDialog = !isOwn && (
    <ConfirmDialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}
      title={t('blocked.blockUser')} description={t('blocked.confirmBlock')}
      confirmLabel={t('blocked.blockUser')} variant="danger"
      loading={blockLoading} onConfirm={handleBlockConfirm} />
  );

  const senderColor = memberSettings[message.fromIdentityId]?.color;
  const senderNameStyle: React.CSSProperties | undefined = senderColor ? { color: senderColor } : undefined;
  const bubbleTintStyle: React.CSSProperties | undefined =
    senderColor && !isOwn && memberColorDisplay === 'name-and-bubble'
      ? { background: `color-mix(in srgb, ${senderColor} 8%, var(--color-bg-tertiary))` } : undefined;
  const avatarAccentStyle: React.CSSProperties | undefined =
    senderColor && !isOwn && memberColorDisplay === 'name-and-accent'
      ? { boxShadow: `0 0 0 2px ${senderColor}` } : undefined;
  const linearHoverStyle: React.CSSProperties | undefined =
    senderColor && memberColorDisplay !== 'name-only'
      ? ({ '--member-hover-bg': `color-mix(in srgb, ${senderColor} 6%, var(--color-bg-hover))` } as React.CSSProperties) : undefined;
  const linearMessageTintMarker = senderColor && memberColorDisplay === 'name-and-bubble';

  const mouseHandlers = {
    onMouseEnter: () => setShowActions(true),
    onMouseLeave: () => { if (!actionBarPopoverOpen) setShowActions(false); },
  };

  // ==================== LINEAR LAYOUT ====================
  if (layout === 'linear') {
    const profile = isOwn ? ownProfile : senderProfile;
    const displayName = resolveDisplayName(message.fromIdentityId, participantProfiles, memberSettings);
    const avatarUrl = profile?.avatarUrl;
    const avatarContent = avatarUrl
      ? <img src={avatarUrl} alt="" className="dm-message-avatar-img" />
      : <span className="dm-message-avatar-placeholder">{displayName.charAt(0).toUpperCase()}</span>;

    const messageRow = (
      // biome-ignore lint/a11y/noStaticElementInteractions: hover delegation to show/hide action bar
      <div className={`dm-message dm-message--linear${isPinned ? ' dm-message--pinned' : ''}${isFlashHighlight ? ' dm-message--flash-highlight' : ''}`}
        style={linearHoverStyle} {...mouseHandlers}>
        {linearMessageTintMarker && <div className="dm-message-linear-tint-marker" style={{ background: senderColor }} aria-hidden />}
        {profile ? (
          <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }} extraFooter={memberSecurityHoverFooter}>
            <button type="button" className="dm-message-avatar-btn" style={avatarAccentStyle}>{avatarContent}</button>
          </IdentityHoverCard>
        ) : (
          <div className="dm-message-avatar" style={avatarAccentStyle}>{avatarContent}</div>
        )}
        <div className="dm-message-content">
          <div className="dm-message-header">
            {profile ? (
              <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }} extraFooter={memberSecurityHoverFooter}>
                <button type="button" className="dm-message-sender" style={senderNameStyle}>{displayName}</button>
              </IdentityHoverCard>
            ) : (
              <span className="dm-message-sender" style={senderNameStyle}>{displayName}</span>
            )}
            <Tooltip content={formatAbsoluteTime(message.createdAt)} position="top">
              <span className="dm-message-time">{formatMessageTime(message.createdAt)}</span>
            </Tooltip>
            <MessageMetaStrip {...metaStripProps} variant="header" />
          </div>
          {replyQuote && !message.deleted && <ReplyQuoteButton replyQuote={replyQuote} />}
          {bodyEl}
          {reactionBar}
        </div>
        {showActions && !message.deleted && actionBar}
      </div>
    );

    if (message.deleted) return messageRow;
    return <>{contextMenuWithReactionPicker(messageRow)}{blockConfirmDialog}</>;
  }

  // ==================== BUBBLE LAYOUT ====================
  const applyOwnAlignment = isOwn;

  if (message.deleted) {
    return (
      <div className={`dm-message${applyOwnAlignment ? ' dm-message--own' : ''}`}>
        <div className="dm-message-bubble-wrapper">
          <div className={`dm-message-bubble${applyOwnAlignment ? ' dm-message-bubble--own' : ''}`}>
            <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>Message deleted</p>
          </div>
        </div>
      </div>
    );
  }

  const bubbleRow = (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover delegation to show/hide action bar
    <div className={`dm-message${applyOwnAlignment ? ' dm-message--own' : ''}${isPinned ? ' dm-message--pinned' : ''}${isFlashHighlight ? ' dm-message--flash-highlight' : ''}`}
      {...mouseHandlers}>
      {!isOwn && senderProfile && (
        <IdentityHoverCard identity={senderProfile} positioning={{ placement: 'right', gutter: 8 }} extraFooter={memberSecurityHoverFooter}>
          <button type="button" className="dm-message-sender" style={senderNameStyle}>
            {resolveDisplayName(message.fromIdentityId, participantProfiles, memberSettings)}
          </button>
        </IdentityHoverCard>
      )}
      <div className="dm-message-bubble-wrapper">
        {showActions && actionBar}
        <div className={`dm-message-bubble${applyOwnAlignment ? ' dm-message-bubble--own' : ''}`} style={bubbleTintStyle}>
          {replyQuote && <ReplyQuoteButton replyQuote={replyQuote} />}
          {bodyEl}
        </div>
        {reactionBar}
      </div>
      <div className="dm-message-footer">
        <MessageMetaStrip {...metaStripProps} variant="footer" />
      </div>
    </div>
  );

  return <>{contextMenuWithReactionPicker(bubbleRow)}{blockConfirmDialog}</>;
}, areChannelMessageBubblePropsEqual);
