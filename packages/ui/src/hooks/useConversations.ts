/**
 * Hook for managing conversations.
 * Currently returns mock data - will be connected to WebSocket backend later.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Conversation, PublicIdentity } from '@adieuu/shared';
import { useIdentity } from './useIdentity';

// Mock identity data for testing
const mockIdentities: PublicIdentity[] = [
  {
    id: 'mock-id-1',
    username: 'alice',
    displayName: 'Alice Chen',
    bio: 'Privacy advocate and tech enthusiast.',
    createdAt: '2025-01-15T10:00:00Z',
    lastActiveAt: '2026-02-23T09:00:00Z',
    isDeleted: false,
  },
  {
    id: 'mock-id-2',
    username: 'bob_smith',
    displayName: 'Bob Smith',
    bio: 'Software engineer. Coffee lover.',
    createdAt: '2025-02-01T14:30:00Z',
    lastActiveAt: '2026-02-23T08:30:00Z',
    isDeleted: false,
  },
  {
    id: 'mock-id-3',
    username: 'carol_dev',
    displayName: 'Carol Martinez',
    bio: 'Full-stack developer.',
    createdAt: '2025-03-10T09:15:00Z',
    lastActiveAt: '2026-02-22T22:00:00Z',
    isDeleted: false,
  },
  {
    id: 'mock-id-4',
    username: 'dave_secure',
    displayName: 'Dave Johnson',
    bio: 'Security researcher.',
    createdAt: '2025-04-05T16:45:00Z',
    lastActiveAt: '2026-02-23T07:15:00Z',
    isDeleted: false,
  },
  {
    id: 'mock-id-5',
    username: 'eve_crypto',
    displayName: 'Eve Williams',
    bio: 'Cryptography enthusiast.',
    createdAt: '2025-05-20T11:20:00Z',
    lastActiveAt: '2026-02-21T18:30:00Z',
    isDeleted: false,
  },
];

// Generate mock conversations
function generateMockConversations(): Conversation[] {
  const now = new Date();

  return [
    {
      id: 'conv-1',
      type: 'direct',
      members: [
        { identity: mockIdentities[0]!, joinedAt: '2025-06-01T10:00:00Z' },
      ],
      lastMessageAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      unreadCount: 3,
      createdAt: '2025-06-01T10:00:00Z',
    },
    {
      id: 'conv-2',
      type: 'group',
      members: [
        { identity: mockIdentities[1]!, joinedAt: '2025-07-15T14:00:00Z' },
        { identity: mockIdentities[2]!, joinedAt: '2025-07-15T14:00:00Z' },
        { identity: mockIdentities[3]!, joinedAt: '2025-07-16T09:00:00Z' },
      ],
      customTitle: 'Project Alpha',
      lastMessageAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      unreadCount: 0,
      createdAt: '2025-07-15T14:00:00Z',
    },
    {
      id: 'conv-3',
      type: 'direct',
      members: [
        { identity: mockIdentities[4]!, joinedAt: '2025-08-10T16:30:00Z' },
      ],
      lastMessageAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      unreadCount: 1,
      createdAt: '2025-08-10T16:30:00Z',
    },
    {
      id: 'conv-4',
      type: 'group',
      members: [
        { identity: mockIdentities[0]!, joinedAt: '2025-09-01T11:00:00Z' },
        { identity: mockIdentities[1]!, joinedAt: '2025-09-01T11:00:00Z' },
        { identity: mockIdentities[2]!, joinedAt: '2025-09-02T08:00:00Z' },
        { identity: mockIdentities[3]!, joinedAt: '2025-09-03T15:00:00Z' },
        { identity: mockIdentities[4]!, joinedAt: '2025-09-05T10:00:00Z' },
      ],
      lastMessageAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      unreadCount: 12,
      createdAt: '2025-09-01T11:00:00Z',
    },
    {
      id: 'conv-5',
      type: 'direct',
      members: [
        { identity: mockIdentities[2]!, joinedAt: '2025-10-15T09:00:00Z' },
      ],
      lastMessageAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      unreadCount: 0,
      createdAt: '2025-10-15T09:00:00Z',
    },
  ];
}

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
 * Currently returns mock data - will connect to WebSocket backend later.
 */
export function useConversationsList({
  limit = 50,
  immediate = true,
}: UseConversationsListOptions = {}): UseConversationsListResult {
  const { status: identityStatus } = useIdentity();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setConversations([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Simulate API delay
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Get mock conversations sorted by lastMessageAt (most recent first)
      const mockData = generateMockConversations()
        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
        .slice(0, limit);

      setConversations(mockData);
    } catch {
      setError('Failed to load conversations');
    } finally {
      setIsLoading(false);
    }
  }, [isLoggedIn, limit]);

  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  // Clear conversations when logged out
  useEffect(() => {
    if (!isLoggedIn) {
      setConversations([]);
    }
  }, [isLoggedIn]);

  return {
    conversations,
    isLoading,
    error,
    refresh,
  };
}
