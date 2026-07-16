/**
 * Conversation-specific message list — thin wrapper around the shared
 * {@link ChannelMessageList}.
 *
 * Handles conversation-only concerns:
 *  - GIF visibility / hover preferences
 *  - Unmoderated media preference
 *  - System message rendering
 *  - Pending media-outbox inline row
 *  - Free-tier upgrade banner
 *  - Reply-quote building (resolving parent messages)
 *  - Page-tag navigation context
 */

import { useMemo, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { GroupedReaction, ReactionCustomEmoji } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { IdentityPublicKeys, PublicCustomEmoji, PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { UpgradePrompt } from '../../components/UpgradePrompt';
import {
  useGifPreference,
  useConversationGifHidden,
  useEffectiveGifAnimateOnHoverOnly,
} from '../../hooks/useGifPreference';
import { useUnmoderatedMediaPreference } from '../../hooks/useUnmoderatedMediaPreference';
import {
  type ChatItem,
  type ReplyQuotePayload,
  buildReplySnippet,
  resolveQuotedAuthorPreview,
} from './conversationUtils';
import { SystemMessageRow } from './SystemMessageRow';
import { displayMessageToChannel } from '../../components/messaging/channelMessage';
import { ChannelMessageList } from '../../components/messaging/ChannelMessageList';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';
import { useTaggablePages } from '../../navigation/taggablePages';
import { useNavigate } from 'react-router-dom';
import type { PageTagRenderContext } from '../../utils/markdownParser';

const FREE_TIER_HISTORY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CUTOFF_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function ConversationMessageList({
  conversationId,
  activeConversationId,
  flatItems,
  messagesLoading,
  reversedMessagesLength,
  messagesById,
  identity,
  participantProfiles,
  memberSettings,
  messageLayout,
  memberColorDisplay,
  favoriteEmojis,
  fsInfo,
  flashingMessageId,
  getGroupedReactions,
  onDeleteMessage,
  onReact,
  onToggleReaction,
  onReportMessage,
  onAddFavorite,
  onRemoveFavorite,
  onReply,
  onStartEdit,
  onLinkClick,
  onMentionClick,
  scrollToMessageId,
  showScrollButton,
  unreadCount = 0,
  onJumpToLatest,
  scrollViewportRef,
  messagesContentRef,
  messagesContainerRef,
  onScrollViewportScroll,
  onUserScrollIntent,
  cachedScrollIndex,
  hasMoreOlder,
  onReachOlder,
  hasNewerPages,
  onReachNewer,
  showManualLoadOlder,
  showManualLoadNewer,
  onManualLoadOlder,
  onManualLoadNewer,
  t,
  gifsDisabledByAdmin,
  customEmojisDisabledByAdmin,
  pinnedMessageIds,
  canManagePins,
  onPinMessage,
  onUnpinMessage,
  onOpenMemberSecurity,
  onDeviceTrustMismatch,
  peerPublicKeysById,
  verificationRevision,
  customEmojis,
  isFreeTier,
}: {
  conversationId: string | undefined;
  activeConversationId: string | null;
  flatItems: ChatItem[];
  messagesLoading: boolean;
  reversedMessagesLength: number;
  messagesById: Map<string, DisplayMessage>;
  identity: { id: string; avatarUrl?: string; displayName?: string; username?: string } | null | undefined;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  messageLayout: 'linear' | 'bubble';
  memberColorDisplay: MemberColorDisplay;
  favoriteEmojis: string[];
  fsInfo: { rotationLabel: string; readableWindow: string; tooltip: string };
  flashingMessageId: string | null;
  getGroupedReactions: (messageId: string) => GroupedReaction[];
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onReact: (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => void;
  onToggleReaction: (
    messageId: string,
    emoji: string,
    ownReactionId?: string,
    customEmoji?: ReactionCustomEmoji,
  ) => void;
  onReportMessage: (messageId: string) => void;
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onReply: (msg: DisplayMessage) => void;
  onStartEdit: (msg: DisplayMessage) => void;
  onLinkClick: (href: string) => void;
  onMentionClick: (identityId: string) => void;
  scrollToMessageId: (id: string) => void;
  showScrollButton: boolean;
  unreadCount?: number;
  onJumpToLatest: () => void | Promise<void>;
  scrollViewportRef: React.RefObject<HTMLDivElement | null>;
  messagesContentRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onScrollViewportScroll: () => void;
  onUserScrollIntent: () => void;
  cachedScrollIndex: number | null;
  hasMoreOlder: boolean;
  onReachOlder: () => void;
  hasNewerPages: boolean;
  onReachNewer: () => void;
  showManualLoadOlder: boolean;
  showManualLoadNewer: boolean;
  onManualLoadOlder: () => void;
  onManualLoadNewer: () => void;
  t: (key: string, fallback: string) => string;
  gifsDisabledByAdmin?: boolean;
  customEmojisDisabledByAdmin?: boolean;
  pinnedMessageIds: string[];
  canManagePins: boolean;
  onPinMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => void;
  onOpenMemberSecurity?: (identityId: string, displayLabel: string) => void;
  onDeviceTrustMismatch?: (identityId: string, deviceId: string) => void;
  peerPublicKeysById: Record<string, IdentityPublicKeys>;
  verificationRevision: number;
  customEmojis?: PublicCustomEmoji[];
  isFreeTier?: boolean;
}) {
  const { t: tLocal } = useTranslation();
  const navigate = useNavigate();
  const { canAccess } = useTaggablePages();
  const pageTagCtx: PageTagRenderContext = useMemo(() => ({
    canAccess,
    navigate: (path: string) => navigate(path),
  }), [canAccess, navigate]);

  const [gifVisibility] = useGifPreference(identity?.id ?? '');
  const [convGifHidden] = useConversationGifHidden(conversationId ?? '');
  const gifsEnabled = gifVisibility !== 'disabled' && !convGifHidden && !gifsDisabledByAdmin;
  const gifAnimateOnHoverOnly = useEffectiveGifAnimateOnHoverOnly(identity?.id ?? '', conversationId ?? '');
  const [unmoderatedMediaPref] = useUnmoderatedMediaPreference(identity?.id ?? '');
  const hideUnmoderatedMedia = unmoderatedMediaPref === 'hide';

  // Map ChatItem[] → ChannelListItem<ChannelMessage>[] (filtering out pending-outbox)
  const { channelItems, pendingOutbox } = useMemo(() => {
    const items: ChannelListItem<ChannelMessage>[] = [];
    let outbox: { key: string; pendingCount: number } | null = null;
    for (const item of flatItems) {
      if (item.type === 'day-separator') {
        items.push(item);
      } else if (item.type === 'pending-outbox') {
        outbox = { key: item.key, pendingCount: item.pendingCount };
      } else {
        items.push({
          type: 'message',
          msg: displayMessageToChannel(item.msg),
          key: item.key,
          isFirstUnread: item.isFirstUnread,
        });
      }
    }
    return { channelItems: items, pendingOutbox: outbox };
  }, [flatItems]);

  const isOldestMessageNearTierCutoff = useMemo(() => {
    if (!isFreeTier) return false;
    const oldestMsg = channelItems.find((item) => item.type === 'message');
    if (!oldestMsg || oldestMsg.type !== 'message') return false;
    const oldestTs = new Date(oldestMsg.msg.createdAt).getTime();
    const cutoffTs = Date.now() - FREE_TIER_HISTORY_WINDOW_MS;
    return Math.abs(oldestTs - cutoffTs) <= CUTOFF_TOLERANCE_MS;
  }, [isFreeTier, channelItems]);

  const systemMessageRenderer = useCallback(
    (msg: ChannelMessage) => {
      if (msg.systemEvent) {
        return <SystemMessageRow event={msg.systemEvent} />;
      }
      return null;
    },
    [],
  );

  const replyQuoteBuilder = useCallback(
    (msg: ChannelMessage): ReplyQuotePayload | null => {
      if (!msg.replyToMessageId) return null;
      const parent = messagesById.get(msg.replyToMessageId);
      return {
        text: buildReplySnippet(parent, tLocal as any),
        quotedAuthor: resolveQuotedAuthorPreview(
          parent,
          participantProfiles,
          memberSettings,
          identity as any,
        ),
        onQuoteClick: () => scrollToMessageId(msg.replyToMessageId!),
      };
    },
    [messagesById, tLocal, participantProfiles, memberSettings, identity, scrollToMessageId],
  );

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      const source = msg._sourceConversation;
      if (source) onReply(source);
    },
    [onReply],
  );

  const handleStartEdit = useCallback(
    (msg: ChannelMessage) => {
      const source = msg._sourceConversation;
      if (source) onStartEdit(source);
    },
    [onStartEdit],
  );

  const freeTierBanner = isFreeTier && !hasMoreOlder && !messagesLoading && reversedMessagesLength > 0 && isOldestMessageNearTierCutoff ? (
    <UpgradePrompt
      variant="banner"
      message={tLocal('conversations.upgradeForOlderMessages', { defaultValue: 'Upgrade to view older messages' })}
      description={tLocal('conversations.upgradeForOlderMessagesDescription', { defaultValue: 'Free accounts can access the most recent 14 days of message history.' })}
      ctaLabel={tLocal('conversations.upgradeCta', { defaultValue: 'View Plans' })}
      onUpgrade={() => navigate('/account/subscription')}
    />
  ) : undefined;

  const pendingOutboxNode: ReactNode = pendingOutbox ? (
    <div className="dm-pending-outbox-row" role="status" aria-live="polite">
      <span className="dm-pending-outbox-row__spinner spinner spinner-sm" aria-hidden />
      <span className="dm-pending-outbox-row__text">
        {pendingOutbox.pendingCount === 1
          ? tLocal('conversations.mediaOutbox.inlinePendingOne', 'Sending media…')
          : tLocal('conversations.mediaOutbox.inlinePendingMany', 'Sending {{count}} media…', {
              count: pendingOutbox.pendingCount,
            })}
      </span>
    </div>
  ) : null;

  return (
    <ChannelMessageList
      entityId={conversationId}
      activeEntityId={activeConversationId}
      flatItems={channelItems}
      messagesLoading={messagesLoading}
      messageCount={reversedMessagesLength}
      identity={identity}
      participantProfiles={participantProfiles}
      memberSettings={memberSettings}
      messageLayout={messageLayout}
      memberColorDisplay={memberColorDisplay}
      favoriteEmojis={favoriteEmojis}
      getGroupedReactions={getGroupedReactions}
      onDeleteMessage={onDeleteMessage}
      onReact={onReact}
      onToggleReaction={onToggleReaction}
      onReportMessage={onReportMessage}
      onAddFavorite={onAddFavorite}
      onRemoveFavorite={onRemoveFavorite}
      onLinkClick={onLinkClick}
      onMentionClick={onMentionClick}
      showScrollButton={showScrollButton}
      unreadCount={unreadCount}
      onJumpToLatest={onJumpToLatest}
      scrollViewportRef={scrollViewportRef}
      messagesContentRef={messagesContentRef}
      messagesContainerRef={messagesContainerRef}
      onScrollViewportScroll={onScrollViewportScroll}
      onUserScrollIntent={onUserScrollIntent}
      cachedScrollIndex={cachedScrollIndex}
      hasMoreOlder={hasMoreOlder}
      onReachOlder={onReachOlder}
      hasNewerPages={hasNewerPages}
      onReachNewer={onReachNewer}
      showManualLoadOlder={showManualLoadOlder}
      showManualLoadNewer={showManualLoadNewer}
      onManualLoadOlder={onManualLoadOlder}
      onManualLoadNewer={onManualLoadNewer}
      flashingMessageId={flashingMessageId}
      fsInfo={fsInfo}
      gifsEnabled={gifsEnabled}
      gifAnimateOnHoverOnly={gifAnimateOnHoverOnly}
      customEmojisDisabled={customEmojisDisabledByAdmin === true}
      customEmojis={customEmojis}
      hideUnmoderatedMedia={hideUnmoderatedMedia}
      pageTagCtx={pageTagCtx}
      pinnedMessageIds={pinnedMessageIds}
      canManagePins={canManagePins}
      onPinMessage={onPinMessage}
      onUnpinMessage={onUnpinMessage}
      onOpenMemberSecurity={onOpenMemberSecurity}
      onDeviceTrustMismatch={onDeviceTrustMismatch}
      peerPublicKeysById={peerPublicKeysById}
      verificationRevision={verificationRevision}
      onReply={handleReply}
      onStartEdit={handleStartEdit}
      scrollToMessageId={scrollToMessageId}
      replyQuoteBuilder={replyQuoteBuilder}
      systemMessageRenderer={systemMessageRenderer}
      freeTierBanner={freeTierBanner}
      trailingContent={pendingOutboxNode}
    />
  );
}
