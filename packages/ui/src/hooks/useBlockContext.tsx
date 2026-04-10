/**
 * Global block context.
 *
 * Provides shared block state across the entire app tree so that any
 * component can check block status in O(1) without redundant API calls.
 * Must be mounted inside IdentityProvider.
 */

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  createContext,
  useContext,
} from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type BlockedIdentity } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface BlockContextValue {
  blockedIds: Set<string>;
  blockedList: BlockedIdentity[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  isBlocked: (identityId: string) => boolean;
  block: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  unblock: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const BlockContext = createContext<BlockContextValue | null>(null);

export function useBlockContext(): BlockContextValue {
  const context = useContext(BlockContext);
  if (!context) {
    throw new Error('useBlockContext must be used within a BlockProvider');
  }
  return context;
}

function useBlockState(): BlockContextValue {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [blockedList, setBlockedList] = useState<BlockedIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  const isLoggedIn = identityStatus === 'logged_in';

  const blockedIds = useMemo(
    () => new Set(blockedList.map((b) => b.identity.id)),
    [blockedList],
  );

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setBlockedList([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    cursorRef.current = null;

    try {
      const response = await api.blocks.getBlocked(50);
      if (response.success && response.data) {
        setBlockedList(response.data.blocks);
        cursorRef.current = response.data.cursor;
      } else {
        setError(response.error?.message ?? 'Failed to load blocked identities');
      }
    } catch {
      setError('Failed to load blocked identities');
    } finally {
      setIsLoading(false);
    }
  }, [api, isLoggedIn]);

  const loadMore = useCallback(async () => {
    if (!isLoggedIn || !cursorRef.current || isLoading) return;

    setIsLoading(true);

    try {
      const response = await api.blocks.getBlocked(50, cursorRef.current);
      if (response.success && response.data) {
        setBlockedList((prev) => [...prev, ...response.data!.blocks]);
        cursorRef.current = response.data.cursor;
      }
    } catch {
      setError('Failed to load more');
    } finally {
      setIsLoading(false);
    }
  }, [api, isLoading, isLoggedIn]);

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
    [api, refresh],
  );

  const unblock = useCallback(
    async (identityId: string) => {
      try {
        const response = await api.blocks.unblock(identityId);
        if (response.success) {
          setBlockedList((prev) => prev.filter((b) => b.identity.id !== identityId));
          return { success: true };
        }
        return { success: false, error: response.error?.message ?? 'Failed to unblock' };
      } catch {
        return { success: false, error: 'Failed to unblock' };
      }
    },
    [api],
  );

  const isBlocked = useCallback(
    (identityId: string) => blockedIds.has(identityId),
    [blockedIds],
  );

  useEffect(() => {
    if (isLoggedIn) {
      refresh();
    } else {
      setBlockedList([]);
    }
  }, [isLoggedIn, refresh]);

  return useMemo(
    () => ({
      blockedIds,
      blockedList,
      isLoading,
      error,
      hasMore: cursorRef.current !== null,
      isBlocked,
      block,
      unblock,
      refresh,
      loadMore,
    }),
    [blockedIds, blockedList, isLoading, error, isBlocked, block, unblock, refresh, loadMore],
  );
}

export interface BlockProviderProps {
  children: ReactNode;
}

export function BlockProvider({ children }: BlockProviderProps) {
  const blockState = useBlockState();

  return <BlockContext.Provider value={blockState}>{children}</BlockContext.Provider>;
}
