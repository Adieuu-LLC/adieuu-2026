/**
 * Shared scroll orchestration for non-virtualized message lists.
 *
 * Provides anchor preservation for older-page loads, initial bottom snap,
 * and jump-to-latest. Conversation-specific concerns (deep links, reply
 * jumps, URL params, buffer trimming, free-tier cutoff) stay in
 * {@link useConversationScrollOrchestration}.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type RefObject,
} from 'react';
import {
  applyHistoryScrollAnchor,
  applyDistanceFromBottom,
  readDistanceFromBottom,
  type HistoryScrollAnchor,
} from '../utils/messageScrollUtils';
import { clearMessageScrollCache } from './useMessageScroll';

export interface MessageListItem {
  key: string;
  type: string;
}

export interface UseMessageScrollOrchestrationOptions {
  entityId: string | undefined;
  activeEntityId: string | null;
  messageLayoutKey: string;
  flatItems: MessageListItem[];
  messagesLoading: boolean;
  hasOlderCursor: boolean;
  hasNewerPages: boolean;
  loadOlder: () => void | Promise<unknown>;
  loadNewer: () => void | Promise<unknown>;
  jumpToLatest?: (id: string) => Promise<unknown>;
  latestMessageId?: string;
  headMessageId?: string;
  scrollViewportRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  setIsAtBottom: (v: boolean) => void;
  cachedScrollIndex: number | null;
}

export interface UseMessageScrollOrchestrationResult {
  handleReachOlder: () => void;
  handleReachNewer: () => void;
  handleJumpToLatest: () => Promise<void>;
}

export function useMessageScrollOrchestration(
  opts: UseMessageScrollOrchestrationOptions,
): UseMessageScrollOrchestrationResult {
  const {
    entityId,
    activeEntityId,
    messageLayoutKey,
    flatItems,
    messagesLoading,
    hasOlderCursor,
    hasNewerPages,
    loadOlder,
    loadNewer,
    jumpToLatest,
    latestMessageId,
    headMessageId,
    scrollViewportRef,
    messagesContentRef,
    isAtBottomRef,
    scrollToBottom,
    setIsAtBottom,
    cachedScrollIndex,
  } = opts;

  // Anchor to the first row still visible at the top of the viewport before an
  // older page is requested, captured as its offset from the viewport top. The
  // restore below re-applies that offset via applyHistoryScrollAnchor, retried
  // across rAF + a ResizeObserver window so late row growth (media, reaction
  // chips, banners) that shifts content above the anchor is corrected rather
  // than left as a visible jump.
  const pendingOlderAnchorRef = useRef<HistoryScrollAnchor | null>(null);
  const initialOpenBottomSnapDoneRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    initialOpenBottomSnapDoneRef.current = false;
    pendingOlderAnchorRef.current = null;
  }, [entityId]);

  const handleReachOlder = useCallback(() => {
    if (!hasOlderCursor || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    pendingOlderAnchorRef.current = null;
    if (vp && content) {
      const vRect = vp.getBoundingClientRect();
      // First row whose bottom is still below the viewport top edge: the topmost
      // row the user can actually see. Anchoring to a visible row (not the
      // topmost DOM row, which may be far above after several pages) keeps the
      // correction stable even when the prepended page is short.
      for (let i = 0; i < content.children.length; i++) {
        const el = content.children[i] as HTMLElement;
        const key = el.dataset.scrollAnchorKey;
        if (!key) continue;
        const cr = el.getBoundingClientRect();
        if (cr.bottom > vRect.top + 1) {
          pendingOlderAnchorRef.current = {
            anchorKey: key,
            targetViewportOffsetPx: cr.top - vRect.top,
          };
          break;
        }
      }
    }
    void loadOlder();
  }, [hasOlderCursor, messagesLoading, loadOlder, scrollViewportRef, messagesContentRef]);

  const handleReachNewer = useCallback(() => {
    if (!hasNewerPages || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    const distBefore = vp ? readDistanceFromBottom(vp) : 0;
    let anchor: HistoryScrollAnchor | null = null;
    if (vp && content && headMessageId) {
      const vRect = vp.getBoundingClientRect();
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(headMessageId)
          : headMessageId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const row = content.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
      if (row) {
        const cr = row.getBoundingClientRect();
        anchor = { anchorKey: headMessageId, targetViewportOffsetPx: cr.top - vRect.top };
      }
    }
    const gen = generationRef.current;
    void Promise.resolve(loadNewer()).then(() => {
      if (gen !== generationRef.current) return;
      requestAnimationFrame(() => {
        if (gen !== generationRef.current) return;
        requestAnimationFrame(() => {
          if (gen !== generationRef.current) return;
          const el = scrollViewportRef.current;
          const c = messagesContentRef.current;
          if (anchor && el && c) {
            applyHistoryScrollAnchor(el, c, anchor);
          } else if (el) {
            applyDistanceFromBottom(el, distBefore);
          }
        });
      });
    });
  }, [
    headMessageId,
    hasNewerPages,
    messagesLoading,
    loadNewer,
    scrollViewportRef,
    messagesContentRef,
  ]);

  const handleJumpToLatest = useCallback(async () => {
    if (!entityId) return;
    if (
      !messagesLoading &&
      !hasNewerPages &&
      latestMessageId &&
      headMessageId === latestMessageId
    ) {
      clearMessageScrollCache(entityId);
      pendingOlderAnchorRef.current = null;
      setIsAtBottom(true);
      scrollToBottom('smooth');
      return;
    }
    clearMessageScrollCache(entityId);
    pendingOlderAnchorRef.current = null;
    setIsAtBottom(true);
    const gen = generationRef.current;
    if (jumpToLatest) {
      await jumpToLatest(entityId);
    }
    if (gen !== generationRef.current) return;
    requestAnimationFrame(() => {
      if (gen !== generationRef.current) return;
      requestAnimationFrame(() => {
        if (gen !== generationRef.current) return;
        scrollToBottom('auto');
      });
    });
  }, [
    entityId,
    latestMessageId,
    headMessageId,
    messagesLoading,
    hasNewerPages,
    jumpToLatest,
    scrollToBottom,
    setIsAtBottom,
  ]);

  // Older-page load position preservation.
  //
  // Synchronously before paint (and again across the next frames), re-apply the
  // captured anchor's viewport offset so the row the user was looking at stays
  // put after older history is prepended above it.
  useLayoutEffect(() => {
    if (messagesLoading) return;
    const anchor = pendingOlderAnchorRef.current;
    if (!anchor) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    const run = () => {
      const a = pendingOlderAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') pendingOlderAnchorRef.current = null;
    };
    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [messagesLoading, flatItems.length, entityId, scrollViewportRef, messagesContentRef]);

  // Keep correcting the anchor while row heights settle asynchronously (avatars,
  // media, reaction chips) so a late height change above the anchor does not
  // leave a visible jump. Clears once aligned for two consecutive ticks, when
  // the anchor row disappears, or after a safety timeout.
  useEffect(() => {
    if (messagesLoading) return undefined;
    if (!pendingOlderAnchorRef.current) return undefined;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return undefined;

    let consecutiveAligned = 0;
    const tick = () => {
      const a = pendingOlderAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') {
        pendingOlderAnchorRef.current = null;
        return;
      }
      if (r === 'aligned') {
        consecutiveAligned += 1;
        if (consecutiveAligned >= 2) pendingOlderAnchorRef.current = null;
      } else {
        consecutiveAligned = 0;
      }
    };

    const ro = new ResizeObserver(() => {
      tick();
    });
    ro.observe(content);
    tick();

    const t = window.setTimeout(() => {
      pendingOlderAnchorRef.current = null;
      ro.disconnect();
    }, 2800);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [messagesLoading, flatItems.length, entityId, scrollViewportRef, messagesContentRef]);

  // Keep bottom pinned when new messages arrive
  useLayoutEffect(() => {
    if (!entityId) return;
    if (activeEntityId !== entityId) return;
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (!isAtBottomRef.current) return;
    vp.scrollTop = vp.scrollHeight - vp.clientHeight;
  }, [messageLayoutKey, entityId, activeEntityId, isAtBottomRef, scrollViewportRef]);

  // Initial open bottom snap
  useLayoutEffect(() => {
    if (!entityId || cachedScrollIndex != null) return;
    if (activeEntityId !== entityId) return;
    if (flatItems.length === 0 || messagesLoading) return;
    if (initialOpenBottomSnapDoneRef.current) return;
    initialOpenBottomSnapDoneRef.current = true;
    const gen = generationRef.current;
    requestAnimationFrame(() => {
      if (gen !== generationRef.current) return;
      requestAnimationFrame(() => {
        if (gen !== generationRef.current) return;
        scrollToBottom('auto');
      });
    });
  }, [entityId, activeEntityId, cachedScrollIndex, flatItems.length, messagesLoading, scrollToBottom]);

  return {
    handleReachOlder,
    handleReachNewer,
    handleJumpToLatest,
  };
}
