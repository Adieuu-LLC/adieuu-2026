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

  // Anchor to a row that already existed before an older page is requested,
  // captured as an offset within the scroll content (independent of scrollTop).
  // The restore below adds only the before/after delta of *this row* to the
  // current scrollTop, so it stays a relative adjustment (a fast scroll during
  // the async load is preserved) while ignoring media/reaction/banner growth
  // elsewhere in the list — which a raw scrollHeight delta would wrongly fold in.
  const pendingOlderAnchorRef = useRef<{
    anchorKey: string;
    contentOffsetPx: number;
  } | null>(null);
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
      const row = content.querySelector('[data-scroll-anchor-key]');
      const anchorKey = (row as HTMLElement | null)?.dataset.scrollAnchorKey;
      if (row && anchorKey) {
        const vpTop = vp.getBoundingClientRect().top;
        pendingOlderAnchorRef.current = {
          anchorKey,
          contentOffsetPx: row.getBoundingClientRect().top - vpTop + vp.scrollTop,
        };
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
  // Runs once per completed older load: re-measure the anchor row captured
  // before the load and add only *its* before/after content-offset delta to the
  // current scrollTop, synchronously before paint. Because the offset was stored
  // relative to the scroll content (independent of scrollTop), the delta equals
  // exactly the content inserted above that row, so a fast scroll during the
  // async fetch is preserved and media/reaction/banner growth elsewhere in the
  // list does not skew the correction.
  useLayoutEffect(() => {
    if (messagesLoading) return;
    const anchor = pendingOlderAnchorRef.current;
    if (anchor == null) return;
    pendingOlderAnchorRef.current = null;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(anchor.anchorKey)
        : anchor.anchorKey.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const row = content.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
    if (!row) return;
    const vpTop = vp.getBoundingClientRect().top;
    const after = row.getBoundingClientRect().top - vpTop + vp.scrollTop;
    vp.scrollTop += after - anchor.contentOffsetPx;
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
