import { useEffect, useRef, useCallback, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import { emitSubscriptionUpgraded } from '../services/subscriptionEvents';

const DEFAULT_INTERVAL_MS = 4000;

export interface UseAccountEventPollingOptions {
  intervalMs?: number;
  enabled?: boolean;
}

/**
 * Polls `GET /api/account/events/pending` while the user has an account session.
 */
export function useAccountEventPolling(
  options?: UseAccountEventPollingOptions,
): { dismiss: (eventId: string) => Promise<void> } {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const enabled = options?.enabled ?? true;
  const { status } = useAuth();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(
    async (eventId: string) => {
      try {
        await api.accountEvents.dismiss({ eventId });
      } catch {
        // Best-effort; client dedup prevents re-showing the same event.
      }
    },
    [api],
  );

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (!enabled || status !== 'authenticated') return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;

      try {
        const res = await api.accountEvents.getPending();
        if (!res.success || !res.data) return;

        for (const event of res.data.events) {
          if (event.type === 'subscription_upgraded') {
            emitSubscriptionUpgraded(event);
          }
        }
      } catch {
        // Transient errors — keep polling.
      } finally {
        if (!cancelled) {
          timeoutRef.current = setTimeout(() => void tick(), intervalMs);
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [api, enabled, intervalMs, status]);

  return { dismiss };
}
