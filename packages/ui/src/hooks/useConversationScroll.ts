/**
 * Conversation Scroll Hook
 *
 * Centralises auto-scroll behaviour for the non-virtualized chat list.
 *
 * Design goals (matching Discord / Slack semantics):
 *  - Sending a message always scrolls to the bottom, even when browsing history.
 *  - Receiving a message auto-scrolls only if the user is within
 *    {@link CONVERSATION_AT_BOTTOM_THRESHOLD_PX} px of the bottom.
 *  - Composer resize (multi-line typing, attachments) keeps the bottom pinned.
 *  - Scroll position is remembered per conversation so switching back
 *    restores the user's previous reading position.
 *
 * @module hooks/useConversationScroll
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { computeIsAtBottom } from '../pages/conversations/conversationScrollUtils';

/**
 * Module-level cache of scroll positions keyed by conversation ID.
 * Stores the data-relative index of the first visible item.
 */
const scrollCache = new Map<string, number>();

export function clearConversationScrollCache(conversationId: string): void {
  scrollCache.delete(conversationId);
}

/** Distance from the scroll bottom within which we treat the list as "at bottom" for follow and read semantics. */
export const CONVERSATION_AT_BOTTOM_THRESHOLD_PX = 900;

/** After this many ms without intentional scroll-up, content growth can re-pin the bottom. */
const USER_SCROLL_SUPPRESS_MS = 200;

export interface UseConversationScrollOptions {
  conversationId: string | undefined;
  setIsAtBottom: (value: boolean) => void;
  markConversationRead: (conversationId: string) => void;
  /** Bumps when the message list changes so post-send scroll runs after the new row exists. */
  messageLayoutKey?: string;
}

export interface UseConversationScrollResult {
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

export function useConversationScroll({
  conversationId,
  setIsAtBottom,
  markConversationRead,
  messageLayoutKey,
}: UseConversationScrollOptions): UseConversationScrollResult {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const messagesContentRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const lastUserScrollIntentAtRef = useRef(0);
  const visibleIndexRef = useRef<number | null>(null);
  const prevConversationIdRef = useRef<string | undefined>(undefined);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const cachedScrollIndex = conversationId != null
    ? (scrollCache.get(conversationId) ?? null)
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
      CONVERSATION_AT_BOTTOM_THRESHOLD_PX,
    );
    const wasAtBottom = isAtBottomRef.current;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
    if (atBottom && !wasAtBottom && conversationId) {
      markConversationRead(conversationId);
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
  }, [conversationId, markConversationRead, saveVisibleIndex, setIsAtBottom]);

  const handleAtBottomStateChange = useCallback(
    (atBottom: boolean) => {
      const wasAtBottom = isAtBottomRef.current;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom);
      if (atBottom && !wasAtBottom && conversationId) {
        markConversationRead(conversationId);
      }
    },
    [conversationId, setIsAtBottom, markConversationRead],
  );

  const onUserScrollIntent = useCallback(() => {
    lastUserScrollIntentAtRef.current = Date.now();
  }, []);

  // Save scroll position for the outgoing conversation, then reset for the incoming one.
  useEffect(() => {
    const prevId = prevConversationIdRef.current;
    prevConversationIdRef.current = conversationId;

    if (prevId && prevId !== conversationId) {
      if (isAtBottomRef.current) {
        scrollCache.delete(prevId);
      } else if (visibleIndexRef.current != null) {
        scrollCache.set(prevId, visibleIndexRef.current);
      }
    }

    visibleIndexRef.current = null;

    const restoring = conversationId != null && scrollCache.has(conversationId);
    isAtBottomRef.current = !restoring;
    justSentRef.current = false;
    setIsAtBottom(!restoring);
    setShowScrollButton(restoring);
  }, [conversationId, setIsAtBottom]);

  // Save scroll position on unmount (e.g. navigating away from conversations).
  useEffect(() => {
    return () => {
      const cid = prevConversationIdRef.current;
      if (!cid) return;
      if (isAtBottomRef.current) {
        scrollCache.delete(cid);
      } else if (visibleIndexRef.current != null) {
        scrollCache.set(cid, visibleIndexRef.current);
      }
    };
  }, []);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      scrollToBottomImpl(behavior);
      requestAnimationFrame(() => {
        handleAtBottomStateChange(true);
      });
    },
    [scrollToBottomImpl, handleAtBottomStateChange],
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

  // Composer resize: when the messages viewport shrinks or grows and the user was at the bottom.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    let prevHeight = el.clientHeight;

    const observer = new ResizeObserver(() => {
      const newHeight = el.clientHeight;
      if (newHeight !== prevHeight && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          scrollToBottomImpl('auto');
        });
      }
      prevHeight = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [conversationId, scrollToBottomImpl]);

  // Row content growth (reactions, GIFs, reply preview): keep bottom in view when pinned.
  useEffect(() => {
    const content = messagesContentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      maybeScrollToBottomAfterContentGrowth();
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [conversationId, maybeScrollToBottomAfterContentGrowth]);

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
