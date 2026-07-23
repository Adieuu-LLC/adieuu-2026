/**
 * Shared Channel Pins Menu.
 *
 * Renders a toolbar button + dropdown panel showing pinned messages.
 * Works with any channel type via the shared {@link ChannelMessage} model.
 */

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
import { useIsMobile } from '../../hooks/useIsMobile';
import type { PublicIdentity } from '@adieuu/shared';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { ChannelMessage } from './channelMessage';
import { Button } from '../Button';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';

function pinPreviewText(msg: ChannelMessage): string {
  if (msg.deleted) return '';
  const t = msg.body.replace(/\s+/g, ' ').trim();
  if (t.length <= 160) return t;
  return `${t.slice(0, 160)}…`;
}

function sortPinsNewestFirst(messages: ChannelMessage[]): ChannelMessage[] {
  return [...messages].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return b.id.localeCompare(a.id);
  });
}

function resolveDisplayName(
  identityId: string,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
): string {
  const nickname = settings[identityId]?.nickname;
  if (nickname) return nickname;
  const p = profiles[identityId];
  return p?.displayName ?? p?.username ?? identityId.slice(0, 8);
}

export interface ChannelPinsMenuProps {
  channelId: string;
  pinnedCount: number;
  pinnedMessageIdsKey: string;
  loadPinnedMessagesPage: (
    channelId: string,
    cursor?: string | null,
  ) => Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null>;
  scrollToMessageId?: (messageId: string) => void;
  onUnpin: (messageId: string) => Promise<void>;
  canUnpin: boolean;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  identity: { id: string; avatarUrl?: string; displayName?: string } | null | undefined;
}

export function ChannelPinsMenu({
  channelId,
  pinnedCount,
  pinnedMessageIdsKey,
  loadPinnedMessagesPage,
  scrollToMessageId,
  onUnpin,
  canUnpin,
  participantProfiles,
  memberSettings,
  identity,
}: ChannelPinsMenuProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ChannelMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const generationRef = useRef(0);

  const updatePanelPosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();

    if (isMobileRef.current) {
      setPanelStyle({
        position: 'fixed',
        top: r.bottom + 8,
        left: '2vw',
        width: '96vw',
        maxHeight: 'min(360px, calc(100vh - 3rem))',
        zIndex: 1400,
      });
    } else {
      setPanelStyle({
        position: 'fixed',
        top: r.bottom + 8,
        right: window.innerWidth - r.right,
        width: 'min(100vw - 2rem, 380px)',
        maxHeight: 'min(360px, calc(100vh - 3rem))',
        zIndex: 1400,
      });
    }
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
  }, [open, loading, items.length, isMobile, updatePanelPosition]);

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
    const gen = ++generationRef.current;
    setItems([]);
    setNextCursor(null);
    if (pinnedCount === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await loadPinnedMessagesPage(channelId, null);
      if (gen !== generationRef.current || !res) return;
      setItems(sortPinsNewestFirst(res.messages));
      setNextCursor(res.nextCursor);
    } catch {
      // consumed -- the void call site cannot handle rejections
    } finally {
      if (gen === generationRef.current) setLoading(false);
    }
  }, [channelId, pinnedCount, loadPinnedMessagesPage]);

  useEffect(() => {
    if (!open) return;
    void loadFirst();
  }, [open, loadFirst, pinnedMessageIdsKey]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || loading) return;
    const gen = generationRef.current;
    setLoadingMore(true);
    try {
      const res = await loadPinnedMessagesPage(channelId, nextCursor);
      if (gen !== generationRef.current || !res) return;
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
    } catch {
      // consumed -- the void call site cannot handle rejections
    } finally {
      if (gen === generationRef.current) setLoadingMore(false);
    }
  }, [channelId, nextCursor, loadingMore, loading, loadPinnedMessagesPage]);

  useEffect(() => {
    if (!open || !nextCursor || loadingMore || loading) return;
    const root = scrollRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { root, rootMargin: '100px', threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [open, nextCursor, loadingMore, loading, loadMore, items.length]);

  const handleGoTo = useCallback(
    (messageId: string) => {
      scrollToMessageId?.(messageId);
      setOpen(false);
    },
    [scrollToMessageId],
  );

  const handleUnpin = useCallback(
    async (messageId: string) => {
      await onUnpin(messageId);
      setItems((prev) => prev.filter((m) => m.id !== messageId));
    },
    [onUnpin],
  );

  const panel = open ? (
    <div
      ref={panelRef}
      id="channel-pins-panel"
      className="conversation-pins-panel"
      style={panelStyle}
      role="dialog"
      aria-labelledby="channel-pins-panel-title"
    >
      <div className="conversation-pins-panel-header">
        <div id="channel-pins-panel-title" className="conversation-pins-panel-title">
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
            const displayName = resolveDisplayName(
              msg.fromIdentityId,
              participantProfiles,
              memberSettings,
            );
            const profile = participantProfiles[msg.fromIdentityId];
            const avatarUrl = msg.fromIdentityId === identity?.id
              ? identity.avatarUrl
              : profile?.avatarUrl;
            const preview = pinPreviewText(msg);
            return (
              <div key={msg.id} className="conversation-pins-panel-row">
                <button
                  type="button"
                  className="conversation-pins-panel-row-main"
                  onClick={() => handleGoTo(msg.id)}
                >
                  <div className="conversation-pins-panel-row-body">
                    <div className="conversation-pins-panel-row-avatar-col">
                      <div className="conversation-pins-panel-row-avatar">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="conversation-pins-panel-row-avatar-img"
                          />
                        ) : (
                          <span
                            className="conversation-pins-panel-row-avatar-placeholder"
                            aria-hidden
                          >
                            {(displayName.charAt(0) || '?').toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="conversation-pins-panel-row-content-col">
                      <div className="conversation-pins-panel-row-meta">
                        <span className="conversation-pins-panel-row-author">
                          {displayName}
                        </span>
                      </div>
                      {preview && (
                        <span className="conversation-pins-panel-row-text">
                          {preview}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
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
        {nextCursor != null && (
          <div ref={sentinelRef} className="conversation-pins-panel-sentinel" />
        )}
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
        aria-controls={open ? 'channel-pins-panel' : undefined}
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
