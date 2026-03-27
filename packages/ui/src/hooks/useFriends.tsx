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
  type ChatIncomingMessage,
  type ChatClientConfig,
  ChatClient,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { useIdentity } from './useIdentity';
import { useToast } from '../components/Toast';
import { useNotificationSoundPreference } from './useNotificationSoundPreference';
import { getNativeNotificationsEnabled } from './useNativeNotificationsPreference';
import { playNotificationSound, type FocusVisibilitySnapshot } from '../utils/notificationSound';

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
  /** Get the friendship status with an identity */
  getFriendshipStatus: (identityId: string) => Promise<FriendshipStatus>;
  /** Refresh friends data from the server */
  refresh: () => Promise<void>;
}

const FriendsContext = createContext<FriendsContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

const POLL_INTERVAL_MS = 30_000;
const LOCAL_SEARCH_THRESHOLD = 50;

export interface FriendsProviderProps {
  children: ReactNode;
}

export function FriendsProvider({ children }: FriendsProviderProps) {
  const { apiBaseUrl, chatWsUrl } = useAppConfig();
  const { status: identityStatus, identity } = useIdentity();
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const soundPref = useNotificationSoundPreference();

  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingFriendRequestInfo[]>([]);
  const [incomingRequestCount, setIncomingRequestCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const chatClientRef = useRef<ChatClient | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIdentityLoggedIn = identityStatus === 'logged_in' && identity;

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const fireNotification = useCallback(
    (title: string, body: string) => {
      toast.info(title, body);

      const snapshot: FocusVisibilitySnapshot = {
        hasFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
      };

      void playNotificationSound({
        enabled: soundPref.enabled,
        soundId: soundPref.soundId,
        customPath: soundPref.customPath,
        suppressWhenFocused: soundPref.suppressWhenFocused,
        isViewingConversation: false,
        snapshot,
        volume: soundPref.volume,
        loadCustomSound: audio?.loadSoundFromPath,
      });

      if (getNativeNotificationsEnabled() && notifications.hasPermission()) {
        notifications.show(title, body, { tag: 'friend-event' });
      }
    },
    [toast, soundPref, audio, notifications]
  );

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------

  const fetchFriends = useCallback(async () => {
    try {
      const res = await api.friends.getFriends(100);
      if (res.success && res.data) {
        setFriends(res.data.friends);
      }
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

  const getFriendshipStatus = useCallback(async (identityId: string): Promise<FriendshipStatus> => {
    try {
      const res = await api.friends.getFriendshipStatus(identityId);
      if (res.success && res.data) {
        return res.data.status;
      }
    } catch {
      // Fall through
    }
    return 'none';
  }, [api]);

  // --------------------------------------------------------------------------
  // WebSocket listener
  // --------------------------------------------------------------------------

  useEffect(() => {
    if (!isIdentityLoggedIn || !chatWsUrl) return;

    const client = new ChatClient(
      { wsUrl: chatWsUrl, heartbeatInterval: 30_000, maxReconnectAttempts: Infinity } as ChatClientConfig,
      {
        onMessage: (message: ChatIncomingMessage) => {
          switch (message.type) {
            case 'friend_request_received': {
              const msg = message as Extract<ChatIncomingMessage, { type: 'friend_request_received' }>;
              fetchIncomingRequests();
              const senderName = msg.data.fromIdentity?.displayName ?? msg.data.fromIdentity?.username;
              if (senderName) {
                fireNotification(
                  t('friends.notifications.requestReceived'),
                  t('friends.notifications.requestReceivedBody', { name: senderName })
                );
              }
              break;
            }
            case 'friend_request_accepted': {
              const msg = message as Extract<ChatIncomingMessage, { type: 'friend_request_accepted' }>;
              fetchFriends();
              const accepterName = msg.data.byIdentity?.displayName ?? msg.data.byIdentity?.username;
              if (accepterName) {
                fireNotification(
                  t('friends.notifications.requestAccepted'),
                  t('friends.notifications.requestAcceptedBody', { name: accepterName })
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
        },
        onStateChange: (state) => {
          if (state === 'disconnected' || state === 'reconnecting') {
            // Start fallback polling when WS is down
            if (!pollTimerRef.current) {
              pollTimerRef.current = setInterval(fetchRequestCount, POLL_INTERVAL_MS);
            }
          } else if (state === 'connected') {
            // Stop polling when WS reconnects
            if (pollTimerRef.current) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            // Refresh data after reconnection
            refresh();
          }
        },
      }
    );

    chatClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      chatClientRef.current = null;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isIdentityLoggedIn, chatWsUrl, fetchIncomingRequests, fetchFriends, fetchRequestCount, refresh, fireNotification, t]);

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

export function useFriends(): FriendsContextValue {
  const ctx = useContext(FriendsContext);
  if (!ctx) {
    throw new Error('useFriends must be used within a FriendsProvider');
  }
  return ctx;
}
