/**
 * Hook for managing the current identity's custom emojis.
 *
 * Fetches the list on mount, provides CRUD callbacks, and exposes
 * tier limit info. The emoji list is cached in component state and
 * refreshed after mutations.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createApiClient, type PublicCustomEmoji, type CustomEmojiListResponse } from '@adieuu/shared';
import { useAppConfig } from '../config';

export interface UseCustomEmojisReturn {
  emojis: PublicCustomEmoji[];
  limit: number;
  used: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createEmoji: (shortcode: string, name: string, mediaId: string) => Promise<PublicCustomEmoji | null>;
  updateEmoji: (id: string, params: { shortcode?: string; name?: string }) => Promise<PublicCustomEmoji | null>;
  deleteEmoji: (id: string) => Promise<boolean>;
}

export function useCustomEmojis(identityId: string | undefined): UseCustomEmojisReturn {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const [emojis, setEmojis] = useState<PublicCustomEmoji[]>([]);
  const [limit, setLimit] = useState(0);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!identityId || !api) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.customEmojis.list();
      if (!mountedRef.current) return;
      if (res.success && res.data) {
        const data = res.data as CustomEmojiListResponse;
        setEmojis(data.emojis);
        setLimit(data.limit);
        setUsed(data.used);
      } else {
        setError('Failed to load custom emojis');
      }
    } catch {
      if (mountedRef.current) setError('Failed to load custom emojis');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [identityId, api]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createEmoji = useCallback(async (
    shortcode: string,
    name: string,
    mediaId: string
  ): Promise<PublicCustomEmoji | null> => {
    if (!api) return null;
    try {
      const res = await api.customEmojis.create({ shortcode, name, mediaId });
      if (res.success && res.data) {
        await refresh();
        return res.data as PublicCustomEmoji;
      }
      setError(typeof res.error === 'object' && res.error !== null && 'message' in res.error
        ? (res.error as { message: string }).message
        : 'Failed to create emoji');
      return null;
    } catch {
      setError('Failed to create emoji');
      return null;
    }
  }, [api, refresh]);

  const updateEmoji = useCallback(async (
    id: string,
    params: { shortcode?: string; name?: string }
  ): Promise<PublicCustomEmoji | null> => {
    if (!api) return null;
    try {
      const res = await api.customEmojis.update(id, params);
      if (res.success && res.data) {
        await refresh();
        return res.data as PublicCustomEmoji;
      }
      return null;
    } catch {
      return null;
    }
  }, [api, refresh]);

  const deleteEmoji = useCallback(async (id: string): Promise<boolean> => {
    if (!api) return false;
    try {
      const res = await api.customEmojis.delete(id);
      if (res.success) {
        await refresh();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [api, refresh]);

  return {
    emojis,
    limit,
    used,
    loading,
    error,
    refresh,
    createEmoji,
    updateEmoji,
    deleteEmoji,
  };
}
