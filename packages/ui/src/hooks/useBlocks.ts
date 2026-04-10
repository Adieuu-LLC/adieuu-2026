/**
 * Hook for managing blocked identities.
 *
 * Thin wrapper over BlockContext for backward compatibility.
 * The Privacy page and other consumers can continue importing from here.
 */

import { useBlockContext } from './useBlockContext';
import type { BlockContextValue } from './useBlockContext';

export interface UseBlocksOptions {
  /** @deprecated Options are no longer used; the context manages state globally. */
  limit?: number;
  /** @deprecated Options are no longer used; the context manages state globally. */
  immediate?: boolean;
}

export interface UseBlocksResult {
  blocked: BlockContextValue['blockedList'];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  block: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  unblock: (identityId: string) => Promise<{ success: boolean; error?: string }>;
  isBlocked: (identityId: string) => boolean;
}

export function useBlocks(_options?: UseBlocksOptions): UseBlocksResult {
  const ctx = useBlockContext();

  return {
    blocked: ctx.blockedList,
    isLoading: ctx.isLoading,
    error: ctx.error,
    hasMore: ctx.hasMore,
    loadMore: ctx.loadMore,
    refresh: ctx.refresh,
    block: ctx.block,
    unblock: ctx.unblock,
    isBlocked: ctx.isBlocked,
  };
}
