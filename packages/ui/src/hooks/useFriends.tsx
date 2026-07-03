/**
 * Friends context and hook.
 *
 * Manages friend state: friends list, incoming requests, and request count.
 * Listens for WebSocket events for real-time updates, with a fallback
 * polling mechanism when the WS connection is unavailable.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import {
  createApiClient,
  type FriendInfo,
  type IncomingFriendRequestInfo,
  type FriendshipStatus,
  type FriendshipStatusResult,
  type ChatIncomingMessage,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { useIdentity } from './useIdentity';
import { useChatSocket } from './useChatSocket';
import { useToast } from '../components/Toast';
import { useNotificationSoundPreference } from './useNotificationSoundPreference';
import { useClaimAchievement } from './useClaimAchievement';
import { fireConversationNotification } from '../utils/conversationNotifications';
import { sidebarActions } from '../utils/sidebarActions';

// ============================================================================
// Types
// ============================================================================

export interface FriendsContextValue {
  /** Full friends list (loaded on mount) */
  friends: FriendInfo[];
  /** Pending incoming friend requests */
  incomingRequests: IncomingFriendRequestInfo[];
  /** Count of pending incoming requests */
  incomingRequestCount: number;
  /** Whether the initial load is in progress */
  isLoading: boolean;

  /** Send a friend request to an identity */
  sendRequest: (identityId: string) => Promise<boolean>;
  /** Accept an incoming friend request */
  acceptRequest: (requestId: string) => Promise<boolean>;
  /** Ignore an incoming friend request */
  ignoreRequest: (requestId: string) => Promise<boolean>;
  /** Remove a friend */
  removeFriend: (identityId: string) => Promise<boolean>;
  /** Search through friends (local first, then server) */
  searchFriends: (query: string) => Promise<FriendInfo[]>;
  /** Get the friendship status with an identity (includes `friendsSince` when you are friends) */
  getFriendshipStatus: (identityId: string) => Promise<FriendshipStatusResult>;
  /** Refresh friends data from the server */
  refresh: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

const POLL_INTERVAL_MS = 30_000;
const LOCAL_SEARCH_THRESHOLD = 50;
/** API max per page; we follow cursors until exhausted (cap pages to avoid runaway). */
const FRIENDS_PAGE_SIZE = 100;
const MAX_FRIEND_PAGES = 50;

export interface FriendsProviderProps {
  children: ReactNode;
}

export function FriendsProvider({ children }: FriendsProviderProps) {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus, identity } = useIdentity();
  const { subscribe, onStateChange } = useChatSocket();
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const soundPref = useNotificationSoundPreference();
  const claimAchievement = useClaimAchievement();
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequestInfo[]>([]);
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const fireNotification = useCallback(
    (title: string, body: string, onClick?: () => void) => {
      fireConversationNotification(
        title,
        body,
        { onClick, isViewingConversation: false, nativeTag: 'friend-event' },
        { toast, soundPref, notifications, audio, onWilhelmScream: () => claimAchievement('wilhelm_scream') }
      );
    },
    [toast, soundPref, audio, notifications, claimAchievement]
  );

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchFriends = useCallback(async () => {
    try {
      const merged: FriendInfo[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_FRIEND_PAGES; page++) {
        const res = await api.friends.getFriends(FRIENDS_PAGE_SIZE, cursor);
        if (!res.success || !res.data) break;
        merged.push(...res.data.friends);
        const next = res.data.cursor;
        if (!next) break;
        cursor = next;
      }
      const seen = new Set<string>();
      const deduped = merged.filter((f) => {
        if (seen.has(f.identity.id)) return false;
        seen.add(f.identity.id);
        return true;
      });
      setFriends(deduped);
    } catch {
      // Silently fail -- will retry on next refresh
    }
  }, [api]);

  const fetchIncomingRequests = useCallback(async () => {
    try {
      const res = await api.friends.getIncomingRequests(50);
      if (res.success && res.data) {
        setIncomingRequests(res.data.requests);
        setIncomingRequestCount(res.data.count);
      }
    } catch {
      // Silently fail
    }
  }, [api]);

  const fetchRequestCount = useCallback(async () => {
    try {
      const res = await api.friends.getIncomingRequestCount();
      if (res.success && res.data) {
        setIncomingRequestCount(res.data.count);
      }
    } catch {
      // Silently fail
    }
  }, [api]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchFriends(), fetchIncomingRequests()]);
  }, [fetchFriends, fetchIncomingRequests]);

  // --------------------------------------------------------------------------
  // Actions
  // --------------------------------------------------------------------------

  const sendRequest = useCallback(async (identityId: string): Promise<boolean> => {
    const res = await api.friends.sendRequest(identityId);
    return res.success;
  }, [api]);

  const acceptRequest = useCallback(async (requestId: string): Promise<boolean> => {
    const res = await api.friends.acceptRequest(requestId);
    if (res.success) {
      // Optimistically remove from incoming requests and refresh friends
      setIncomingRequests((prev) => prev.filter((r) => r.request.id !== requestId));
      setIncomingRequestCount((prev) => Math.max(0, prev - 1));
      await fetchFriends();
    }
    return res.success;
  }, [api, fetchFriends]);

  const ignoreRequest = useCallback(async (requestId: string): Promise<boolean> => {
    const res = await api.friends.ignoreRequest(requestId);
    if (res.success) {
      setIncomingRequests((prev) => prev.filter((r) => r.request.id !== requestId));
      setIncomingRequestCount((prev) => Math.max(0, prev - 1));
    }
    return res.success;
  }, [api]);

  const removeFriend = useCallback(async (identityId: string): Promise<boolean> => {
    const res = await api.friends.removeFriend(identityId);
    if (res.success) {
      setFriends((prev) => prev.filter((f) => f.identity.id !== identityId));
    }
    return res.success;
  }, [api]);

  const searchFriends = useCallback(async (query: string): Promise<FriendInfo[]> => {
    if (!query || query.trim().length < 2) return [];

    const q = query.trim().toLowerCase();

    // Local search first if friend list is small enough
    if (friends.length <= LOCAL_SEARCH_THRESHOLD) {
      const localResults = friends.filter(
        (f) =>
          f.identity.displayName.toLowerCase().includes(q) ||
          f.identity.username.toLowerCase().includes(q)
      );
      if (localResults.length > 0) return localResults;
    }

    // Fall back to server search
    try {
      const res = await api.friends.searchFriends(query);
      if (res.success && res.data) {
        return res.data.friends;
      }
    } catch {
      // Fall through
    }

    return [];
  }, [api, friends]);

  const getFriendshipStatus = useCallback(async (identityId: string): Promise<FriendshipStatusResult> => {
    try {
      const res = await api.friends.getFriendshipStatus(identityId);
      if (res.success && res.data) {
        return res.data;
      }
    } catch {
      // Fall through
    }
    return { status: 'none' as const };
  }, [api]);

  // --------------------------------------------------------------------------
  // WebSocket listener (via shared ChatSocket)
  // --------------------------------------------------------------------------

  const fetchIncomingRequestsRef = useRef(fetchIncomingRequests);
  fetchIncomingRequestsRef.current = fetchIncomingRequests;
  const fetchFriendsRef = useRef(fetchFriends);
  fetchFriendsRef.current = fetchFriends;
  const fetchRequestCountRef = useRef(fetchRequestCount);
  fetchRequestCountRef.current = fetchRequestCount;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const fireNotificationRef = useRef(fireNotification);
  fireNotificationRef.current = fireNotification;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isIdentityLoggedIn) return;

    const unsubMessage = subscribe((message: ChatIncomingMessage) => {
      switch (message.type) {
        case 'friend_request_received': {
          const msg = message as Extract<ChatIncomingMessage, { type: 'friend_request_received' }>;
          fetchIncomingRequestsRef.current();
          const senderName = msg.data.fromIdentity?.displayName ?? msg.data.fromIdentity?.username;
          if (senderName) {
            fireNotificationRef.current(
              tRef.current('friends.notifications.requestReceived'),
              tRef.current('friends.notifications.requestReceivedBody', { name: senderName }),
              () => sidebarActions.openFriends()
            );
          }
          break;
        }
        case 'friend_request_accepted': {
          const msg = message as Extract<ChatIncomingMessage, { type: 'friend_request_accepted' }>;
          fetchFriendsRef.current();
          const accepterName = msg.data.byIdentity?.displayName ?? msg.data.byIdentity?.username;
          if (accepterName) {
            fireNotificationRef.current(
              tRef.current('friends.notifications.requestAccepted'),
              tRef.current('friends.notifications.requestAcceptedBody', { name: accepterName }),
              () => sidebarActions.openFriends()
            );
          }
          break;
        }
        case 'friend_removed': {
          const msg = message as Extract<ChatIncomingMessage, { type: 'friend_removed' }>;
          setFriends((prev) =>
            prev.filter((f) => f.identity.id !== msg.data.identityId)
          );
          break;
        }
      }
    });

    const unsubState = onStateChange((state) => {
      if (state === 'disconnected' || state === 'reconnecting') {
        if (!pollTimerRef.current) {
          pollTimerRef.current = setInterval(() => fetchRequestCountRef.current(), POLL_INTERVAL_MS);
        }
      } else if (state === 'connected') {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        refreshRef.current();
      }
    });

    return () => {
      unsubMessage();
      unsubState();
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isIdentityLoggedIn, subscribe, onStateChange]);

  // --------------------------------------------------------------------------
  // Initial load
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isIdentityLoggedIn) {
      setFriends([]);
      setIncomingRequests([]);
      setIncomingRequestCount(0);
      return;
    }

    setIsLoading(true);
    refresh().finally(() => setIsLoading(false));
  }, [isIdentityLoggedIn, refresh]);

  // --------------------------------------------------------------------------
  // Context value
  // --------------------------------------------------------------------------

  const value = useMemo<FriendsContextValue>(
    () => ({
      friends,
      incomingRequests,
      incomingRequestCount,
      isLoading,
      sendRequest,
      acceptRequest,
      ignoreRequest,
      removeFriend,
      searchFriends,
      getFriendshipStatus,
      refresh,
    }),
    [
      friends,
      incomingRequests,
      incomingRequestCount,
      isLoading,
      sendRequest,
      acceptRequest,
      ignoreRequest,
      removeFriend,
      searchFriends,
      getFriendshipStatus,
      refresh,
    ]
  );

  return (
    <FriendsContext.Provider value={value}>
      {children}
    </FriendsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

const NOOP_FRIENDS: FriendsContextValue = {
  friends: [],
  incomingRequests: [],
  incomingRequestCount: 0,
  isLoading: false,
  sendRequest: async () => false,
  acceptRequest: async () => false,
  ignoreRequest: async () => false,
  removeFriend: async () => false,
  searchFriends: async () => [],
  getFriendshipStatus: async () => ({ status: 'none' as const }),
  refresh: async () => {},
};

export function useFriends(): FriendsContextValue {
  const ctx = useContext(FriendsContext);
  return ctx ?? NOOP_FRIENDS;
}
