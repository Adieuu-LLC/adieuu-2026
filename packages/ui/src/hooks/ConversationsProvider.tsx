/**
 * Shared conversations state provider.
 *
 * Provides a single source of truth for the conversations list, preventing
 * duplicate state between the sidebar and conversation pages. Subscribes
 * to real-time dm:new events to keep the list updated, and provides
 * an optimistic markConversationRead to clear unread indicators immediately.
 *
 * Designed for extensibility to group conversations and spaces.
 */

import { createContext, useContext, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Conversation, CryptoProfile } from '@adieuu/shared';
import {
  useDmConversationsList,
  type DmConversationWithParticipant,
} from './useDmConversationsList';
import { useDmSubscription, type DmNewMessageEvent, type DmDeletedEvent } from './useDmSubscription';
import { useMarkAsRead } from './useMarkAsRead';

export interface ConversationsContextValue {
  /** DM conversations with full participant info */
  dmConversations: DmConversationWithParticipant[];
  /** Unified conversation list (for components that use the generic Conversation type) */
  conversations: Conversation[];
  /** Whether the initial load is in progress */
  isLoading: boolean;
  /** Error from the last fetch */
  error: string | null;
  /** Full refresh from the API */
  refresh: () => Promise<void>;
  /**
   * Mark a conversation as read. Optimistically clears the unread indicator
   * and sends the encrypted read state to the API in the background.
   */
  markConversationRead: (
    conversationId: string,
    lastReadMessageId: string,
    cryptoProfile?: CryptoProfile
  ) => void;
}

export interface ConversationsProviderProps {
  children: ReactNode;
}

const ConversationsContext = createContext<ConversationsContextValue | null>(null);

/**
 * Hook to access the shared conversations state.
 * Must be used within a ConversationsProvider.
 */
export function useConversationsContext(): ConversationsContextValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversationsContext must be used within a ConversationsProvider');
  }
  return ctx;
}

/**
 * Provides shared conversations state for the entire authenticated layout.
 * Must be nested inside ChatConnectionProvider (needs WebSocket for real-time updates).
 */
export function ConversationsProvider({ children }: ConversationsProviderProps) {
  const {
    conversations: dmConversations,
    unifiedConversations,
    isLoading,
    error,
    refresh,
    markRead,
    bumpLatestMessage,
  } = useDmConversationsList();

  const { markAsRead } = useMarkAsRead();
  const dmConversationsRef = useRef(dmConversations);
  dmConversationsRef.current = dmConversations;

  // Global subscription for dm:new events (updates list for ALL conversations)
  useDmSubscription({
    onNewMessage: useCallback(
      (event: DmNewMessageEvent) => {
        const { message } = event.payload;
        const exists = dmConversationsRef.current.some(
          (c) => c.conversationId === message.conversationId
        );

        if (exists) {
          bumpLatestMessage(message.conversationId, message.id, message.createdAt);
        } else {
          refresh();
        }
      },
      [bumpLatestMessage, refresh]
    ),
    onDeleted: useCallback((_event: DmDeletedEvent) => {
      refresh();
    }, [refresh]),
    onReconnect: useCallback(() => {
      refresh();
    }, [refresh]),
  });

  const markConversationRead = useCallback(
    (
      conversationId: string,
      lastReadMessageId: string,
      cryptoProfile: CryptoProfile = 'default'
    ) => {
      markRead(conversationId, lastReadMessageId);
      markAsRead(conversationId, lastReadMessageId, cryptoProfile);
    },
    [markRead, markAsRead]
  );

  const value = useMemo<ConversationsContextValue>(
    () => ({
      dmConversations,
      conversations: unifiedConversations,
      isLoading,
      error,
      refresh,
      markConversationRead,
    }),
    [dmConversations, unifiedConversations, isLoading, error, refresh, markConversationRead]
  );

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}
