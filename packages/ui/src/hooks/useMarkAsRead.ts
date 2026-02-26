/**
 * Hook for marking conversations as read.
 *
 * Encrypts the last read message ID and sends it to the API.
 * The server cannot determine which message was actually read.
 */

import { useState, useCallback, useMemo } from 'react';
import { createApiClient, type CryptoProfile } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { encryptLastReadId } from '../services/readStateService';

export interface UseMarkAsReadResult {
  /** Mark a conversation as read up to a specific message */
  markAsRead: (
    conversationId: string,
    lastReadMessageId: string,
    cryptoProfile?: CryptoProfile
  ) => Promise<{ success: boolean; error?: string }>;
  /** Whether a mark-as-read operation is in progress */
  isMarking: boolean;
  /** Last error message */
  error: string | null;
}

/**
 * Hook for marking conversations as read.
 *
 * @example
 * ```tsx
 * const { markAsRead, isMarking } = useMarkAsRead();
 *
 * // When user views a message
 * await markAsRead(conversationId, message.id, 'default');
 * ```
 */
export function useMarkAsRead(): UseMarkAsReadResult {
  const { apiBaseUrl } = useAppConfig();
  const { status, identity } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markAsRead = useCallback(
    async (
      conversationId: string,
      lastReadMessageId: string,
      cryptoProfile: CryptoProfile = 'default'
    ): Promise<{ success: boolean; error?: string }> => {
      if (status !== 'logged_in' || !identity) {
        return { success: false, error: 'Not logged in' };
      }

      setIsMarking(true);
      setError(null);

      try {
        // Encrypt the last read message ID
        const encryptedLastReadId = encryptLastReadId(
          conversationId,
          lastReadMessageId,
          cryptoProfile
        );

        // Send to API
        const response = await api.dm.updateReadState(conversationId, encryptedLastReadId);

        if (!response.success) {
          const errMsg = response.error?.message ?? 'Failed to update read state';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        return { success: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to mark as read';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsMarking(false);
      }
    },
    [api, identity, status]
  );

  return {
    markAsRead,
    isMarking,
    error,
  };
}
