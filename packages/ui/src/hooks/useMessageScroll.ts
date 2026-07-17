/**
 * Channel-agnostic scroll state hook for non-virtualized message lists.
 *
 * Provides pin/follow behaviour, scroll-to-bottom, scroll button visibility,
 * and per-entity position caching. Works for both conversationId and channelId.
 *
 * @module hooks/useMessageScroll
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { computeIsAtBottom } from '../utils/messageScrollUtils';

const scrollCache = new Map<string, number>();

export function clearMessageScrollCache(entityId: string): void {
  scrollCache.delete(entityId);
}

export const MESSAGE_AT_BOTTOM_THRESHOLD_PX = 900;

const USER_SCROLL_SUPPRESS_MS = 200;

export interface UseMessageScrollOptions {
  entityId: string | undefined;
  setIsAtBottom: (value: boolean) => void;
  markRead?: (entityId: string) => void;
  messageLayoutKey?: string;
}

export interface UseMessageScrollResult {
  scrollViewportRef: React.RefObject<HTMLDivElement | null>;
  messagesContentRef: React.RefObject<HTMLDivElement | null>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottomRef: React.RefObject<boolean>;
  showScrollButton: boolean;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToBottomIfPinned: () => void;
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
}: UseMessageScrollOptions): UseMessageScrollResult {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const lastUserScrollIntentAtRef = useRef(0);
  const visibleIndexRef = useRef<number | null>(null);
  const prevEntityIdRef = useRef<string | undefined>(undefined);

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

  const onScrollViewportScroll = useCallback(() => {
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

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
  }, [entityId, markRead, saveVisibleIndex, setIsAtBottom]);

  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom);
      if (atBottom && !wasAtBottom && entityId && markRead) {
        markRead(entityId);
      }
    },
    [entityId, setIsAtBottom, markRead],
  );

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

    const restoring = entityId != null && scrollCache.has(entityId);
    isAtBottomRef.current = !restoring;
    justSentRef.current = false;
    setIsAtBottom(!restoring);
    setShowScrollButton(restoring);
  }, [entityId, setIsAtBottom]);

  useEffect(() => {
    return () => {
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
    if (!isAtBottomRef.current) return;
    if (Date.now() - lastUserScrollIntentAtRef.current < USER_SCROLL_SUPPRESS_MS) return;
    requestAnimationFrame(() => {
      scrollToBottomImpl('auto');
    });
  }, [scrollToBottomImpl]);

  const maybeScrollToBottomAfterContentGrowth = useCallback(() => {
    if (!isAtBottomRef.current) return;
    if (Date.now() - lastUserScrollIntentAtRef.current < USER_SCROLL_SUPPRESS_MS) return;
    requestAnimationFrame(() => {
      scrollToBottomImpl('auto');
    });
  }, [scrollToBottomImpl]);

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
      if (!isAtBottomRef.current) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottomImpl('auto');
        });
      });
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [entityId, messageLayoutKey, scrollToBottomImpl]);

  useEffect(() => {
    const content = messagesContentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      maybeScrollToBottomAfterContentGrowth();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [entityId, maybeScrollToBottomAfterContentGrowth]);

  return {
    scrollViewportRef,
    messagesContentRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    scrollToBottom,
    scrollToBottomIfPinned,
    markJustSent,
    cachedScrollIndex,
    onScrollViewportScroll,
    onUserScrollIntent,
  };
}
