/**
 * Hook for managing friends, friend requests, and friendship status.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  createApiClient,
  type FriendshipStatus,
  type Friend,
  type IncomingFriendRequest,
  type SentFriendRequest,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { usePolling } from './usePolling';

export interface UseFriendshipStatusOptions {
  /** Identity ID to check status for */
  identityId: string;
  /** Whether to fetch immediately (default: true) */
  immediate?: boolean;
}

export interface UseFriendshipStatusResult {
  /** Current status */
  status: FriendshipStatus | null;
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Refresh status */
  refresh: () => Promise<void>;
  /** Send friend request */
  sendRequest: () => Promise<{ success: boolean; error?: string }>;
  /** Cancel sent request */
  cancelRequest: () => Promise<{ success: boolean; error?: string }>;
  /** Accept incoming request */
  acceptRequest: () => Promise<{ success: boolean; error?: string }>;
  /** Ignore incoming request */
  ignoreRequest: () => Promise<{ success: boolean; error?: string }>;
  /** Remove friend */
  removeFriend: () => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook for checking and managing friendship status with a specific identity.
 */
export function useFriendshipStatus({
  identityId,
  immediate = true,
}: UseFriendshipStatusOptions): UseFriendshipStatusResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [status, setStatus] = useState<FriendshipStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const actionLoadingRef = useRef(false);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn || !identityId) {
      setStatus(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await api.friends.getStatus(identityId);
      if (response.success && response.data) {
        setStatus(response.data);
      } else {
        setError(response.error?.message ?? 'Failed to get status');
      }
    } catch {
      setError('Failed to get status');
    } finally {
      setIsLoading(false);
    }
  }, [api, identityId, isLoggedIn]);

  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  const sendRequest = useCallback(async () => {
    console.log('[useFriendshipStatus] sendRequest called', { identityId, actionLoading: actionLoadingRef.current });
    if (actionLoadingRef.current) {
      console.log('[useFriendshipStatus] Action already in progress');
      return { success: false, error: 'Action in progress' };
    }
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      console.log('[useFriendshipStatus] Calling API friends.sendRequest');
      const response = await api.friends.sendRequest(identityId);
      console.log('[useFriendshipStatus] API response:', response);
      if (response.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: response.error?.message ?? 'Failed to send request' };
    } catch (err) {
      console.error('[useFriendshipStatus] Error:', err);
      return { success: false, error: 'Failed to send request' };
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [api, identityId, refresh]);

  const cancelRequest = useCallback(async () => {
    if (actionLoadingRef.current || !status?.requestId) return { success: false, error: 'No request to cancel' };
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      const response = await api.friends.cancelRequest(status.requestId);
      if (response.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: response.error?.message ?? 'Failed to cancel request' };
    } catch {
      return { success: false, error: 'Failed to cancel request' };
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [api, status, refresh]);

  const acceptRequest = useCallback(async () => {
    if (actionLoadingRef.current || !status?.requestId) return { success: false, error: 'No request to accept' };
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      const response = await api.friends.acceptRequest(status.requestId);
      if (response.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: response.error?.message ?? 'Failed to accept request' };
    } catch {
      return { success: false, error: 'Failed to accept request' };
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [api, status, refresh]);

  const ignoreRequest = useCallback(async () => {
    if (actionLoadingRef.current || !status?.requestId) return { success: false, error: 'No request to ignore' };
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      const response = await api.friends.ignoreRequest(status.requestId);
      if (response.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: response.error?.message ?? 'Failed to ignore request' };
    } catch {
      return { success: false, error: 'Failed to ignore request' };
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [api, status, refresh]);

  const removeFriend = useCallback(async () => {
    if (actionLoadingRef.current) return { success: false, error: 'Action in progress' };
    actionLoadingRef.current = true;
    setActionLoading(true);

    try {
      const response = await api.friends.removeFriend(identityId);
      if (response.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: response.error?.message ?? 'Failed to remove friend' };
    } catch {
      return { success: false, error: 'Failed to remove friend' };
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  }, [api, identityId, refresh]);

  return {
    status,
    isLoading: isLoading || actionLoading,
    error,
    refresh,
    sendRequest,
    cancelRequest,
    acceptRequest,
    ignoreRequest,
    removeFriend,
  };
}

export interface UseFriendsListOptions {
  /** Number of friends per page (default: 20) */
  limit?: number;
  /** Search query to filter friends */
  search?: string;
  /** Whether to fetch immediately (default: true) */
  immediate?: boolean;
  /** Polling interval in ms. When set, periodically refreshes the list. Pauses when the document is hidden. */
  pollInterval?: number;
}

export interface UseFriendsListResult {
  /** List of friends */
  friends: Friend[];
  /** Total count */
  total: number;
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Whether there are more pages */
  hasMore: boolean;
  /** Load more friends */
  loadMore: () => Promise<void>;
  /** Refresh the list */
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching and paginating the friends list.
 */
export function useFriendsList({
  limit = 20,
  search,
  immediate = true,
  pollInterval,
}: UseFriendsListOptions = {}): UseFriendsListResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setFriends([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    cursorRef.current = null;

    try {
      const response = await api.friends.getFriends(limit, undefined, search);
      if (response.success && response.data) {
        setFriends(response.data.friends);
        setTotal(response.data.total);
        cursorRef.current = response.data.cursor;
      } else {
        setError(response.error?.message ?? 'Failed to load friends');
      }
    } catch {
      setError('Failed to load friends');
    } finally {
      setIsLoading(false);
    }
  }, [api, limit, search, isLoggedIn]);

  const loadMore = useCallback(async () => {
    if (!isLoggedIn || !cursorRef.current || isLoading) return;

    setIsLoading(true);

    try {
      const response = await api.friends.getFriends(limit, cursorRef.current, search);
      if (response.success && response.data) {
        setFriends((prev) => [...prev, ...response.data!.friends]);
        cursorRef.current = response.data.cursor;
      }
    } catch {
      setError('Failed to load more friends');
    } finally {
      setIsLoading(false);
    }
  }, [api, limit, search, isLoading, isLoggedIn]);

  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  usePolling(refresh, pollInterval, isLoggedIn);

  return {
    friends,
    total,
    isLoading,
    error,
    hasMore: cursorRef.current !== null,
    loadMore,
    refresh,
  };
}

export interface UseFriendRequestsResult {
  /** Incoming requests */
  incoming: IncomingFriendRequest[];
  /** Sent requests */
  sent: SentFriendRequest[];
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Refresh requests */
  refresh: () => Promise<void>;
  /** Accept an incoming request */
  accept: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  /** Ignore an incoming request */
  ignore: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  /** Cancel a sent request */
  cancel: (requestId: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Hook for managing incoming and sent friend requests.
 */
export function useFriendRequests(): UseFriendRequestsResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [sent, setSent] = useState<SentFriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setIncoming([]);
      setSent([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [incomingRes, sentRes] = await Promise.all([
        api.friends.getIncomingRequests(),
        api.friends.getSentRequests(),
      ]);

      if (incomingRes.success && incomingRes.data) {
        setIncoming(incomingRes.data.requests);
      }
      if (sentRes.success && sentRes.data) {
        setSent(sentRes.data.requests);
      }
    } catch {
      setError('Failed to load friend requests');
    } finally {
      setIsLoading(false);
    }
  }, [api, isLoggedIn]);

  const accept = useCallback(
    async (requestId: string) => {
      try {
        const response = await api.friends.acceptRequest(requestId);
        if (response.success) {
          await refresh();
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to accept' };
      } catch {
        return { success: false, error: 'Failed to accept' };
      }
    },
    [api, refresh]
  );

  const ignore = useCallback(
    async (requestId: string) => {
      try {
        const response = await api.friends.ignoreRequest(requestId);
        if (response.success) {
          await refresh();
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to ignore' };
      } catch {
        return { success: false, error: 'Failed to ignore' };
      }
    },
    [api, refresh]
  );

  const cancel = useCallback(
    async (requestId: string) => {
      try {
        const response = await api.friends.cancelRequest(requestId);
        if (response.success) {
          await refresh();
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to cancel' };
      } catch {
        return { success: false, error: 'Failed to cancel' };
      }
    },
    [api, refresh]
  );

  useEffect(() => {
    if (isLoggedIn) {
      refresh();
    }
  }, [isLoggedIn, refresh]);

  return {
    incoming,
    sent,
    isLoading,
    error,
    refresh,
    accept,
    ignore,
    cancel,
  };
}
