import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { SetURLSearchParams } from 'react-router-dom';
import type { DisplayMessage } from '../useConversations';
import type { DecryptedConversation } from './types';
import { clearConversationScrollCache } from '../useConversationScroll';
import {
  applyHistoryScrollAnchor,
  applyDistanceFromBottom,
  readDistanceFromBottom,
  REPLY_JUMP_CONTEXT_AFTER,
  REPLY_JUMP_CONTEXT_BEFORE,
  type HistoryScrollAnchor,
} from '../../pages/conversations/conversationScrollUtils';
import type { ChatItem } from '../../pages/conversations/conversationUtils';

const FLASH_HIGHLIGHT_MS = 2800;

export function useConversationScrollOrchestration(params: {
  conversationId: string | undefined;
  activeConversationId: string | null;
  messageLayoutKey: string;
  flatItems: ChatItem[];
  messagesLoading: boolean;
  activeMessages: DisplayMessage[];
  conversation: DecryptedConversation | undefined;
  activeMessagesOlderCursor: string | null | undefined;
  activeMessagesHasNewerPages: boolean;
  loadOlder: () => void | Promise<unknown>;
  loadNewer: () => void | Promise<unknown>;
  jumpToLatestMessages: (id: string) => Promise<unknown>;
  scrollViewportRef: RefObject<HTMLDivElement | null>;
  messagesContentRef: RefObject<HTMLDivElement | null>;
  isAtBottomRef: RefObject<boolean>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  setIsAtBottom: (v: boolean) => void;
  cachedScrollIndex: number | null;
  fetchMessagesAround: (
    conversationId: string,
    messageId: string,
    context: { before: number; after: number },
  ) => Promise<DisplayMessage[] | null>;
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  openSettings: () => void;
  setFlashingMessageId: Dispatch<SetStateAction<string | null>>;
  activeMessagesRef: MutableRefObject<DisplayMessage[]>;
}) {
  const {
    conversationId: id,
    activeConversationId,
    messageLayoutKey,
    flatItems,
    messagesLoading,
    activeMessages,
    conversation,
    activeMessagesOlderCursor,
    activeMessagesHasNewerPages,
    loadOlder,
    loadNewer,
    jumpToLatestMessages,
    scrollViewportRef,
    messagesContentRef,
    isAtBottomRef,
    scrollToBottom,
    setIsAtBottom,
    cachedScrollIndex,
    fetchMessagesAround,
    searchParams,
    setSearchParams,
    openSettings,
    setFlashingMessageId,
    activeMessagesRef,
  } = params;

  const historyScrollAnchorRef = useRef<{ anchorKey: string; targetViewportOffsetPx: number } | null>(null);
  const pendingScrollToRef = useRef<string | null>(null);
  const replyAroundFetchPendingRef = useRef(false);
  const urlMessageIdOnConversationEntryRef = useRef<string | null>(null);
  const prevIdForUrlCaptureRef = useRef<string | undefined>(undefined);
  const initialOpenBottomSnapDoneRef = useRef(false);

  useEffect(() => {
    if (prevIdForUrlCaptureRef.current !== id) {
      prevIdForUrlCaptureRef.current = id;
      urlMessageIdOnConversationEntryRef.current = searchParams.get('messageId');
    }
  }, [id, searchParams]);

  const handleReachOlder = useCallback(() => {
    if (pendingScrollToRef.current) return;
    if (!activeMessagesOlderCursor || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (vp && content) {
      const vRect = vp.getBoundingClientRect();
      for (let i = 0; i < content.children.length; i++) {
        const el = content.children[i] as HTMLElement;
        const key = el.dataset.scrollAnchorKey;
        if (!key) continue;
        const cr = el.getBoundingClientRect();
        if (cr.bottom > vRect.top + 1) {
          historyScrollAnchorRef.current = {
            anchorKey: key,
            targetViewportOffsetPx: cr.top - vRect.top,
          };
          break;
        }
      }
    }
    void loadOlder();
  }, [activeMessagesOlderCursor, messagesLoading, loadOlder, scrollViewportRef, messagesContentRef]);

  const handleReachNewer = useCallback(() => {
    if (pendingScrollToRef.current) return;
    if (!activeMessagesHasNewerPages || messagesLoading) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    const distBefore = vp ? readDistanceFromBottom(vp) : 0;
    let anchor: HistoryScrollAnchor | null = null;
    if (vp && content) {
      const headId = activeMessages[0]?.id;
      if (headId) {
        const vRect = vp.getBoundingClientRect();
        const escaped =
          typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
            ? CSS.escape(headId)
            : headId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const row = content.querySelector(`[data-scroll-anchor-key="${escaped}"]`);
        if (row) {
          const cr = row.getBoundingClientRect();
          anchor = { anchorKey: headId, targetViewportOffsetPx: cr.top - vRect.top };
        }
      }
    }
    void Promise.resolve(loadNewer()).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
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
    activeMessages,
    activeMessagesHasNewerPages,
    messagesLoading,
    loadNewer,
    scrollViewportRef,
    messagesContentRef,
  ]);

  const handleJumpToLatest = useCallback(async () => {
    if (!id) return;
    const lastId = conversation?.lastMessageId;
    const headId = activeMessages[0]?.id;
    if (
      !messagesLoading &&
      activeMessages.length > 0 &&
      !activeMessagesHasNewerPages &&
      lastId &&
      headId === lastId
    ) {
      clearConversationScrollCache(id);
      historyScrollAnchorRef.current = null;
      setIsAtBottom(true);
      scrollToBottom('smooth');
      return;
    }
    clearConversationScrollCache(id);
    historyScrollAnchorRef.current = null;
    setIsAtBottom(true);
    await jumpToLatestMessages(id);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });
  }, [
    id,
    conversation?.lastMessageId,
    activeMessages,
    messagesLoading,
    activeMessagesHasNewerPages,
    jumpToLatestMessages,
    scrollToBottom,
    setIsAtBottom,
  ]);

  useLayoutEffect(() => {
    if (messagesLoading) return;
    const anchor = historyScrollAnchorRef.current;
    if (!anchor) return;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return;

    const run = () => {
      const a = historyScrollAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') historyScrollAnchorRef.current = null;
    };
    run();
    requestAnimationFrame(run);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [messagesLoading, flatItems.length, id, scrollViewportRef, messagesContentRef]);

  useEffect(() => {
    if (messagesLoading) return undefined;
    if (!historyScrollAnchorRef.current) return undefined;
    const vp = scrollViewportRef.current;
    const content = messagesContentRef.current;
    if (!vp || !content) return undefined;

    let consecutiveAligned = 0;
    const tick = () => {
      const a = historyScrollAnchorRef.current;
      if (!a) return;
      const r = applyHistoryScrollAnchor(vp, content, a);
      if (r === 'missing') {
        historyScrollAnchorRef.current = null;
        return;
      }
      if (r === 'aligned') {
        consecutiveAligned += 1;
        if (consecutiveAligned >= 2) historyScrollAnchorRef.current = null;
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
      historyScrollAnchorRef.current = null;
      ro.disconnect();
    }, 2800);

    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [messagesLoading, flatItems.length, id, scrollViewportRef, messagesContentRef]);

  useLayoutEffect(() => {
    if (!id) return;
    if (activeConversationId !== id) return;
    const vp = scrollViewportRef.current;
    if (!vp) return;
    if (!isAtBottomRef.current) return;
    vp.scrollTop = vp.scrollHeight - vp.clientHeight;
  }, [messageLayoutKey, id, activeConversationId, isAtBottomRef, scrollViewportRef]);

  useLayoutEffect(() => {
    if (!id || cachedScrollIndex != null) return;
    if (activeConversationId !== id) return;
    if (flatItems.length === 0 || messagesLoading) return;
    if (pendingScrollToRef.current) return;
    if (urlMessageIdOnConversationEntryRef.current) return;
    if (initialOpenBottomSnapDoneRef.current) return;
    initialOpenBottomSnapDoneRef.current = true;
    const run = () => {
      scrollToBottom('auto');
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [id, activeConversationId, cachedScrollIndex, flatItems.length, messagesLoading, scrollToBottom]);

  const flashMessageHighlight = useCallback((targetId: string) => {
    setFlashingMessageId(targetId);
    window.setTimeout(() => {
      setFlashingMessageId((prev) => (prev === targetId ? null : prev));
    }, FLASH_HIGHLIGHT_MS);
  }, [setFlashingMessageId]);

  const scrollToMessageId = useCallback(
    (targetId: string) => {
      const vp = scrollViewportRef.current;
      const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(targetId) : targetId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const el = vp?.querySelector(`[data-message-id="${escaped}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.setTimeout(() => flashMessageHighlight(targetId), 350);
        return;
      }
      pendingScrollToRef.current = targetId;
      const haveInBuffer = activeMessagesRef.current.some((m) => m.id === targetId);
      if (!haveInBuffer && id) {
        clearConversationScrollCache(id);
        setIsAtBottom(false);
        replyAroundFetchPendingRef.current = true;
        void fetchMessagesAround(id, targetId, {
          before: REPLY_JUMP_CONTEXT_BEFORE,
          after: REPLY_JUMP_CONTEXT_AFTER,
        }).then((messages) => {
          replyAroundFetchPendingRef.current = false;
          if (messages == null) pendingScrollToRef.current = null;
        });
      }
    },
    [flashMessageHighlight, id, fetchMessagesAround, setIsAtBottom, scrollViewportRef, activeMessagesRef]
  );

  useLayoutEffect(() => {
    if (!pendingScrollToRef.current) return;
    const pendingId = pendingScrollToRef.current;
    const idx = flatItems.findIndex((i) => i.type === 'message' && i.msg.id === pendingId);
    if (idx >= 0) {
      const vp = scrollViewportRef.current;
      const escaped =
        typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
          ? CSS.escape(pendingId)
          : pendingId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      vp?.querySelector(`[data-message-id="${escaped}"]`)?.scrollIntoView({
        block: 'center',
        behavior: 'auto',
      });
      pendingScrollToRef.current = null;
      replyAroundFetchPendingRef.current = false;
      window.setTimeout(() => flashMessageHighlight(pendingId), 350);
      return;
    }
    if (messagesLoading || replyAroundFetchPendingRef.current) return;
    pendingScrollToRef.current = null;
  }, [flatItems, messagesLoading, flashMessageHighlight, scrollViewportRef]);

  const deepLinkMessageId = searchParams.get('messageId');
  useEffect(() => {
    if (!deepLinkMessageId || !id) return;
    scrollToMessageId(deepLinkMessageId);
    setSearchParams((prev) => { prev.delete('messageId'); return prev; }, { replace: true });
  }, [deepLinkMessageId, id, scrollToMessageId, setSearchParams]);

  useEffect(() => {
    if (searchParams.get('showSettings') === 'true' && id) {
      openSettings();
      setSearchParams((prev) => { prev.delete('showSettings'); return prev; }, { replace: true });
    }
  }, [searchParams, id, setSearchParams, openSettings]);

  const resetScrollRefsOnConversationIdChange = useCallback(() => {
    pendingScrollToRef.current = null;
    replyAroundFetchPendingRef.current = false;
    initialOpenBottomSnapDoneRef.current = false;
    historyScrollAnchorRef.current = null;
  }, []);

  return {
    handleReachOlder,
    handleReachNewer,
    handleJumpToLatest,
    scrollToMessageId,
    resetScrollRefsOnConversationIdChange,
  };
}
