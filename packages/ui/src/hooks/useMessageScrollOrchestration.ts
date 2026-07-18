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
  computeScrollTopAfterPrepend,
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

  // Viewport scrollHeight captured just before an older page is requested. The
  // restore below adds the height delta to the *current* scrollTop, which keeps
  // the reading position stable regardless of how far the user has scrolled
  // during the async load — an absolute row anchor would instead yank a fast
  // scroller back to a stale row.
  const pendingOlderPrevHeightRef = useRef<number | null>(null);
  const initialOpenBottomSnapDoneRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    initialOpenBottomSnapDoneRef.current = false;
    pendingOlderPrevHeightRef.current = null;
  }, [entityId]);

  const handleReachOlder = useCallback(() => {
    if (!hasOlderCursor || messagesLoading) return;
    const vp = scrollViewportRef.current;
    if (vp) pendingOlderPrevHeightRef.current = vp.scrollHeight;
    void loadOlder();
  }, [hasOlderCursor, messagesLoading, loadOlder, scrollViewportRef]);

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
      pendingOlderPrevHeightRef.current = null;
      setIsAtBottom(true);
      scrollToBottom('smooth');
      return;
    }
    clearMessageScrollCache(entityId);
    pendingOlderPrevHeightRef.current = null;
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
  // Runs once per completed older load: add the height that was prepended above
  // the viewport (scrollHeight delta) to the current scrollTop, synchronously
  // before paint. Because it is a *relative* adjustment to wherever the user is
  // right now, a fast scroll during the async fetch is preserved rather than
  // yanked back to a stale row. Late-loading row heights inside the prepended
  // block (images/fonts) are handled by the idle content-anchor path in
  // useMessageScroll, which yields while the user is actively scrolling.
  useLayoutEffect(() => {
    if (messagesLoading) return;
    const prevHeight = pendingOlderPrevHeightRef.current;
    if (prevHeight == null) return;
    pendingOlderPrevHeightRef.current = null;
    const vp = scrollViewportRef.current;
    if (!vp) return;
    const delta = vp.scrollHeight - prevHeight;
    if (delta > 0) {
      vp.scrollTop = computeScrollTopAfterPrepend(
        vp.scrollTop,
        prevHeight,
        vp.scrollHeight,
      );
    }
  }, [messagesLoading, flatItems.length, entityId, scrollViewportRef]);

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
