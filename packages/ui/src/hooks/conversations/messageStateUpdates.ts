import {
  MAX_LOADED_MESSAGES,
  trimMessagesBuffer,
} from '../../pages/conversations/conversationScrollUtils';
import type { ConversationMessagesState, DisplayMessage } from './types';

/**
 * Applies the post-fetch merge for `fetchMessages` / `fetchMessagesAround` success paths.
 * Logic lifted verbatim from the prior `setMessagesState` updater in `useConversations`.
 */
export function applyFetchedMessagesToConversationState(
  prev: Record<string, ConversationMessagesState>,
  input: {
    conversationId: string;
    mergeLatest: boolean;
    newMessages: DisplayMessage[];
    direction?: 'older' | 'newer';
    /** API `cursor` (older pagination anchor). */
    cursor: string | null | undefined;
    hasNewerPagesFromApi: boolean | undefined;
    unreadCount: number;
    isAtBottom: boolean;
  }
): Record<string, ConversationMessagesState> {
  const {
    conversationId,
    mergeLatest,
    newMessages,
    direction,
    cursor,
    hasNewerPagesFromApi,
    unreadCount,
    isAtBottom,
  } = input;

  if (mergeLatest) {
    const existing = prev[conversationId]?.messages ?? [];
    const keepOlderCursor = prev[conversationId]?.olderCursor ?? null;
    const keepManualOlder = prev[conversationId]?.showManualLoadOlder ?? false;
    const keepManualNewer = prev[conversationId]?.showManualLoadNewer ?? false;
    const ids = new Set(existing.map((m) => m.id));
    const added = newMessages.filter((m) => !ids.has(m.id));
    if (added.length === 0) return prev;
    let messages = [...added, ...existing];
    if (messages.length > 0) {
      messages = trimMessagesBuffer(messages, isAtBottom, unreadCount);
    }
    return {
      ...prev,
      [conversationId]: {
        messages,
        olderCursor: keepOlderCursor,
        newerPaginationAfterId: messages[0]?.id ?? null,
        hasNewerPages: hasNewerPagesFromApi ?? false,
        loading: false,
        showManualLoadOlder: keepManualOlder,
        showManualLoadNewer: keepManualNewer,
      },
    };
  }

  const existing = prev[conversationId]?.messages ?? [];
  let merged: DisplayMessage[];
  if (direction === 'newer') {
    const ids = new Set(existing.map((m) => m.id));
    merged = [...newMessages.filter((m) => !ids.has(m.id)), ...existing];
  } else if (direction === 'older') {
    merged = [...existing, ...newMessages];
  } else {
    merged = newMessages;
  }
  const mergedLen = merged.length;
  let messages = merged;
  if (messages.length > 0) {
    messages = trimMessagesBuffer(messages, isAtBottom, unreadCount);
  }
  let hasNewerPages = hasNewerPagesFromApi ?? false;
  if (!isAtBottom && mergedLen > MAX_LOADED_MESSAGES) {
    hasNewerPages = true;
  }
  const keepManualOlder = prev[conversationId]?.showManualLoadOlder ?? false;
  const keepManualNewer = prev[conversationId]?.showManualLoadNewer ?? false;
  return {
    ...prev,
    [conversationId]: {
      messages,
      olderCursor: cursor ?? null,
      newerPaginationAfterId: messages[0]?.id ?? null,
      hasNewerPages,
      loading: false,
      showManualLoadOlder: keepManualOlder,
      showManualLoadNewer: keepManualNewer,
    },
  };
}
