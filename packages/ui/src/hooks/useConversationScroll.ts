/**
 * Conversation Scroll Hook
 *
 * Centralises all auto-scroll behaviour for the Virtuoso chat list.
 *
 * Design goals (matching Discord / Slack semantics):
 *  - Sending a message always scrolls to the bottom, even when browsing history.
 *  - Receiving a message auto-scrolls only if the user is within
 *    {@link CONVERSATION_AT_BOTTOM_THRESHOLD_PX} px of the bottom (Virtuoso
 *    `atBottomThreshold`; manual scroll is the signal we have).
 *  - Composer resize (multi-line typing, attachments) keeps the bottom pinned.
 *  - A single mechanism (`followOutput`) drives auto-scroll, eliminating
 *    race conditions from competing `scrollToIndex` calls.
 *  - Scroll position is remembered per conversation so switching back
 *    restores the user's previous reading position.
 *
 * @module hooks/useConversationScroll
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { FollowOutputScalarType } from 'react-virtuoso';

/**
 * Module-level cache of scroll positions keyed by conversation ID.
 * Stores the data-relative index of the first visible item.
 * Survives hook re-mounts (Virtuoso `key={id}` causes remount on switch).
 */
const scrollCache = new Map<string, number>();

/** Distance from the scroll bottom within which Virtuoso treats the list as "at bottom" for follow and read semantics. */
export const CONVERSATION_AT_BOTTOM_THRESHOLD_PX = 900;

export interface UseConversationScrollOptions {
  /** Conversation id – used only to reset refs on switch. */
  conversationId: string | undefined;
  /** Push the "at bottom" flag into the global conversations context. */
  setIsAtBottom: (value: boolean) => void;
  /** Mark conversation read when user scrolls to the bottom. */
  markConversationRead: (conversationId: string) => void;
}

export interface UseConversationScrollResult {
  virtuosoRef: React.RefObject<VirtuosoHandle>;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
  isAtBottomRef: React.RefObject<boolean>;
  showScrollButton: boolean;
  followOutput: (isAtBottom: boolean) => FollowOutputScalarType;
  handleAtBottomStateChange: (atBottom: boolean) => void;
  scrollToBottom: () => void;
  scrollToBottomIfPinned: () => void;
  markJustSent: () => void;
  /** Call from Virtuoso's rangeChanged with the data-relative first visible index. */
  saveVisibleIndex: (dataIndex: number) => void;
  /** Cached scroll index for the current conversation, or null (= go to bottom). */
  cachedScrollIndex: number | null;
  /** Virtuoso: when total list height changes (items, remeasure, viewport). */
  handleTotalListHeightChanged: () => void;
}

export function useConversationScroll({
  conversationId,
  setIsAtBottom,
  markConversationRead,
}: UseConversationScrollOptions): UseConversationScrollResult {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const justSentRef = useRef(false);
  const visibleIndexRef = useRef<number | null>(null);
  const prevConversationIdRef = useRef<string | undefined>(undefined);

  const [showScrollButton, setShowScrollButton] = useState(false);

  const cachedScrollIndex = conversationId != null
    ? (scrollCache.get(conversationId) ?? null)
    : null;

  const saveVisibleIndex = useCallback((dataIndex: number) => {
    visibleIndexRef.current = dataIndex;
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

  const followOutput = useCallback(
    (isAtBottom: boolean): FollowOutputScalarType => {
      if (justSentRef.current) {
        justSentRef.current = false;
        return 'smooth';
      }
      return isAtBottom ? 'smooth' : false;
    },
    [],
  );

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

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({
      index: 'LAST',
      behavior: 'smooth',
      align: 'end',
    });
  }, []);

  const scrollToBottomIfPinned = useCallback(() => {
    if (!isAtBottomRef.current) return;
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end' });
    });
  }, []);

  const handleTotalListHeightChanged = useCallback(() => {
    scrollToBottomIfPinned();
  }, [scrollToBottomIfPinned]);

  const markJustSent = useCallback(() => {
    justSentRef.current = true;
  }, []);

  // Compensate for composer resize: when the messages container shrinks or
  // grows (e.g. multi-line input, attachment thumbnails) and the user was
  // at the bottom, re-pin to the bottom so messages aren't hidden.
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    let prevHeight = el.clientHeight;

    const observer = new ResizeObserver(() => {
      const newHeight = el.clientHeight;
      if (newHeight !== prevHeight && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end' });
        });
      }
      prevHeight = newHeight;
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [conversationId]);

  return {
    virtuosoRef,
    messagesContainerRef,
    isAtBottomRef,
    showScrollButton,
    followOutput,
    handleAtBottomStateChange,
    scrollToBottom,
    scrollToBottomIfPinned,
    markJustSent,
    saveVisibleIndex,
    cachedScrollIndex,
    handleTotalListHeightChanged,
  };
}
