/**
 * Hook for managing blocked identities.
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { createApiClient, type BlockedIdentity } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface UseBlocksOptions {
  /** Number of blocked identities per page (default: 20) */
  limit?: number;
  /** Whether to fetch immediately (default: true) */
  immediate?: boolean;
}

export interface UseBlocksResult {
  /** List of blocked identities */
  blocked: BlockedIdentity[];
  /** Whether loading */
  isLoading: boolean;
  /** Error message if failed */
  error: string | null;
  /** Whether there are more pages */
  hasMore: boolean;
  /** Load more blocked identities */
  loadMore: () => Promise<void>;
  /** Refresh the list */
  refresh: () => Promise<void>;
  /** Block an identity */
  block: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  /** Unblock an identity */
  unblock: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  /** Check if an identity is blocked */
  isBlocked: (identityId: string) => boolean;
}

/**
 * Hook for fetching and managing blocked identities.
 */
export function useBlocks({
  limit = 20,
  immediate = true,
}: UseBlocksOptions = {}): UseBlocksResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [blocked, setBlocked] = useState<BlockedIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setBlocked([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    cursorRef.current = null;

    try {
      const response = await api.blocks.getBlocked(limit);
      if (response.success && response.data) {
        setBlocked(response.data.blocks);
        cursorRef.current = response.data.cursor;
      } else {
        setError(response.error?.message ?? 'Failed to load blocked identities');
      }
    } catch {
      setError('Failed to load blocked identities');
    } finally {
      setIsLoading(false);
    }
  }, [api, limit, isLoggedIn]);

  const loadMore = useCallback(async () => {
    if (!isLoggedIn || !cursorRef.current || isLoading) return;

    setIsLoading(true);

    try {
      const response = await api.blocks.getBlocked(limit, cursorRef.current);
      if (response.success && response.data) {
        setBlocked((prev) => [...prev, ...response.data!.blocks]);
        cursorRef.current = response.data.cursor;
      }
    } catch {
      setError('Failed to load more');
    } finally {
      setIsLoading(false);
    }
  }, [api, limit, isLoading, isLoggedIn]);

  const block = useCallback(
    async (identityId: string) => {
      try {
        const response = await api.blocks.block(identityId);
        if (response.success) {
          await refresh();
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to block' };
      } catch {
        return { success: false, error: 'Failed to block' };
      }
    },
    [api, refresh]
  );

  const unblock = useCallback(
    async (identityId: string) => {
      try {
        const response = await api.blocks.unblock(identityId);
        if (response.success) {
          setBlocked((prev) => prev.filter((b) => b.identity.id !== identityId));
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to unblock' };
      } catch {
        return { success: false, error: 'Failed to unblock' };
      }
    },
    [api]
  );

  const isBlockedFn = useCallback(
    (identityId: string) => blocked.some((b) => b.identity.id === identityId),
    [blocked]
  );

  useEffect(() => {
    if (immediate && isLoggedIn) {
      refresh();
    }
  }, [immediate, isLoggedIn, refresh]);

  return {
    blocked,
    isLoading,
    error,
    hasMore: cursorRef.current !== null,
    loadMore,
    refresh,
    block,
    unblock,
    isBlocked: isBlockedFn,
  };
}
