/**
 * Channel-agnostic scroll state hook for non-virtualized message lists.
 *
 * Provides pin/follow behaviour, scroll-to-bottom, scroll button visibility,
 * and per-entity position caching. Works for both conversationId and channelId.
 *
 * @module hooks/useMessageScroll
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  applyHistoryScrollAnchor,
  computeIsAtBottom,
  type HistoryScrollAnchor,
} from '../utils/messageScrollUtils';

const scrollCache = new Map<string, number>();

export function clearMessageScrollCache(entityId: string): void {
  scrollCache.delete(entityId);
}

/**
 * Distance (px) from the content bottom within which we treat the viewport as
 * "at the latest message". Kept tight so re-pin and unread state are accurate;
 * a large value made the list snap to bottom even when the user was clearly
 * reading history.
 */
export const MESSAGE_AT_BOTTOM_THRESHOLD_PX = 80;

const USER_SCROLL_SUPPRESS_MS = 200;

export interface UseMessageScrollOptions {
  entityId: string | undefined;
  setIsAtBottom: (value: boolean) => void;
  markRead?: (entityId: string) => void;
  messageLayoutKey?: string;
  /**
   * When set to true by the scroll orchestration, a history-page anchor restore
   * is in progress. While active, this hook's own top-anchor correction stands
   * down so the two systems do not fight and overshoot (e.g. by a page height).
   */
  historyAnchorActiveRef?: React.RefObject<boolean>;
}

export interface UseMessageScrollResult {
  scrollViewportRef: React.RefObject<HTMLDivElement | null>;
  messagesContentRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottomRef: React.RefObject<boolean>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToBottomIfPinned: () => void;
  /**
   * Synchronously assert the "pinned to latest" intent (ref + state together)
   * without waiting for a scroll event. Used by jump-to-latest so the layout
   * pin and follow logic engage immediately rather than lagging a frame.
   */
  pinToBottom: () => void;
  markJustSent: () => void;
  cachedScrollIndex: number | null;
  onScrollViewportScroll: () => void;
  onUserScrollIntent: () => void;
}

export function useMessageScroll({
  entityId,
  setIsAtBottom,
  markRead,
  messageLayoutKey,
  historyAnchorActiveRef,
}: UseMessageScrollOptions): UseMessageScrollResult {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const lastUserScrollIntentAtRef = useRef(0);
  const measureRafRef = useRef<number | null>(null);
  const visibleIndexRef = useRef<number | null>(null);
  const prevEntityIdRef = useRef<string | undefined>(undefined);
  // "Sticky bottom" intent, distinct from the instantaneous `isAtBottomRef`.
  // Only a deliberate upward user scroll clears it, so content that grows while
  // idling at the latest message re-pins instead of drifting up.
  const pinnedToBottomRef = useRef(true);
  // Last first-visible row + its viewport offset, used to hold scroll position
  // when content above the viewport grows (reactions/media/replies hydrating).
  const topAnchorRef = useRef<HistoryScrollAnchor | null>(null);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const cachedScrollIndex = entityId != null
    ? (scrollCache.get(entityId) ?? null)
    : null;

  const saveVisibleIndex = useCallback((dataIndex: number) => {
    visibleIndexRef.current = dataIndex;
  }, []);

  const scrollToBottomImpl = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    vp.scrollTo({ top: vp.scrollHeight, behavior });
  }, []);

  const recordTopAnchor = useCallback(() => {
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;
    const vRect = vp.getBoundingClientRect();
    for (let i = 0; i < content.children.length; i++) {
      const el = content.children[i] as HTMLElement | undefined;
      const key = el?.dataset.scrollAnchorKey;
      if (!key) continue;
      const cr = el!.getBoundingClientRect();
      if (cr.bottom > vRect.top + 1) {
        topAnchorRef.current = {
          anchorKey: key,
          targetViewportOffsetPx: cr.top - vRect.top,
        };
        break;
      }
    }
  }, []);

  // Expensive DOM measurement (top-anchor record + first-visible-index scan),
  // each an O(n) getBoundingClientRect loop. Runs at most once per frame via the
  // rAF gate below so fast scrolling does not thrash layout on every scroll
  // event. Reads pinnedToBottomRef, which is updated synchronously in the scroll
  // handler, so the anchor decision here is never stale.
  const measureScrollPosition = useCallback(() => {
    measureRafRef.current = null;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    if (!pinnedToBottomRef.current) {
      recordTopAnchor();
    }

    const vRect = vp.getBoundingClientRect();
    let firstIdx: number | null = null;
    for (let i = 0; i < content.children.length; i++) {
      const el = content.children[i] as HTMLElement | undefined;
      if (!el?.dataset.dmItemIndex) continue;
      const cr = el.getBoundingClientRect();
      if (cr.bottom > vRect.top + 1) {
        firstIdx = Number.parseInt(el.dataset.dmItemIndex!, 10);
        break;
      }
    }
    if (firstIdx != null && !Number.isNaN(firstIdx)) {
      saveVisibleIndex(firstIdx);
    }
  }, [recordTopAnchor, saveVisibleIndex]);

  const onScrollViewportScroll = useCallback(() => {
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    // Cheap, per-event work: at-bottom / pin state only reads scroll metrics
    // (no layout-forcing getBoundingClientRect), so it stays inline.
    const { scrollTop, scrollHeight, clientHeight } = vp;
    const atBottom = computeIsAtBottom(
      scrollTop,
      scrollHeight,
      clientHeight,
      MESSAGE_AT_BOTTOM_THRESHOLD_PX,
    );
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
    if (atBottom && !wasAtBottom && entityId && markRead) {
      markRead(entityId);
    }

    // Only a deliberate wheel/touch scroll unpins from bottom. Growth-induced
    // scroll events (no recent user intent) never clear the intent, so
    // late-loading content re-pins rather than drifting the view upward.
    const recentUserIntent =
      Date.now() - lastUserScrollIntentAtRef.current < USER_SCROLL_SUPPRESS_MS;
    if (atBottom) {
      pinnedToBottomRef.current = true;
    } else if (recentUserIntent) {
      pinnedToBottomRef.current = false;
    }

    // Defer the O(n) measurement to a single coalesced frame.
    if (measureRafRef.current == null) {
      measureRafRef.current = requestAnimationFrame(measureScrollPosition);
    }
  }, [entityId, markRead, measureScrollPosition, setIsAtBottom]);

  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = atBottom;
      if (atBottom) pinnedToBottomRef.current = true;
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom);
      if (atBottom && !wasAtBottom && entityId && markRead) {
        markRead(entityId);
      }
    },
    [entityId, setIsAtBottom, markRead],
  );

  const pinToBottom = useCallback(() => {
    handleAtBottomStateChange(true);
  }, [handleAtBottomStateChange]);

  const onUserScrollIntent = useCallback(() => {
    lastUserScrollIntentAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    const prevId = prevEntityIdRef.current;
    prevEntityIdRef.current = entityId;

    if (prevId && prevId !== entityId) {
      if (isAtBottomRef.current) {
        scrollCache.delete(prevId);
      } else if (visibleIndexRef.current != null) {
        scrollCache.set(prevId, visibleIndexRef.current);
      }
    }

    visibleIndexRef.current = null;
    topAnchorRef.current = null;

    const restoring = entityId != null && scrollCache.has(entityId);
    isAtBottomRef.current = !restoring;
    pinnedToBottomRef.current = !restoring;
    justSentRef.current = false;
    setIsAtBottom(!restoring);
    setShowScrollButton(restoring);
  }, [entityId, setIsAtBottom]);

  useEffect(() => {
    return () => {
      if (measureRafRef.current != null) {
        cancelAnimationFrame(measureRafRef.current);
        measureRafRef.current = null;
      }
      const eid = prevEntityIdRef.current;
      if (!eid) return;
      if (isAtBottomRef.current) {
        scrollCache.delete(eid);
      } else if (visibleIndexRef.current != null) {
        scrollCache.set(eid, visibleIndexRef.current);
      }
    };
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      scrollToBottomImpl(behavior);
    },
    [scrollToBottomImpl],
  );

  const scrollToBottomIfPinned = useCallback(() => {
    if (!pinnedToBottomRef.current) return;
    requestAnimationFrame(() => {
      scrollToBottomImpl('auto');
    });
  }, [scrollToBottomImpl]);

  /**
   * Called whenever the content box changes height (reactions, media, GIFs and
   * reply quotes hydrate asynchronously). Two cases:
   *  - Pinned to bottom: re-pin so the latest message stays in view.
   *  - Otherwise: hold the first-visible row in place so growth above the
   *    viewport does not shove the reading position downward.
   */
  const maybeScrollToBottomAfterContentGrowth = useCallback(() => {
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (pinnedToBottomRef.current) {
      // ResizeObserver fires after layout but before paint, so writing
      // scrollTop here keeps the latest message glued to the bottom within the
      // same frame — no shifted frame is ever painted. A follow-up rAF catches
      // any sub-pixel settling (e.g. a reaction emoji image decoding late).
      vp.scrollTop = vp.scrollHeight;
      requestAnimationFrame(() => {
        if (!pinnedToBottomRef.current) return;
        const v = scrollViewportRef.current;
        if (!v) return;
        v.scrollTop = v.scrollHeight;
      });
      return;
    }
    // A history-page anchor restore owns the scroll position for its settle
    // window; stand down so the two corrections do not fight and overshoot.
    if (historyAnchorActiveRef?.current) {
      return;
    }
    // While the user is mid-gesture, let their input win. Re-anchoring during a
    // fast scroll snaps the view back to a slightly stale row (a jarring
    // downward jump); any residual drift is corrected once the gesture settles.
    if (Date.now() - lastUserScrollIntentAtRef.current < USER_SCROLL_SUPPRESS_MS) {
      return;
    }
    const anchor = topAnchorRef.current;
    const content = messagesContentRef.current;
    if (anchor && content) {
      applyHistoryScrollAnchor(vp, content, anchor);
    }
  }, [historyAnchorActiveRef]);

  const markJustSent = useCallback(() => {
    justSentRef.current = true;
  }, []);

  useEffect(() => {
    if (messageLayoutKey == null) return;
    if (!justSentRef.current) return;
    justSentRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottomImpl('smooth');
        handleAtBottomStateChange(true);
      });
    });
  }, [messageLayoutKey, scrollToBottomImpl, handleAtBottomStateChange]);

  useEffect(() => {
    const el = scrollViewportRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (!pinnedToBottomRef.current) return;
      // Viewport shrank (e.g. the composer grew) while pinned: keep the tail in
      // view synchronously so no shifted frame paints.
      el.scrollTop = el.scrollHeight;
      requestAnimationFrame(() => {
        if (!pinnedToBottomRef.current) return;
        el.scrollTop = el.scrollHeight;
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [entityId, messageLayoutKey]);

  useEffect(() => {
    const content = messagesContentRef.current;
    const vp = scrollViewportRef.current;
    if (!content || !vp) return;

    const observer = new ResizeObserver(() => {
      maybeScrollToBottomAfterContentGrowth();
    });
    observer.observe(content);

    // The message content is only one child of the scroll viewport. The
    // history-loading spinner, manual-paging controls and banners mount as
    // siblings *above* it (e.g. when a reconcile refresh flips loading on/off),
    // which changes the viewport's scrollHeight without resizing the observed
    // content element — so the ResizeObserver above never fires. Watch direct
    // child insert/remove too and re-pin (or re-anchor) with the same logic, so
    // reconcile chrome does not drift the view.
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            maybeScrollToBottomAfterContentGrowth();
          })
        : null;
    mo?.observe(vp, { childList: true });

    return () => {
      observer.disconnect();
      mo?.disconnect();
    };
  }, [entityId, messageLayoutKey, maybeScrollToBottomAfterContentGrowth]);

  return {
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    scrollToBottom,
    scrollToBottomIfPinned,
    pinToBottom,
    markJustSent,
    cachedScrollIndex,
    onScrollViewportScroll,
    onUserScrollIntent,
  };
}
