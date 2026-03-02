/**
 * Hook for consuming the shared conversations list.
 *
 * Thin wrapper around ConversationsProvider context, returning the unified
 * Conversation[] interface used by sidebar and conversation page components.
 */

import type { Conversation, CryptoProfile } from '@adieuu/shared';
import { useConversationsContext } from './ConversationsProvider';

export interface UseConversationsListOptions {
  /** @deprecated No longer used; kept for API compatibility */
  limit?: number;
  /** @deprecated No longer used; kept for API compatibility */
  immediate?: boolean;
}

export interface UseConversationsListResult {
  /** List of conversations sorted by recency */
  conversations: Conversation[];
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Refresh the list */
  refresh: () => Promise<void>;
  /** Mark a conversation as read (optimistic + API call) */
  markConversationRead: (
    conversationId: string,
    lastReadMessageId: string,
    cryptoProfile?: CryptoProfile
  ) => void;
}

/**
 * Hook for accessing the shared conversations list.
 * Must be used within a ConversationsProvider.
 */
export function useConversationsList(
  _options?: UseConversationsListOptions
): UseConversationsListResult {
  const { conversations, isLoading, error, refresh, markConversationRead } =
    useConversationsContext();

  return {
    conversations,
    isLoading,
    error,
    refresh,
    markConversationRead,
  };
}
