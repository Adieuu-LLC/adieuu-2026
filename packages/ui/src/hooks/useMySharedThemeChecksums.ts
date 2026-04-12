/**
 * Loads colour checksums for themes the current alias has already shared to the community.
 * Used to hide "Share" on custom theme cards when that palette is already published.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface UseMySharedThemeChecksumsResult {
  sharedChecksums: ReadonlySet<string>;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useMySharedThemeChecksums(): UseMySharedThemeChecksumsResult {
  const { apiBaseUrl } = useAppConfig();
  const { status: identityStatus } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [sharedChecksums, setSharedChecksums] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (identityStatus !== 'logged_in') {
      setSharedChecksums(new Set());
      return;
    }
    setLoading(true);
    try {
      const resp = await api.themes.listMySharedChecksums();
      if (resp.success && resp.data?.checksums) {
        setSharedChecksums(new Set(resp.data.checksums));
      } else {
        setSharedChecksums(new Set());
      }
    } catch {
      setSharedChecksums(new Set());
    } finally {
      setLoading(false);
    }
  }, [api, identityStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { sharedChecksums, loading, refresh };
}
