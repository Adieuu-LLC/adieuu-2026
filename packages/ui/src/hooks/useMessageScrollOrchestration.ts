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
  type MutableRefObject,
  type RefObject,
} from 'react';
import {
  applyHistoryScrollAnchor,
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
  /**
   * Synchronously pin to the latest message (ref + state). Preferred over
   * {@link setIsAtBottom} for jump-to-latest so the follow/layout-pin logic
   * engages immediately. Falls back to `setIsAtBottom(true)` when absent.
   */
  pinToBottom?: () => void;
  /**
   * Shared flag telling {@link useMessageScroll} that a history-page anchor
   * restore owns the scroll position, so its top-anchor correction stands down.
   */
  historyAnchorActiveRef?: MutableRefObject<boolean>;
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
    pinToBottom,
    historyAnchorActiveRef,
    cachedScrollIndex,
  } = opts;

  // Anchor to the first row still visible at the top of the viewport before a
  // page (older or newer) is requested, captured as its offset from the
  // viewport top. The restore below re-applies that offset via
  // applyHistoryScrollAnchor, retried across rAF + a ResizeObserver window so
  // late row growth (media, reaction chips, banners) that shifts content around
  // the anchor is corrected rather than left as a visible jump.
  const pendingHistoryAnchorRef = useRef<HistoryScrollAnchor | null>(null);
  const initialOpenBottomSnapDoneRef = useRef(false);
  const generationRef = useRef(0);

  // Keep the cross-hook suppression flag in lockstep with the anchor: it is set
  // whenever an anchor is pending and cleared the moment it resolves, so
  // useMessageScroll only stands down for the exact restore window.
  const setHistoryAnchor = useCallback(
    (anchor: HistoryScrollAnchor | null) => {
      pendingHistoryAnchorRef.current = anchor;
      if (historyAnchorActiveRef) historyAnchorActiveRef.current = anchor != null;
    },
    [historyAnchorActiveRef],
  );

  // First row whose bottom is still below the viewport top edge: the topmost
  // row the user can actually see. Anchoring to a visible row (not the topmost
  // DOM row, which may be far above after several pages) keeps the correction
  // stable regardless of how tall the fetched page turns out to be.
  const captureFirstVisibleAnchor = useCallback((): HistoryScrollAnchor | null => {
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return null;
    const vRect = vp.getBoundingClientRect();
    for (let i = 0; i < content.children.length; i++) {
      const el = content.children[i] as HTMLElement;
      const key = el.dataset.scrollAnchorKey;
      if (!key) continue;
      const cr = el.getBoundingClientRect();
      if (cr.bottom > vRect.top + 1) {
        return { anchorKey: key, targetViewportOffsetPx: cr.top - vRect.top };
      }
    }
    return null;
  }, [scrollViewportRef, messagesContentRef]);

  useEffect(() => {
    generationRef.current += 1;
    initialOpenBottomSnapDoneRef.current = false;
    setHistoryAnchor(null);
  }, [entityId, setHistoryAnchor]);

  const handleReachOlder = useCallback(() => {
    if (!hasOlderCursor || messagesLoading) return;
    // Older pages prepend above the viewport; hold the first visible row so the
    // reading position does not jump to the far (older) side of the new page.
    setHistoryAnchor(captureFirstVisibleAnchor());
    void loadOlder();
  }, [hasOlderCursor, messagesLoading, loadOlder, captureFirstVisibleAnchor, setHistoryAnchor]);

  const handleReachNewer = useCallback(() => {
    if (!hasNewerPages || messagesLoading) return;
    // Newer pages append below the viewport; the same first-visible-row anchor
    // (restored via the shared settle loop) keeps the current view fixed while
    // content grows underneath, instead of the one-shot distance-from-bottom
    // restore that could land on the far side after late row growth.
    setHistoryAnchor(captureFirstVisibleAnchor());
    void loadNewer();
  }, [hasNewerPages, messagesLoading, loadNewer, captureFirstVisibleAnchor, setHistoryAnchor]);

  const pinLatest = useCallback(() => {
    if (pinToBottom) pinToBottom();
    else setIsAtBottom(true);
  }, [pinToBottom, setIsAtBottom]);

  const handleJumpToLatest = useCallback(async () => {
    if (!entityId) return;
    // Fast path: already on the live tail (no reload needed). When a caller
    // wires a latest-message id we require the buffer head to match it; without
    // one (Spaces has no per-channel lastMessageId), "no newer pages and not
    // loading" is the tip signal.
    const atLiveTail = latestMessageId
      ? !messagesLoading && !hasNewerPages && headMessageId === latestMessageId
      : !messagesLoading && !hasNewerPages;
    if (atLiveTail) {
      clearMessageScrollCache(entityId);
      setHistoryAnchor(null);
      pinLatest();
      scrollToBottom('smooth');
      return;
    }
    clearMessageScrollCache(entityId);
    setHistoryAnchor(null);
    pinLatest();
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
    setHistoryAnchor,
    pinLatest,
  ]);

  // Older-page load position preservation.
  //
  // Synchronously before paint (and again across the next frames), re-apply the
  // captured anchor's viewport offset so the row the user was looking at stays
  // put after older history is prepended above it.
  useLayoutEffect(() => {
    if (messagesLoading) return;
    const anchor = pendingHistoryAnchorRef.current;
    if (!anchor) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    const run = () => {
      const a = pendingHistoryAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') setHistoryAnchor(null);
    };
    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [messagesLoading, flatItems.length, entityId, scrollViewportRef, messagesContentRef, setHistoryAnchor]);

  // Keep correcting the anchor while row heights settle asynchronously (avatars,
  // media, reaction chips) so a late height change above the anchor does not
  // leave a visible jump. Clears once aligned for two consecutive ticks, when
  // the anchor row disappears, or after a safety timeout.
  useEffect(() => {
    if (messagesLoading) return undefined;
    if (!pendingHistoryAnchorRef.current) return undefined;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return undefined;

    let consecutiveAligned = 0;
    const tick = () => {
      const a = pendingHistoryAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') {
        setHistoryAnchor(null);
        return;
      }
      if (r === 'aligned') {
        consecutiveAligned += 1;
        if (consecutiveAligned >= 2) setHistoryAnchor(null);
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
      setHistoryAnchor(null);
      ro.disconnect();
    }, 2800);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [messagesLoading, flatItems.length, entityId, scrollViewportRef, messagesContentRef, setHistoryAnchor]);

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
