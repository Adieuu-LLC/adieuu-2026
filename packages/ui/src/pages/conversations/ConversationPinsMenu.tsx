import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal } from '@ark-ui/react';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { parsePayload } from '../../services/messagePayload';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { formatMessageTime } from './conversationUtils';
import { resolveToolbarParticipantName } from './conversationViewModel';
import { MessageGifAttachment } from './MessageGifAttachment';
import { MessageMediaAttachment } from './MessageMediaAttachment';

function pinPreviewText(msg: DisplayMessage): string {
  if (msg.deleted) return '';
  if (msg.messageType === 'system') return '';
  const raw = msg.decryptedContent ?? '';
  if (!raw) return '';
  const { text } = parsePayload(raw);
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= 160) return t;
  return `${t.slice(0, 160)}…`;
}

function sortPinsNewestFirst(messages: DisplayMessage[]): DisplayMessage[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

export function ConversationPinsMenu({
  conversationId,
  pinnedCount,
  pinnedMessageIdsKey,
  loadPinnedMessagesPage,
  scrollToMessageId,
  onUnpin,
  canUnpin,
  participantProfiles,
  memberSettings,
  gifsEnabled,
  gifAnimateOnHoverOnly = false,
}: {
  conversationId: string;
  pinnedCount: number;
  /** Changes when pin membership/order updates (e.g. new pin while menu open). */
  pinnedMessageIdsKey: string;
  loadPinnedMessagesPage: (
    conversationId: string,
    cursor?: string | null
  ) => Promise<{ messages: DisplayMessage[]; nextCursor: string | null } | null>;
  scrollToMessageId: (messageId: string) => void;
  onUnpin: (messageId: string) => Promise<void>;
  canUnpin: boolean;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  gifsEnabled: boolean;
  gifAnimateOnHoverOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DisplayMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadFirst = useCallback(async () => {
    setItems([]);
    setNextCursor(null);
    if (pinnedCount === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await loadPinnedMessagesPage(conversationId, null);
    setLoading(false);
    if (!res) return;
    setItems(sortPinsNewestFirst(res.messages));
    setNextCursor(res.nextCursor);
  }, [conversationId, pinnedCount, loadPinnedMessagesPage]);

  useEffect(() => {
    if (!open) return;
    void loadFirst();
  }, [open, loadFirst, pinnedMessageIdsKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    const res = await loadPinnedMessagesPage(conversationId, nextCursor);
    setLoadingMore(false);
    if (!res) return;
    setItems((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of res.messages) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          merged.push(m);
        }
      }
      return sortPinsNewestFirst(merged);
    });
    setNextCursor(res.nextCursor);
  }, [conversationId, nextCursor, loadingMore, loading, loadPinnedMessagesPage]);

  useEffect(() => {
    if (!open || !nextCursor || loadingMore || loading) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: '100px', threshold: 0 }
    );
    io.observe(target);
    return () => io.disconnect();
  }, [open, nextCursor, loadingMore, loading, loadMore, items.length]);

  const handleGoTo = useCallback(
    (messageId: string) => {
      scrollToMessageId(messageId);
      setOpen(false);
    },
    [scrollToMessageId]
  );

  const handleUnpin = useCallback(
    async (messageId: string) => {
      await onUnpin(messageId);
      setItems((prev) => prev.filter((m) => m.id !== messageId));
    },
    [onUnpin]
  );

  return (
    <Popover.Root
      open={open}
      onOpenChange={(d) => setOpen(d.open)}
      closeOnInteractOutside
      closeOnEscape
      autoFocus={false}
      positioning={{ placement: 'bottom-end', gutter: 8 }}
      onInteractOutside={() => {
        setOpen(false);
      }}
    >
      <Popover.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${open ? ' active' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('conversations.pins', 'Pins')}
          title={t('conversations.pins', 'Pins')}
        >
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="locationPin" size="sm" />
          </span>
          {pinnedCount > 0 && (
            <span className="conversation-toolbar-pins-badge">{pinnedCount}</span>
          )}
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content className="conversation-pins-popover">
            <div className="conversation-pins-popover-title">
              {t('conversations.pinnedMessages', 'Pinned messages')}
            </div>
            <div className="conversation-pins-popover-scroll" ref={scrollRef}>
              {loading && (
                <div className="conversation-pins-popover-loading">
                  <div className="dm-messages-spinner" />
                </div>
              )}
              {!loading && pinnedCount === 0 && (
                <p className="conversation-pins-popover-empty">
                  {t('conversations.pinsEmpty', 'No pinned messages yet.')}
                </p>
              )}
              {!loading && pinnedCount > 0 && items.length === 0 && (
                <p className="conversation-pins-popover-empty">
                  {t('conversations.pinsCouldNotLoad', 'Could not load pins.')}
                </p>
              )}
              {!loading &&
                items.map((msg) => {
                  const author = resolveToolbarParticipantName(
                    msg.fromIdentityId,
                    memberSettings,
                    participantProfiles
                  );
                  const raw = msg.decryptedContent ?? '';
                  const parsed = parsePayload(raw);
                  const preview = pinPreviewText(msg);
                  const line =
                    preview || t('conversations.pinnedMessageFallback', 'Pinned message');
                  const hasGif = parsed.gifAttachments.length > 0;
                  const hasMedia = parsed.attachments.length > 0;
                  return (
                    <div key={msg.id} className="conversation-pins-popover-row">
                      <div
                        role="button"
                        tabIndex={0}
                        className="conversation-pins-popover-row-main"
                        onClick={() => handleGoTo(msg.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleGoTo(msg.id);
                          }
                        }}
                      >
                        <span className="conversation-pins-popover-row-author">{author}</span>
                        {hasGif && (
                          <div
                            className="conversation-pins-popover-row-gifs"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {parsed.gifAttachments.map((gif, i) => (
                              <MessageGifAttachment
                                key={`${msg.id}-gif-${i}`}
                                gif={gif}
                                gifsEnabled={gifsEnabled}
                                gifAnimateOnHoverOnly={gifAnimateOnHoverOnly}
                              />
                            ))}
                          </div>
                        )}
                        {hasMedia && (
                          <div
                            className="conversation-pins-popover-row-media"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            {parsed.attachments.map((att) => (
                              <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
                            ))}
                          </div>
                        )}
                        <span className="conversation-pins-popover-row-text">{line}</span>
                        <span className="conversation-pins-popover-row-time">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                      {canUnpin && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="conversation-pins-popover-unpin"
                          aria-label={t('conversations.unpinMessage', 'Unpin message')}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleUnpin(msg.id);
                          }}
                        >
                          <Icon name="x" size="sm" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              {nextCursor != null && <div ref={sentinelRef} className="conversation-pins-popover-sentinel" />}
              {loadingMore && (
                <div className="conversation-pins-popover-loading-more">
                  <div className="dm-messages-spinner" />
                </div>
              )}
            </div>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
