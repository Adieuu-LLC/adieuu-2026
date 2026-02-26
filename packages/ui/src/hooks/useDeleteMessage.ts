/**
 * Hook for deleting DM messages.
 *
 * Provides methods for deleting messages for everyone (sender only)
 * or for self (any participant).
 */

import { useState, useCallback, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface DeleteMessageResult {
  success: boolean;
  error?: string;
}

export interface UseDeleteMessageResult {
  /** Delete a message for everyone (sender only) */
  deleteForEveryone: (messageId: string) => Promise<DeleteMessageResult>;
  /** Delete a message for self only */
  deleteForSelf: (messageId: string) => Promise<DeleteMessageResult>;
  /** Whether a delete operation is in progress */
  isDeleting: boolean;
  /** Last error message */
  error: string | null;
}

/**
 * Hook for deleting DM messages.
 *
 * @example
 * ```tsx
 * function MessageActions({ message, isOwn }) {
 *   const { deleteForEveryone, deleteForSelf, isDeleting } = useDeleteMessage();
 *
 *   const handleDelete = async () => {
 *     if (isOwn) {
 *       await deleteForEveryone(message.id);
 *     } else {
 *       await deleteForSelf(message.id);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleDelete} disabled={isDeleting}>
 *       Delete
 *     </button>
 *   );
 * }
 * ```
 */
export function useDeleteMessage(): UseDeleteMessageResult {
  const { apiBaseUrl } = useAppConfig();
  const { status } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteForEveryone = useCallback(
    async (messageId: string): Promise<DeleteMessageResult> => {
      if (status !== 'logged_in') {
        return { success: false, error: 'Not logged in' };
      }

      setIsDeleting(true);
      setError(null);

      try {
        const response = await api.dm.deleteForEveryone(messageId);

        if (!response.success) {
          const errMsg = response.error?.message ?? 'Failed to delete message';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        return { success: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to delete message';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsDeleting(false);
      }
    },
    [api, status]
  );

  const deleteForSelf = useCallback(
    async (messageId: string): Promise<DeleteMessageResult> => {
      if (status !== 'logged_in') {
        return { success: false, error: 'Not logged in' };
      }

      setIsDeleting(true);
      setError(null);

      try {
        const response = await api.dm.deleteForSelf(messageId);

        if (!response.success) {
          const errMsg = response.error?.message ?? 'Failed to delete message';
          setError(errMsg);
          return { success: false, error: errMsg };
        }

        return { success: true };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Failed to delete message';
        setError(errMsg);
        return { success: false, error: errMsg };
      } finally {
        setIsDeleting(false);
      }
    },
    [api, status]
  );

  return {
    deleteForEveryone,
    deleteForSelf,
    isDeleting,
    error,
  };
}
