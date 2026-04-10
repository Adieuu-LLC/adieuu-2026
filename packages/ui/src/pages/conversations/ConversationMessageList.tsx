import { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso, type VirtuosoHandle, type FollowOutputScalarType } from 'react-virtuoso';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { GroupedReaction } from '../../hooks/useReactions';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { PublicIdentity } from '@adieuu/shared';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { useGifPreference, useConversationGifHidden } from '../../hooks/useGifPreference';
import { CONVERSATION_AT_BOTTOM_THRESHOLD_PX } from '../../hooks/useConversationScroll';
import {
  type ChatItem,
  type ReplyQuotePayload,
  FIRST_ITEM_INDEX,
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
  scrollToBottom,
  virtuosoRef,
  messagesContainerRef,
  followOutput,
  handleAtBottomStateChange,
  handleStartReached,
  handleRangeChanged,
  handleTotalListHeightChanged,
  cachedScrollIndex,
  virtuosoComponents,
  t,
  gifsDisabledByAdmin,
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
  scrollToBottom: () => void;
  virtuosoRef: React.RefObject<VirtuosoHandle | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  followOutput: (isAtBottom: boolean) => FollowOutputScalarType;
  handleAtBottomStateChange: (atBottom: boolean) => void;
  handleStartReached: () => void;
  handleRangeChanged: (range: { startIndex: number; endIndex: number }) => void;
  handleTotalListHeightChanged: () => void;
  cachedScrollIndex: number | null;
  virtuosoComponents: { Header: () => React.ReactElement | null; Item: (props: React.HTMLAttributes<HTMLDivElement>) => React.ReactElement };
  t: (key: string, fallback: string) => string;
  gifsDisabledByAdmin?: boolean;
}) {
  const { t: tLocal } = useTranslation();

  const [gifVisibility] = useGifPreference(identity?.id ?? '');
  const [convGifHidden] = useConversationGifHidden(conversationId ?? '');
  const gifsEnabled = gifVisibility !== 'disabled' && !convGifHidden && !gifsDisabledByAdmin;

  const virtuosoContext = useMemo(() => ({ gifsEnabled }), [gifsEnabled]);

  const itemContent = useCallback((_: number, item: ChatItem, ctx: { gifsEnabled: boolean }) => {
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
        />
      </>
    );
  }, [
    t, tLocal, messagesById, participantProfiles, memberSettings, identity,
    scrollToMessageId, onDeleteMessage, onReact, onToggleReaction,
    onReportMessage, getGroupedReactions, favoriteEmojis, onAddFavorite,
    onRemoveFavorite, fsInfo, messageLayout, memberColorDisplay,
    flashingMessageId, onReply, onLinkClick, onMentionClick,
  ]);

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
        <Virtuoso
          key={conversationId}
          ref={virtuosoRef as React.RefObject<VirtuosoHandle>}
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
          atBottomThreshold={CONVERSATION_AT_BOTTOM_THRESHOLD_PX}
          totalListHeightChanged={handleTotalListHeightChanged}
          overscan={{ main: 800, reverse: 800 }}
          defaultItemHeight={72}
          increaseViewportBy={{ top: 600, bottom: 600 }}
          components={virtuosoComponents}
          context={virtuosoContext}
          itemContent={itemContent}
        />
      )}
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
  );
}
