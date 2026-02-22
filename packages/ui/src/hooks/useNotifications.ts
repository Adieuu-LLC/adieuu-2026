/**
 * Hook for managing notifications with polling support.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  createApiClient,
  type Notification,
  type NotificationType,
  type NotificationCounts,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface UseNotificationsOptions {
  /** Polling interval in ms (default: 30000, 0 to disable) */
  pollingInterval?: number;
  /** Whether to fetch immediately (default: true) */
  immediate?: boolean;
  /** Only fetch unread notifications */
  unreadOnly?: boolean;
  /** Filter by notification types */
  types?: NotificationType[];
  /** Maximum notifications to fetch (default: 50) */
  limit?: number;
}

export interface UseNotificationsResult {
  /** List of notifications */
  notifications: Notification[];
  /** Unread count */
  unreadCount: number;
  /** Counts by type */
  countsByType: Record<string, number>;
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Refresh notifications */
  refresh: () => Promise<void>;
  /** Mark notifications as read */
  markAsRead: (ids: string[] | 'all') => Promise<{ success: boolean; error?: string }>;
  /** Mark notifications as unread */
  markAsUnread: (ids: string[] | 'all') => Promise<{ success: boolean; error?: string }>;
  /** Delete notifications */
  deleteNotifications: (ids: string[] | 'all') => Promise<{ success: boolean; error?: string }>;
  /** Start polling */
  startPolling: () => void;
  /** Stop polling */
  stopPolling: () => void;
  /** Whether polling is active */
  isPolling: boolean;
}

/**
 * Hook for fetching and managing notifications with optional polling.
 */
export function useNotifications({
  pollingInterval = 30000,
  immediate = true,
  unreadOnly = false,
  types,
  limit = 50,
}: UseNotificationsOptions = {}): UseNotificationsResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [countsByType, setCountsByType] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(pollingInterval > 0);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearTimeout(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setNotifications([]);
      setUnreadCount(0);
      setCountsByType({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [notifRes, countsRes] = await Promise.all([
        api.notifications.getNotifications({
          limit,
          unreadOnly,
          types,
        }),
        api.notifications.getCounts(),
      ]);

      if (notifRes.success && notifRes.data) {
        setNotifications(notifRes.data.notifications);
        setUnreadCount(notifRes.data.unreadCount);
        if (notifRes.data.notifications.length > 0) {
          lastFetchRef.current = notifRes.data.notifications[0].createdAt;
        }
      } else {
        setError(notifRes.error?.message ?? 'Failed to load notifications');
      }

      if (countsRes.success && countsRes.data) {
        setCountsByType(countsRes.data.byType);
        setUnreadCount(countsRes.data.unread);
      }
    } catch {
      setError('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [api, limit, unreadOnly, types, isLoggedIn]);

  const fetchNew = useCallback(async () => {
    if (!isLoggedIn) return;

    try {
      const response = await api.notifications.getNotifications({
        since: lastFetchRef.current ?? undefined,
        limit: 20,
      });

      if (response.success && response.data) {
        const newNotifs = response.data.notifications;
        if (newNotifs.length > 0) {
          setNotifications((prev) => {
            const existingIds = new Set(prev.map((n) => n.id));
            const unique = newNotifs.filter((n) => !existingIds.has(n.id));
            return [...unique, ...prev].slice(0, limit);
          });
          lastFetchRef.current = newNotifs[0].createdAt;
        }
        setUnreadCount(response.data.unreadCount);
      }
    } catch {
      // Silent fail for polling
    }
  }, [api, limit, isLoggedIn]);

  const startPolling = useCallback(() => {
    if (pollingInterval <= 0 || !isLoggedIn) return;

    setIsPolling(true);

    const poll = () => {
      pollingTimerRef.current = setTimeout(async () => {
        await fetchNew();
        if (isPolling) {
          poll();
        }
      }, pollingInterval);
    };

    poll();
  }, [pollingInterval, fetchNew, isLoggedIn, isPolling]);

  const markAsRead = useCallback(
    async (ids: string[] | 'all') => {
      try {
        const response = await api.notifications.markAsRead(ids);
        if (response.success) {
          if (ids === 'all') {
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnreadCount(0);
          } else {
            const idSet = new Set(ids);
            setNotifications((prev) =>
              prev.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n))
            );
            setUnreadCount((prev) => Math.max(0, prev - ids.length));
          }
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to mark as read' };
      } catch {
        return { success: false, error: 'Failed to mark as read' };
      }
    },
    [api]
  );

  const markAsUnread = useCallback(
    async (ids: string[] | 'all') => {
      try {
        const response = await api.notifications.markAsUnread(ids);
        if (response.success) {
          if (ids === 'all') {
            setNotifications((prev) => prev.map((n) => ({ ...n, read: false })));
            setUnreadCount(notifications.length);
          } else {
            const idSet = new Set(ids);
            setNotifications((prev) =>
              prev.map((n) => (idSet.has(n.id) ? { ...n, read: false } : n))
            );
            setUnreadCount((prev) => prev + ids.length);
          }
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to mark as unread' };
      } catch {
        return { success: false, error: 'Failed to mark as unread' };
      }
    },
    [api, notifications.length]
  );

  const deleteNotifications = useCallback(
    async (ids: string[] | 'all') => {
      try {
        const response = await api.notifications.deleteNotifications(ids);
        if (response.success) {
          if (ids === 'all') {
            setNotifications([]);
            setUnreadCount(0);
          } else {
            const idSet = new Set(ids);
            setNotifications((prev) => prev.filter((n) => !idSet.has(n.id)));
            const deletedUnread = notifications.filter((n) => idSet.has(n.id) && !n.read).length;
            setUnreadCount((prev) => Math.max(0, prev - deletedUnread));
          }
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to delete' };
      } catch {
        return { success: false, error: 'Failed to delete' };
      }
    },
    [api, notifications]
  );

  // Initial fetch
  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  // Start/stop polling based on login status and settings
  useEffect(() => {
    if (isLoggedIn && pollingInterval > 0) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [isLoggedIn, pollingInterval, startPolling, stopPolling]);

  return {
    notifications,
    unreadCount,
    countsByType,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAsUnread,
    deleteNotifications,
    startPolling,
    stopPolling,
    isPolling,
  };
}

/**
 * Lightweight hook for just the unread count (for badges).
 */
export function useUnreadNotificationCount(pollingInterval = 60000): {
  unreadCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setUnreadCount(0);
      return;
    }

    setIsLoading(true);

    try {
      const response = await api.notifications.getCounts();
      if (response.success && response.data) {
        setUnreadCount(response.data.unread);
      }
    } catch {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  }, [api, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    refresh();

    if (pollingInterval > 0) {
      const poll = () => {
        pollingTimerRef.current = setTimeout(async () => {
          await refresh();
          poll();
        }, pollingInterval);
      };
      poll();
    }

    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current);
      }
    };
  }, [isLoggedIn, pollingInterval, refresh]);

  return {
    unreadCount,
    isLoading,
    refresh,
  };
}
