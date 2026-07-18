import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PublicSpaceMessage } from '@adieuu/shared';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';

const FLASH_HIGHLIGHT_MS = 2800;
const REPLY_JUMP_CONTEXT_BEFORE = 25;
const REPLY_JUMP_CONTEXT_AFTER = 25;

/**
 * Scroll-to-message + flash highlight for pin and reply-quote jumps.
 * Handles in-buffer scrolls, around-fetch for out-of-buffer targets, and
 * retry on flatItems update.
 */
export function useSpaceChannelScrollToMessage(params: {
  channelId: string | undefined;
  activeMessages: PublicSpaceMessage[];
  activeMessagesLoading: boolean;
  flatItems: ChannelListItem<ChannelMessage>[];
  fetchMessagesAround: (
    messageId: string,
    opts: { before: number; after: number },
  ) => Promise<unknown[] | null>;
}) {
  const { channelId, activeMessages, activeMessagesLoading, flatItems, fetchMessagesAround } = params;

  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  const scrollViewportRefStable = useRef<HTMLDivElement | null>(null);
  const pendingScrollToRef = useRef<string | null>(null);
  const replyAroundFetchPendingRef = useRef(false);

  const activeMessagesRef = useRef<PublicSpaceMessage[]>(activeMessages);
  activeMessagesRef.current = activeMessages;

  const escapeMessageIdSelector = useCallback((messageId: string) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(messageId);
    }
    return messageId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }, []);

  const flashMessageHighlight = useCallback((messageId: string) => {
    setFlashingMessageId(messageId);
    setTimeout(
      () => setFlashingMessageId((prev) => (prev === messageId ? null : prev)),
      FLASH_HIGHLIGHT_MS,
    );
  }, []);

  const scrollToMessageId = useCallback(
    (messageId: string) => {
      const escaped = escapeMessageIdSelector(messageId);
      const el = scrollViewportRefStable.current?.querySelector(`[data-message-id="${escaped}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flashMessageHighlight(messageId);
        return;
      }
      pendingScrollToRef.current = messageId;
      const haveInBuffer = activeMessagesRef.current.some((m) => m.id === messageId);
      if (!haveInBuffer) {
        replyAroundFetchPendingRef.current = true;
        void fetchMessagesAround(messageId, {
          before: REPLY_JUMP_CONTEXT_BEFORE,
          after: REPLY_JUMP_CONTEXT_AFTER,
        }).then((messages) => {
          replyAroundFetchPendingRef.current = false;
          if (messages == null) pendingScrollToRef.current = null;
        });
      }
    },
    [escapeMessageIdSelector, flashMessageHighlight, fetchMessagesAround],
  );

  // Retry a pending reply/pin jump once the around-fetch merges into flatItems.
  useLayoutEffect(() => {
    const pendingId = pendingScrollToRef.current;
    if (!pendingId) return;
    const found = flatItems.some(
      (item) => item.type === 'message' && item.msg.id === pendingId,
    );
    if (found) {
      const escaped = escapeMessageIdSelector(pendingId);
      scrollViewportRefStable.current
        ?.querySelector(`[data-message-id="${escaped}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'auto' });
      pendingScrollToRef.current = null;
      replyAroundFetchPendingRef.current = false;
      flashMessageHighlight(pendingId);
      return;
    }
    if (activeMessagesLoading || replyAroundFetchPendingRef.current) return;
    pendingScrollToRef.current = null;
  }, [flatItems, activeMessagesLoading, escapeMessageIdSelector, flashMessageHighlight]);

  // Cancel any in-flight jump when switching channels.
  useEffect(() => {
    pendingScrollToRef.current = null;
    replyAroundFetchPendingRef.current = false;
  }, [channelId]);

  return {
    flashingMessageId,
    scrollToMessageId,
    scrollViewportRefStable,
    pendingScrollToRef,
  };
}
