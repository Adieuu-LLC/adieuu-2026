/**
 * Shared message list renderer for any channel type.
 *
 * Accepts {@link ChannelMessage}[] and renders them via
 * {@link ChannelMessageBubble}, with scroll sentinels for infinite paging,
 * day separators, unread dividers, and a jump-to-latest button.
 *
 * Conversation-specific features (system message rows, pending-outbox rows,
 * free-tier banner) are gated behind opt-in props.
 */

import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelMessage } from './channelMessage';
import type { GroupedReaction, ReactionCustomEmoji } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { IdentityPublicKeys, PublicCustomEmoji, PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { ReplyQuotePayload } from '../../pages/conversations/conversationUtils';
import type { PageTagRenderContext } from '../../utils/markdownParser';
import {
  type ChannelListItem,
  formatDayLabel,
} from '../../utils/buildFlatMessageItems';
import { scrollViewportCanScroll } from '../../utils/messageScrollUtils';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';
import type { EditHistoryEntry } from './EditHistoryLabel';
import { ChannelMessageBubble } from './ChannelMessageBubble';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChannelMessageListProps {
  entityId: string | undefined;
  activeEntityId: string | null;
  flatItems: ChannelListItem<ChannelMessage>[];
  messagesLoading: boolean;
  messageCount: number;
  identity: {
    id: string;
    avatarUrl?: string;
    displayName?: string;
    username?: string;
  } | null | undefined;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  messageLayout: 'linear' | 'bubble';
  memberColorDisplay: MemberColorDisplay;
  favoriteEmojis: string[];
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
  onLinkClick: (href: string) => void;
  onMentionClick?: (identityId: string) => void;

  // -- Scroll plumbing -------------------------------------------------------
  showScrollButton: boolean;
  unreadCount?: number;
  onJumpToLatest: () => void | Promise<void>;
  scrollViewportRef: React.RefObject<HTMLDivElement | null>;
  messagesContentRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  onScrollViewportScroll: () => void;
  onUserScrollIntent: () => void;
  cachedScrollIndex: number | null;

  // -- Paging ----------------------------------------------------------------
  hasMoreOlder: boolean;
  onReachOlder: () => void;
  hasNewerPages: boolean;
  onReachNewer: () => void;
  showManualLoadOlder?: boolean;
  showManualLoadNewer?: boolean;
  onManualLoadOlder?: () => void;
  onManualLoadNewer?: () => void;

  // -- Optional: per-message enrichment from caller --------------------------
  renderMessageExtras?: (msg: ChannelMessage) => ReactNode;
  flashingMessageId?: string | null;

  // -- Feature flags (conversation-only; default off) ------------------------
  fsInfo?: { rotationLabel: string; readableWindow: string; tooltip: string };
  gifsEnabled?: boolean;
  gifAnimateOnHoverOnly?: boolean;
  customEmojisDisabled?: boolean;
  customEmojis?: PublicCustomEmoji[];
  hideUnmoderatedMedia?: boolean;
  pageTagCtx?: PageTagRenderContext;
  pinnedMessageIds?: string[];
  canManagePins?: boolean;
  onPinMessage?: (messageId: string) => void;
  onUnpinMessage?: (messageId: string) => void;
  onOpenMemberSecurity?: (identityId: string, displayLabel: string) => void;
  onDeviceTrustMismatch?: (identityId: string, deviceId: string) => void;
  peerPublicKeysById?: Record<string, IdentityPublicKeys>;
  verificationRevision?: number;

  // -- Optional per-message callbacks ----------------------------------------
  onReply?: (msg: ChannelMessage) => void;
  onStartEdit?: (msg: ChannelMessage) => void;
  scrollToMessageId?: (id: string) => void;
  replyQuoteBuilder?: (msg: ChannelMessage) => ReplyQuotePayload | null;

  // -- Conversation-only slots -----------------------------------------------
  systemMessageRenderer?: (msg: ChannelMessage) => ReactNode;
  freeTierBanner?: ReactNode;
  pendingOutboxRenderer?: (item: { pendingCount: number }) => ReactNode;

  /** Loader for edit history entries. When provided, the "Edited" label becomes interactive. */
  loadEditHistory?: (messageId: string) => Promise<EditHistoryEntry[] | null>;

  emptyMessage?: string;
  loadingLabel?: string;
  /** Rendered at the end of the messages content div (e.g. pending-outbox row). */
  trailingContent?: ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChannelMessageList({
  entityId,
  activeEntityId,
  flatItems,
  messagesLoading,
  messageCount,
  identity,
  participantProfiles,
  memberSettings,
  messageLayout,
  memberColorDisplay,
  favoriteEmojis,
  getGroupedReactions,
  onDeleteMessage,
  onReact,
  onToggleReaction,
  onReportMessage,
  onAddFavorite,
  onRemoveFavorite,
  onLinkClick,
  onMentionClick,
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
  renderMessageExtras,
  flashingMessageId,
  fsInfo,
  gifsEnabled = true,
  gifAnimateOnHoverOnly = false,
  customEmojisDisabled = false,
  customEmojis,
  hideUnmoderatedMedia = false,
  pageTagCtx,
  pinnedMessageIds,
  canManagePins = false,
  onPinMessage,
  onUnpinMessage,
  onOpenMemberSecurity,
  onDeviceTrustMismatch,
  peerPublicKeysById,
  verificationRevision,
  onReply,
  onStartEdit,
  scrollToMessageId,
  replyQuoteBuilder,
  systemMessageRenderer,
  freeTierBanner,
  loadEditHistory,
  emptyMessage,
  loadingLabel,
  trailingContent,
}: ChannelMessageListProps) {
  const { t } = useTranslation();

  const pinnedSet = useMemo(
    () => new Set(pinnedMessageIds ?? []),
    [pinnedMessageIds],
  );

  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const restoredForEntityRef = useRef<string | null>(null);
  const olderPagingRearmRef = useRef(true);
  const newerPagingRearmRef = useRef(true);

  useEffect(() => {
    restoredForEntityRef.current = null;
  }, [entityId]);

  useEffect(() => {
    olderPagingRearmRef.current = true;
    newerPagingRearmRef.current = true;
  }, [entityId]);

  useEffect(() => {
    if (cachedScrollIndex == null || flatItems.length === 0 || !entityId) return;
    if (restoredForEntityRef.current === entityId) return;
    const el = messagesContentRef.current?.querySelector(
      `[data-dm-item-index="${String(cachedScrollIndex)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      restoredForEntityRef.current = entityId;
    }
  }, [entityId, cachedScrollIndex, flatItems.length, messagesContentRef]);

  // Top sentinel – older page loading
  useEffect(() => {
    const root = scrollViewportRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (!e.isIntersecting) {
          olderPagingRearmRef.current = true;
          return;
        }
        if (!hasMoreOlder || messagesLoading) return;
        if (!scrollViewportCanScroll(root)) return;
        if (!olderPagingRearmRef.current) return;
        olderPagingRearmRef.current = false;
        onReachOlder();
      },
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [scrollViewportRef, hasMoreOlder, messagesLoading, onReachOlder, entityId, flatItems.length]);

  // Bottom sentinel – newer page loading
  useEffect(() => {
    const root = scrollViewportRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[0];
        if (!e) return;
        if (!e.isIntersecting) {
          newerPagingRearmRef.current = true;
          return;
        }
        if (!hasNewerPages || messagesLoading) return;
        if (!scrollViewportCanScroll(root)) return;
        if (!newerPagingRearmRef.current) return;
        newerPagingRearmRef.current = false;
        onReachNewer();
      },
      { root, rootMargin: '0px 0px 120px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [scrollViewportRef, hasNewerPages, messagesLoading, onReachNewer, entityId, flatItems.length]);

  const renderItem = useCallback(
    (item: ChannelListItem<ChannelMessage>) => {
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
      const unreadMarker = item.isFirstUnread ? (
        <div className="dm-unread-separator">
          <div className="dm-unread-separator-line" />
          <span className="dm-unread-separator-text">
            {t('conversations.newUnreads', 'New messages')}
          </span>
          <div className="dm-unread-separator-line" />
        </div>
      ) : null;

      if (systemMessageRenderer && msg.messageType === 'system' && msg.systemEvent) {
        return (
          <>
            {unreadMarker}
            {systemMessageRenderer(msg)}
          </>
        );
      }

      const replyQuote = replyQuoteBuilder ? replyQuoteBuilder(msg) : null;

      return (
        <>
          {unreadMarker}
          <ChannelMessageBubble
            message={msg}
            isOwn={msg.fromIdentityId === identity?.id}
            onDelete={onDeleteMessage}
            onReact={onReact}
            onToggleReaction={onToggleReaction}
            onReport={onReportMessage}
            groupedReactions={getGroupedReactions(msg.id)}
            favoriteEmojis={favoriteEmojis}
            onAddFavorite={onAddFavorite}
            onRemoveFavorite={onRemoveFavorite}
            fsInfo={fsInfo}
            senderProfile={
              msg.fromIdentityId !== identity?.id
                ? participantProfiles[msg.fromIdentityId]
                : undefined
            }
            ownProfile={identity as PublicIdentity | undefined}
            layout={messageLayout}
            participantProfiles={participantProfiles}
            memberSettings={memberSettings}
            memberColorDisplay={memberColorDisplay}
            replyQuote={replyQuote}
            onReply={onReply ? () => onReply(msg) : undefined}
            onStartEdit={onStartEdit ? () => onStartEdit(msg) : undefined}
            isFlashHighlight={flashingMessageId === msg.id}
            onLinkClick={onLinkClick}
            onMentionClick={onMentionClick}
            selfId={identity?.id}
            gifsEnabled={gifsEnabled}
            gifAnimateOnHoverOnly={gifAnimateOnHoverOnly}
            customEmojisDisabled={customEmojisDisabled}
            customEmojis={customEmojis}
            isPinned={pinnedSet.has(msg.id)}
            canManagePin={canManagePins}
            onPin={onPinMessage ? () => onPinMessage(msg.id) : undefined}
            onUnpin={onUnpinMessage ? () => onUnpinMessage(msg.id) : undefined}
            onOpenMemberSecurity={onOpenMemberSecurity}
            onDeviceTrustMismatch={onDeviceTrustMismatch}
            peerPublicKeysById={peerPublicKeysById}
            verificationRevision={verificationRevision}
            hideUnmoderatedMedia={hideUnmoderatedMedia}
            pageTagCtx={pageTagCtx}
            loadEditHistory={loadEditHistory}
          />
          {renderMessageExtras ? renderMessageExtras(msg) : null}
        </>
      );
    },
    [
      t,
      identity,
      participantProfiles,
      memberSettings,
      messageLayout,
      memberColorDisplay,
      getGroupedReactions,
      onDeleteMessage,
      onReact,
      onToggleReaction,
      onReportMessage,
      favoriteEmojis,
      onAddFavorite,
      onRemoveFavorite,
      onLinkClick,
      onMentionClick,
      fsInfo,
      flashingMessageId,
      gifsEnabled,
      gifAnimateOnHoverOnly,
      customEmojisDisabled,
      customEmojis,
      pinnedSet,
      canManagePins,
      onPinMessage,
      onUnpinMessage,
      onOpenMemberSecurity,
      onDeviceTrustMismatch,
      peerPublicKeysById,
      verificationRevision,
      hideUnmoderatedMedia,
      pageTagCtx,
      onReply,
      onStartEdit,
      scrollToMessageId,
      replyQuoteBuilder,
      systemMessageRenderer,
      renderMessageExtras,
      loadEditHistory,
    ],
  );

  const jumpShowsUnreads = showScrollButton && unreadCount > 0;
  const jumpAriaLabel = jumpShowsUnreads
    ? t('conversations.jumpToLatestWithUnread', {
        count: unreadCount,
        defaultValue: `Jump to latest message, ${unreadCount} unread`,
      })
    : t('conversations.jumpToLatest', 'Jump to latest message');
  const jumpTooltip = jumpShowsUnreads
    ? jumpAriaLabel
    : t('conversations.jumpToLatest', 'Jump to latest message');

  return (
    <div
      className="conversation-messages"
      ref={messagesContainerRef as React.RefObject<HTMLDivElement>}
    >
      {entityId !== activeEntityId ||
      (messagesLoading && messageCount === 0) ? (
        <div className="dm-messages-loading" role="status">
          <div className="dm-messages-spinner" />
          <span className="sr-only">{loadingLabel ?? t('conversations.loading', 'Loading messages…')}</span>
        </div>
      ) : messageCount === 0 && !messagesLoading ? (
        <div className="conversation-messages-empty">
          <p>{emptyMessage ?? t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
        </div>
      ) : (
        <div
          ref={scrollViewportRef as React.RefObject<HTMLDivElement>}
          className={`dm-messages${messageLayout === 'linear' ? ' dm-messages--linear' : ''}`}
          onScroll={onScrollViewportScroll}
          onWheel={onUserScrollIntent}
          onTouchMove={onUserScrollIntent}
        >
          {(showManualLoadOlder || showManualLoadNewer) ? (
            <section
              className="dm-messages-manual-paging"
              aria-label={t(
                'conversations.manualPagingRegion',
                'Load message history',
              )}
            >
              {showManualLoadOlder && onManualLoadOlder ? (
                <button
                  type="button"
                  className="dm-messages-manual-paging__btn"
                  onClick={onManualLoadOlder}
                  disabled={messagesLoading || !hasMoreOlder}
                >
                  {t('conversations.viewOlderMessages', 'View older messages')}
                </button>
              ) : null}
              {showManualLoadNewer && onManualLoadNewer ? (
                <button
                  type="button"
                  className="dm-messages-manual-paging__btn"
                  onClick={onManualLoadNewer}
                  disabled={messagesLoading || !hasNewerPages}
                >
                  {t('conversations.viewNewerMessages', 'View newer messages')}
                </button>
              ) : null}
            </section>
          ) : null}
          {messagesLoading && messageCount > 0 ? (
            <div className="dm-messages-history-loading" role="status" aria-busy="true">
              <span className="spinner spinner-sm" />
              <span className="sr-only">{loadingLabel ?? t('conversations.loading', 'Loading messages…')}</span>
            </div>
          ) : null}
          <div
            ref={topSentinelRef}
            className="dm-messages-top-sentinel"
            aria-hidden
          />
          {freeTierBanner}
          <div
            ref={messagesContentRef as React.RefObject<HTMLDivElement>}
            className="dm-messages-content"
          >
            {flatItems.map((item, idx) => (
              <div
                key={item.key}
                className="dm-messages-item"
                data-dm-item-index={idx}
                data-scroll-anchor-key={item.key}
                {...(item.type === 'message'
                  ? ({ 'data-message-id': item.msg.id } as const)
                  : {})}
              >
                {renderItem(item)}
              </div>
            ))}
            {trailingContent}
          </div>
          <div
            ref={bottomSentinelRef}
            className="dm-messages-bottom-sentinel"
            style={{ minHeight: 1 }}
            aria-hidden
          />
        </div>
      )}
      <Tooltip content={jumpTooltip} position="top">
        <button
          type="button"
          className={`conversation-scroll-to-bottom${showScrollButton ? ' conversation-scroll-to-bottom--visible' : ''}${jumpShowsUnreads ? ' conversation-scroll-to-bottom--unread' : ''}`}
          onClick={() => void onJumpToLatest()}
          aria-label={jumpAriaLabel}
        >
          {jumpShowsUnreads ? (
            <>
              <span
                className="conversation-scroll-to-bottom__badge"
                aria-hidden
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
              <span className="conversation-scroll-to-bottom__label">
                {t('conversations.jumpToLatestLabel', {
                  defaultValue: 'Latest',
                })}
              </span>
              <Icon name="chevronDown" />
            </>
          ) : (
            <Icon name="chevronDown" />
          )}
        </button>
      </Tooltip>
    </div>
  );
}
