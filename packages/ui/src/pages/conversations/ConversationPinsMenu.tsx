import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { parsePayload } from '../../services/messagePayload';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import {
  buildReplySnippet,
  formatMessageTime,
  resolveDisplayName,
  resolveQuotedAuthorPreview,
  type ReplyQuotePayload,
} from './conversationUtils';
import { MessageGifAttachment } from './MessageGifAttachment';
import { MessageMediaAttachment } from './MessageMediaAttachment';
import { ReplyQuoteButton } from './MessageBubble';

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

async function hydrateReplyParentsForPins(
  messages: DisplayMessage[],
  conversationId: string,
  messagesById: Map<string, DisplayMessage>,
  ensureReplyParentHydration: (cid: string, parentId: string) => Promise<void>,
): Promise<void> {
  const missing = new Set<string>();
  for (const m of messages) {
    const pid = m.replyToMessageId;
    if (pid && !messagesById.has(pid)) missing.add(pid);
  }
  if (missing.size === 0) return;
  await Promise.all([...missing].map((pid) => ensureReplyParentHydration(conversationId, pid)));
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
  messagesById,
  ensureReplyParentHydration,
  identity,
  memberColorDisplay,
  gifsEnabled,
  gifAnimateOnHoverOnly = false,
}: {
  conversationId: string;
  pinnedCount: number;
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
  messagesById: Map<string, DisplayMessage>;
  ensureReplyParentHydration: (conversationId: string, parentMessageId: string) => Promise<void>;
  identity: PublicIdentity | null | undefined;
  memberColorDisplay: MemberColorDisplay;
  gifsEnabled: boolean;
  gifAnimateOnHoverOnly?: boolean;
}) {
  const { t } = useTranslation();
  const messagesByIdRef = useRef(messagesById);
  messagesByIdRef.current = messagesById;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DisplayMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    setPanelStyle({
      position: 'fixed',
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
      width: 'min(100vw - 2rem, 380px)',
      maxHeight: 'min(360px, calc(100vh - 3rem))',
      zIndex: 1400,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const w = window;
    w.addEventListener('resize', updatePanelPosition);
    w.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      w.removeEventListener('resize', updatePanelPosition);
      w.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, loading, items.length, updatePanelPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const loadFirst = useCallback(async () => {
    setItems([]);
    setNextCursor(null);
    if (pinnedCount === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await loadPinnedMessagesPage(conversationId, null);
      if (!res) return;
      await hydrateReplyParentsForPins(
        res.messages,
        conversationId,
        messagesByIdRef.current,
        ensureReplyParentHydration,
      );
      setItems(sortPinsNewestFirst(res.messages));
      setNextCursor(res.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [conversationId, pinnedCount, loadPinnedMessagesPage, ensureReplyParentHydration]);

  useEffect(() => {
    if (!open) return;
    void loadFirst();
  }, [open, loadFirst, pinnedMessageIdsKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const res = await loadPinnedMessagesPage(conversationId, nextCursor);
      if (!res) return;
      await hydrateReplyParentsForPins(
        res.messages,
        conversationId,
        messagesByIdRef.current,
        ensureReplyParentHydration,
      );
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
    } finally {
      setLoadingMore(false);
    }
  }, [
    conversationId,
    nextCursor,
    loadingMore,
    loading,
    loadPinnedMessagesPage,
    ensureReplyParentHydration,
  ]);

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

  const panel = open ? (
    <div
      ref={panelRef}
      id="conversation-pins-panel"
      className="conversation-pins-panel"
      style={panelStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="conversation-pins-panel-title"
    >
      <div className="conversation-pins-panel-header">
        <div id="conversation-pins-panel-title" className="conversation-pins-panel-title">
          {t('conversations.pinnedMessages', 'Pinned messages')}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="conversation-pins-panel-close"
          aria-label={t('conversations.closePinsPanel', 'Close pinned messages')}
          onClick={() => setOpen(false)}
        >
          <Icon name="x" size="sm" />
        </Button>
      </div>
      <div className="conversation-pins-panel-scroll" ref={scrollRef}>
        {loading && (
          <div className="conversation-pins-panel-loading">
            <div className="dm-messages-spinner" />
          </div>
        )}
        {!loading && pinnedCount === 0 && (
          <p className="conversation-pins-panel-empty">
            {t('conversations.pinsEmpty', 'No pinned messages yet.')}
          </p>
        )}
        {!loading && pinnedCount > 0 && items.length === 0 && (
          <p className="conversation-pins-panel-empty">
            {t('conversations.pinsCouldNotLoad', 'Could not load pins.')}
          </p>
        )}
        {!loading &&
          items.map((msg) => {
            const isOwn = msg.fromIdentityId === identity?.id;
            const senderColor = memberSettings[msg.fromIdentityId]?.color;
            const senderNameStyle: CSSProperties | undefined = senderColor
              ? { color: senderColor }
              : undefined;
            const avatarAccentStyle: CSSProperties | undefined =
              senderColor && !isOwn && memberColorDisplay === 'name-and-accent'
                ? { boxShadow: `0 0 0 2px ${senderColor}` }
                : undefined;
            const profile: PublicIdentity | undefined =
              isOwn && identity ? identity : participantProfiles[msg.fromIdentityId];
            const displayName = resolveDisplayName(
              msg.fromIdentityId,
              participantProfiles,
              memberSettings,
              identity?.id,
              t,
            );
            const avatarUrl = profile?.avatarUrl;
            const avatarInner = avatarUrl ? (
              <img src={avatarUrl} alt="" className="conversation-pins-panel-row-avatar-img" />
            ) : (
              <span className="conversation-pins-panel-row-avatar-placeholder" aria-hidden>
                {(displayName.charAt(0) || '?').toUpperCase()}
              </span>
            );
            const raw = msg.decryptedContent ?? '';
            const parsed = parsePayload(raw);
            const preview = pinPreviewText(msg);
            const line =
              preview || t('conversations.pinnedMessageFallback', 'Pinned message');
            const hasGif = parsed.gifAttachments.length > 0;
            const hasMedia = parsed.attachments.length > 0;
            const parentForQuote = msg.replyToMessageId
              ? messagesById.get(msg.replyToMessageId)
              : undefined;
            const replyQuote: ReplyQuotePayload | null =
              msg.replyToMessageId && !msg.deleted
                ? {
                    text: buildReplySnippet(parentForQuote, t),
                    quotedAuthor: resolveQuotedAuthorPreview(
                      parentForQuote,
                      participantProfiles,
                      memberSettings,
                      identity ?? null,
                    ),
                    onQuoteClick: () => handleGoTo(msg.replyToMessageId!),
                  }
                : null;
            return (
              <div key={msg.id} className="conversation-pins-panel-row">
                <div
                  role="button"
                  tabIndex={0}
                  className="conversation-pins-panel-row-main"
                  onClick={() => handleGoTo(msg.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleGoTo(msg.id);
                    }
                  }}
                >
                  {replyQuote ? (
                    <div
                      className="conversation-pins-panel-row-reply-quote"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <ReplyQuoteButton replyQuote={replyQuote} />
                    </div>
                  ) : null}
                  <div className="conversation-pins-panel-row-head">
                    {profile ? (
                      <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
                        <div className="conversation-pins-panel-row-avatar" style={avatarAccentStyle}>
                          {avatarInner}
                        </div>
                      </IdentityHoverCard>
                    ) : (
                      <div className="conversation-pins-panel-row-avatar" style={avatarAccentStyle}>
                        {avatarInner}
                      </div>
                    )}
                    <div className="conversation-pins-panel-row-head-main">
                      <div className="conversation-pins-panel-row-head-line">
                        {profile ? (
                          <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
                            <span className="conversation-pins-panel-row-author" style={senderNameStyle}>
                              {displayName}
                            </span>
                          </IdentityHoverCard>
                        ) : (
                          <span className="conversation-pins-panel-row-author" style={senderNameStyle}>
                            {displayName}
                          </span>
                        )}
                        <span className="conversation-pins-panel-row-time-inline">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  {hasGif && (
                    <div
                      className="conversation-pins-panel-row-gifs"
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
                      className="conversation-pins-panel-row-media"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {parsed.attachments.map((att) => (
                        <MessageMediaAttachment key={att.e2eMediaId} attachment={att} />
                      ))}
                    </div>
                  )}
                  <span className="conversation-pins-panel-row-text">{line}</span>
                </div>
                {canUnpin && (
                  <Tooltip
                    content={t('conversations.removePinTooltip', 'Remove Pin')}
                    position="left"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="conversation-pins-panel-unpin"
                      aria-label={t('conversations.removePinTooltip', 'Remove Pin')}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleUnpin(msg.id);
                      }}
                    >
                      <Icon name="x" size="sm" />
                    </Button>
                  </Tooltip>
                )}
              </div>
            );
          })}
        {nextCursor != null && <div ref={sentinelRef} className="conversation-pins-panel-sentinel" />}
        {loadingMore && (
          <div className="conversation-pins-panel-loading-more">
            <div className="dm-messages-spinner" />
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={anchorRef} className="conversation-pins-anchor">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'conversation-pins-panel' : undefined}
        aria-label={t('conversations.pins', 'Pins')}
        title={t('conversations.pins', 'Pins')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="conversation-toolbar-pins-icon-wrap">
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="locationPin" size="sm" />
          </span>
          {pinnedCount > 0 && (
            <span className="conversation-toolbar-pins-badge" aria-hidden>
              {pinnedCount > 99 ? '99+' : pinnedCount}
            </span>
          )}
        </span>
      </Button>
      {typeof document !== 'undefined' && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
