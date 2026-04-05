/**
 * Conversation Scroll Hook
 *
 * Centralises all auto-scroll behaviour for the Virtuoso chat list.
 *
 * Design goals (matching Discord / Slack semantics):
 *  - Sending a message always scrolls to the bottom, even when browsing history.
 *  - Receiving a message auto-scrolls only if the user is already at the bottom.
 *  - Composer resize (multi-line typing, attachments) keeps the bottom pinned.
 *  - A single mechanism (`followOutput`) drives auto-scroll, eliminating
 *    race conditions from competing `scrollToIndex` calls.
 *
 * @module hooks/useConversationScroll
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import type { VirtuosoHandle } from 'react-virtuoso';
import type { FollowOutputScalarType } from 'react-virtuoso';

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

  const [showScrollButton, setShowScrollButton] = useState(false);

  // Reset scroll state when switching conversations.
  useEffect(() => {
    isAtBottomRef.current = true;
    justSentRef.current = false;
    setIsAtBottom(true);
    setShowScrollButton(false);
  }, [conversationId, setIsAtBottom]);

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
  };
}
