/**
 * Lightweight hook for claiming client-triggered achievements.
 *
 * Used by UI code that performs locally-persisted actions (e.g. toggling
 * notification preferences, saving a theme) which have matching achievement
 * definitions on the server.
 *
 * The claim is fire-and-forget — failure never blocks the UI.
 */

import { useCallback, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';

export function useClaimAchievement() {
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  return useCallback(
    (action: string) => {
      api.achievements.claim(action).catch(() => {});
    },
    [api],
  );
}
