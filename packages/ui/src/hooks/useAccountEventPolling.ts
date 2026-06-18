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

    const isHidden = () =>
      typeof document !== 'undefined' && document.hidden;

    const scheduleNext = () => {
      if (cancelled || isHidden()) return;
      timeoutRef.current = setTimeout(() => void tick(), intervalMs);
    };

    const tick = async () => {
      // Pause polling while the tab is backgrounded. These events only drive
      // celebratory subscription-upgrade toasts the user can't act on while
      // away; security enforcement (bans/suspensions/billing) happens
      // server-side on every request, independent of this poll.
      if (cancelled || isHidden()) return;

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
        scheduleNext();
      }
    };

    const handleVisibilityChange = () => {
      if (isHidden()) {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      } else {
        // Refocused: catch up immediately, then resume the interval.
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        void tick();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (!isHidden()) void tick();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [api, enabled, intervalMs, status]);

  return { dismiss };
}
