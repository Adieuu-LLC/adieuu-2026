/**
 * Conversation Scroll Hook — thin wrapper around the shared
 * {@link useMessageScroll} hook, preserving the original API surface.
 *
 * @module hooks/useConversationScroll
 */

import type { RefObject } from 'react';
import {
  useMessageScroll,
  clearMessageScrollCache,
  MESSAGE_AT_BOTTOM_THRESHOLD_PX,
  type UseMessageScrollResult,
} from './useMessageScroll';

export const CONVERSATION_AT_BOTTOM_THRESHOLD_PX = MESSAGE_AT_BOTTOM_THRESHOLD_PX;

export function clearConversationScrollCache(conversationId: string): void {
  clearMessageScrollCache(conversationId);
}

export interface UseConversationScrollOptions {
  conversationId: string | undefined;
  setIsAtBottom: (value: boolean) => void;
  markConversationRead: (conversationId: string) => void;
  messageLayoutKey?: string;
  historyAnchorActiveRef?: RefObject<boolean>;
}

export type UseConversationScrollResult = UseMessageScrollResult;

export function useConversationScroll({
  conversationId,
  setIsAtBottom,
  markConversationRead,
  messageLayoutKey,
  historyAnchorActiveRef,
}: UseConversationScrollOptions): UseConversationScrollResult {
  return useMessageScroll({
    entityId: conversationId,
    setIsAtBottom,
    markRead: markConversationRead,
    messageLayoutKey,
    historyAnchorActiveRef,
  });
}
