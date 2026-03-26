/**
 * Hook for fetching DM conversations with unread status.
 *
 * Fetches conversations from the API, decrypts read state, and computes
 * unread indicators. Integrates with participant cache for efficient
 * participant info retrieval.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  createApiClient,
  type DmConversationListItem,
  type Conversation,
  type PublicIdentity,
} from '@adieuu/shared';
import { deriveParticipantHash } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  decryptLastReadId,
  hasUnreadMessages,
} from '../services/readStateService';

/**
 * Extended DM conversation with decrypted data.
 */
export interface DmConversationWithParticipant {
  /** The blinded conversation ID */
  conversationId: string;
  /** Active crypto profile */
  cryptoProfile: 'default' | 'cnsa2';
  /** The other participant's identity (fetched from API/cache) */
  otherParticipant: PublicIdentity | null;
  /** Whether there are unread messages */
  hasUnread: boolean;
  /** Last message timestamp */
  lastMessageAt: string | null;
  /** Last message ID */
  lastMessageId: string | null;
  /** Decrypted last read message ID (null if never read) */
  lastReadMessageId: string | null;
}

export interface UseDmConversationsListOptions {
  /** Whether to fetch immediately (default: true) */
  immediate?: boolean;
}

export interface UseDmConversationsListResult {
  /** List of DM conversations with participant info */
  conversations: DmConversationWithParticipant[];
  /** Conversations mapped to unified Conversation interface */
  unifiedConversations: Conversation[];
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Refresh the list */
  refresh: () => Promise<void>;
  /** Optimistically mark a conversation as read in local state */
  markRead: (conversationId: string, lastReadMessageId: string) => void;
  /** Update a conversation's latest message and re-sort. Returns false if conversation not found. */
  bumpLatestMessage: (conversationId: string, lastMessageId: string, lastMessageAt: string) => void;
}

/**
 * Hook for fetching DM conversations list with unread status.
 */
export function useDmConversationsList({
  immediate = true,
}: UseDmConversationsListOptions = {}): UseDmConversationsListResult {
  const { apiBaseUrl } = useAppConfig();
  const { status, identity } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [conversations, setConversations] = useState<DmConversationWithParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = status === 'logged_in' && identity !== null;

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !identity) {
      setConversations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.dm.getConversations();

      if (!response.success || !response.data) {
        setError(response.error?.message ?? 'Failed to load conversations');
        return;
      }

      const rawConversations = response.data.conversations;
      const processedConversations: DmConversationWithParticipant[] = [];

      for (const conv of rawConversations) {
        let otherParticipant: PublicIdentity | null = null;
        let lastReadMessageId: string | null = null;

        // Compute our participant hash to find our read state entry
        const myParticipantHash = deriveParticipantHash(identity.id, conv.conversationId);
        const myReadState = conv.readState.find((r) => r.participantHash === myParticipantHash);
        if (myReadState) {
          try {
            lastReadMessageId = decryptLastReadId(
              conv.conversationId,
              myReadState.encryptedLastReadId,
              conv.activeCryptoProfile
            );
          } catch {
            lastReadMessageId = null;
          }
        }

        // Resolve the other participant from the participants list
        const otherIdentityId = (conv.participants ?? []).find((p) => p !== identity.id);
        if (otherIdentityId) {
          try {
            const participantResponse = await api.identity.getById(otherIdentityId);
            if (participantResponse.success && participantResponse.data) {
              otherParticipant = participantResponse.data;
            }
          } catch {
            // Non-critical: participant will display as unknown
          }
        }

        const hasUnread = hasUnreadMessages(conv.lastMessageId, lastReadMessageId);

        processedConversations.push({
          conversationId: conv.conversationId,
          cryptoProfile: conv.activeCryptoProfile,
          otherParticipant,
          hasUnread,
          lastMessageAt: conv.lastMessageAt,
          lastMessageId: conv.lastMessageId,
          lastReadMessageId,
        });
      }

      // Sort by last message time (most recent first)
      processedConversations.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      });

      setConversations(processedConversations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, [api, identity, isLoggedIn]);

  // Initial fetch
  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  // Clear when logged out
  useEffect(() => {
    if (!isLoggedIn) {
      setConversations([]);
    }
  }, [isLoggedIn]);

  const markRead = useCallback((conversationId: string, lastReadMessageId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.conversationId === conversationId
          ? {
              ...c,
              lastReadMessageId,
              hasUnread: hasUnreadMessages(c.lastMessageId, lastReadMessageId),
            }
          : c
      )
    );
  }, []);

  const bumpLatestMessage = useCallback(
    (conversationId: string, lastMessageId: string, lastMessageAt: string) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === conversationId);
        if (idx === -1) return prev;

        const updated = [...prev];
        updated[idx] = {
          ...updated[idx]!,
          lastMessageId,
          lastMessageAt,
          hasUnread: hasUnreadMessages(lastMessageId, updated[idx]!.lastReadMessageId),
        };

        updated.sort((a, b) => {
          if (!a.lastMessageAt && !b.lastMessageAt) return 0;
          if (!a.lastMessageAt) return 1;
          if (!b.lastMessageAt) return -1;
          return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
        });

        return updated;
      });
    },
    []
  );

  // Map to unified Conversation interface for UI compatibility
  const unifiedConversations = useMemo((): Conversation[] => {
    return conversations.map((conv) => ({
      id: conv.conversationId,
      type: 'direct' as const,
      members: conv.otherParticipant
        ? [
            {
              identity: conv.otherParticipant,
              joinedAt: conv.lastMessageAt ?? new Date().toISOString(),
            },
          ]
        : [],
      lastMessageAt: conv.lastMessageAt ?? new Date().toISOString(),
      unreadCount: conv.hasUnread ? 1 : 0,
      createdAt: conv.lastMessageAt ?? new Date().toISOString(),
    }));
  }, [conversations]);

  return {
    conversations,
    unifiedConversations,
    isLoading,
    error,
    refresh,
    markRead,
    bumpLatestMessage,
  };
}
