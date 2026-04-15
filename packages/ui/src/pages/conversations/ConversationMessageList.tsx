import { useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { GroupedReaction } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import {
  useGifPreference,
  useConversationGifHidden,
  useEffectiveGifAnimateOnHoverOnly,
} from '../../hooks/useGifPreference';
import {
  type ChatItem,
  type ReplyQuotePayload,
  formatDayLabel,
  buildReplySnippet,
  resolveQuotedAuthorPreview,
} from './conversationUtils';
import { SystemMessageRow } from './SystemMessageRow';
import { MessageBubble } from './MessageBubble';

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
  t,
  gifsDisabledByAdmin,
  pinnedMessageIds,
  canManagePins,
  onPinMessage,
  onUnpinMessage,
  onOpenMemberSecurity,
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
  onReact: (messageId: string, emoji: string) => void;
  onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  onReportMessage: (messageId: string) => void;
  onAddFavorite: (emoji: string) => void;
  onRemoveFavorite: (emoji: string) => void;
  onReply: (msg: DisplayMessage) => void;
  onLinkClick: (href: string) => void;
  onMentionClick: (identityId: string) => void;
  scrollToMessageId: (id: string) => void;
  showScrollButton: boolean;
  /** When > 0 and the jump control is shown, the button highlights unreads (count badge, accent fill, “Latest” label). */
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
  t: (key: string, fallback: string) => string;
  gifsDisabledByAdmin?: boolean;
  pinnedMessageIds: string[];
  canManagePins: boolean;
  onPinMessage: (messageId: string) => void;
  onUnpinMessage: (messageId: string) => void;
  onOpenMemberSecurity?: (identityId: string, displayLabel: string) => void;
}) {
  const { t: tLocal } = useTranslation();

  const [gifVisibility] = useGifPreference(identity?.id ?? '');
  const [convGifHidden] = useConversationGifHidden(conversationId ?? '');
  const gifsEnabled = gifVisibility !== 'disabled' && !convGifHidden && !gifsDisabledByAdmin;
  const gifAnimateOnHoverOnly = useEffectiveGifAnimateOnHoverOnly(identity?.id ?? '', conversationId ?? '');

  const pinnedSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);

  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
  const restoredForConvRef = useRef<string | null>(null);

  useEffect(() => {
    restoredForConvRef.current = null;
  }, [conversationId]);

  useLayoutEffect(() => {
    if (cachedScrollIndex == null || flatItems.length === 0 || !conversationId) return;
    if (restoredForConvRef.current === conversationId) return;
    const el = messagesContentRef.current?.querySelector(
      `[data-dm-item-index="${String(cachedScrollIndex)}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      restoredForConvRef.current = conversationId;
    }
  }, [conversationId, cachedScrollIndex, flatItems.length, messagesContentRef]);

  useEffect(() => {
    const root = scrollViewportRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasMoreOlder || messagesLoading) return;
        onReachOlder();
      },
      { root, rootMargin: '120px 0px 0px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [scrollViewportRef, hasMoreOlder, messagesLoading, onReachOlder, conversationId, flatItems.length]);

  useEffect(() => {
    const root = scrollViewportRef.current;
    const sentinel = bottomSentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!hasNewerPages || messagesLoading) return;
        onReachNewer();
      },
      { root, rootMargin: '0px 0px 120px 0px', threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [scrollViewportRef, hasNewerPages, messagesLoading, onReachNewer, conversationId, flatItems.length]);

  const renderItem = useCallback(
    (item: ChatItem, ctx: { gifsEnabled: boolean; gifAnimateOnHoverOnly: boolean }) => {
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

      if (msg.messageType === 'system' && msg.systemEvent) {
        return (
          <>
            {unreadMarker}
            <SystemMessageRow event={msg.systemEvent} />
          </>
        );
      }

      const replyQuote: ReplyQuotePayload | null = msg.replyToMessageId
        ? {
            text: buildReplySnippet(messagesById.get(msg.replyToMessageId), tLocal as any),
            quotedAuthor: resolveQuotedAuthorPreview(
              messagesById.get(msg.replyToMessageId),
              participantProfiles,
              memberSettings,
              identity as any,
            ),
            onQuoteClick: () => scrollToMessageId(msg.replyToMessageId!),
          }
        : null;

      return (
        <>
          {unreadMarker}
          <MessageBubble
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
            senderProfile={msg.fromIdentityId !== identity?.id ? participantProfiles[msg.fromIdentityId] : undefined}
            ownProfile={identity as PublicIdentity | undefined}
            layout={messageLayout}
            participantProfiles={participantProfiles}
            memberSettings={memberSettings}
            memberColorDisplay={memberColorDisplay}
            replyQuote={replyQuote}
            onReply={() => onReply(msg)}
            isFlashHighlight={flashingMessageId === msg.id}
            onLinkClick={onLinkClick}
            onMentionClick={onMentionClick}
            selfId={identity?.id}
            gifsEnabled={ctx.gifsEnabled}
            gifAnimateOnHoverOnly={ctx.gifAnimateOnHoverOnly}
            isPinned={pinnedSet.has(msg.id)}
            canManagePin={canManagePins}
            onPin={() => onPinMessage(msg.id)}
            onUnpin={() => onUnpinMessage(msg.id)}
            onOpenMemberSecurity={onOpenMemberSecurity}
          />
        </>
      );
    },
    [
      t, tLocal, messagesById, participantProfiles, memberSettings, identity,
      scrollToMessageId, onDeleteMessage, onReact, onToggleReaction,
      onReportMessage, getGroupedReactions, favoriteEmojis, onAddFavorite,
      onRemoveFavorite, fsInfo, messageLayout, memberColorDisplay,
      flashingMessageId, onReply, onLinkClick, onMentionClick,
      pinnedSet, canManagePins, onPinMessage, onUnpinMessage,
      onOpenMemberSecurity,
    ],
  );

  const ctx = useMemo(
    () => ({ gifsEnabled, gifAnimateOnHoverOnly }),
    [gifsEnabled, gifAnimateOnHoverOnly],
  );

  const jumpShowsUnreads = showScrollButton && unreadCount > 0;
  const jumpAriaLabel = jumpShowsUnreads
    ? tLocal('conversations.jumpToLatestWithUnread', {
        count: unreadCount,
        defaultValue: `Jump to latest message, ${unreadCount} unread`,
      })
    : t('conversations.jumpToLatest', 'Jump to latest message');
  const jumpTooltip = jumpShowsUnreads ? jumpAriaLabel : t('conversations.jumpToLatest', 'Jump to latest message');

  return (
    <div className="conversation-messages" ref={messagesContainerRef as React.RefObject<HTMLDivElement>}>
      {conversationId !== activeConversationId || (messagesLoading && reversedMessagesLength === 0) ? (
        <div className="dm-messages-loading">
          <div className="dm-messages-spinner" />
        </div>
      ) : reversedMessagesLength === 0 && !messagesLoading ? (
        <div className="conversation-messages-empty">
          <p>{t('conversations.noMessages', 'No messages yet. Say hello!')}</p>
        </div>
      ) : (
        <div
          ref={scrollViewportRef as React.RefObject<HTMLDivElement>}
          className={`dm-messages${messageLayout === 'linear' ? ' dm-messages--linear' : ''}`}
          onScroll={onScrollViewportScroll}
          onWheel={onUserScrollIntent}
          onTouchMove={onUserScrollIntent}
        >
          {messagesLoading && reversedMessagesLength > 0 ? (
            <div className="dm-messages-history-loading" aria-busy="true">
              <span className="spinner spinner-sm" />
            </div>
          ) : null}
          <div ref={topSentinelRef} className="dm-messages-top-sentinel" aria-hidden />
          <div ref={messagesContentRef as React.RefObject<HTMLDivElement>} className="dm-messages-content">
            {flatItems.map((item, idx) => (
              <div
                key={item.key}
                className="dm-messages-item"
                data-dm-item-index={idx}
                data-scroll-anchor-key={item.key}
                {...(item.type === 'message' ? { 'data-message-id': item.msg.id } as const : {})}
              >
                {renderItem(item, ctx)}
              </div>
            ))}
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
              <span className="conversation-scroll-to-bottom__badge" aria-hidden>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
              <span className="conversation-scroll-to-bottom__label">
                {tLocal('conversations.jumpToLatestLabel', { defaultValue: 'Latest' })}
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
