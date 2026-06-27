import { useState, useEffect, useRef, useCallback } from 'react';
import type { ApiResponse, SubscriptionStatus } from '@adieuu/shared';
import { subscriptionPurchaseApplied } from '../utils/subscription-purchase-detect';

export type CheckoutPollPhase = 'idle' | 'pending' | 'completed' | 'cancelled' | 'timeout';

type SubscriptionPollingApi = {
  subscription: {
    getStatus: () => Promise<ApiResponse<SubscriptionStatus>>;
  };
};

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_MAX_DURATION_MS = 15 * 60 * 1000;

export interface UseCheckoutPollingRun {
  baseline: SubscriptionStatus;
}

/**
 * Polls `GET /api/account/subscription` until billing changes vs `run.baseline`,
 * the user cancels, or `maxDurationMs` elapses.
 */
export function useCheckoutPolling(
  api: SubscriptionPollingApi,
  run: UseCheckoutPollingRun | null,
  options?: { intervalMs?: number; maxDurationMs?: number },
): { phase: CheckoutPollPhase; cancel: () => void } {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxDurationMs = options?.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  const [phase, setPhase] = useState<CheckoutPollPhase>('idle');
  const cancelledRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    clearTimers();
    setPhase((p) => (p === 'pending' ? 'cancelled' : p));
  }, [clearTimers]);

  useEffect(() => {
    if (!run) {
      cancelledRef.current = false;
      clearTimers();
      // Only clear an in-flight poll; keep terminal phases until the next run starts.
      setPhase((p) => (p === 'pending' ? 'idle' : p));
      return;
    }

    const { baseline } = run;
    cancelledRef.current = false;
    setPhase('pending');

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const res = await api.subscription.getStatus();
        if (cancelledRef.current) return;
        if (res.success && res.data && subscriptionPurchaseApplied(baseline, res.data)) {
          clearTimers();
          setPhase('completed');
        }
      } catch {
        // Transient errors — keep polling until timeout or cancel.
      }
    };

    void tick();
    intervalRef.current = setInterval(() => void tick(), intervalMs);
    timeoutRef.current = setTimeout(() => {
      if (cancelledRef.current) return;
      clearTimers();
      setPhase('timeout');
    }, maxDurationMs);

    return () => {
      cancelledRef.current = true;
      clearTimers();
    };
  }, [run, api, intervalMs, maxDurationMs, clearTimers]);

  return { phase, cancel };
}
