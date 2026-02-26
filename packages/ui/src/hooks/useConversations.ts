/**
 * Hook for managing conversations.
 * Fetches real DM conversations from the API.
 */

import type { Conversation } from '@adieuu/shared';
import { useDmConversationsList } from './useDmConversationsList';

export interface UseConversationsListOptions {
  /** Number of conversations per page (default: 50) */
  limit?: number;
  /** Whether to fetch immediately (default: true) */
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
}

/**
 * Hook for fetching conversations list.
 * Fetches real DM conversations from the API.
 */
export function useConversationsList({
  immediate = true,
}: UseConversationsListOptions = {}): UseConversationsListResult {
  const {
    unifiedConversations,
    isLoading,
    error,
    refresh,
  } = useDmConversationsList({ immediate });

  return {
    conversations: unifiedConversations,
    isLoading,
    error,
    refresh,
  };
}
