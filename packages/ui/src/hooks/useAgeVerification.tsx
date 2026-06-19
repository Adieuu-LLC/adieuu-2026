/**
 * Age verification hook.
 *
 * Manages the verification lifecycle: start, poll status, opt-in.
 * Returns UI-friendly state and the age_gate per-method breakdown.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import { usePlatform } from './usePlatform';
import { openVerificationUrl } from '../services/openVerificationUrl';

export type AgeVerificationUIStatus =
  | 'idle'
  | 'starting'
  | 'email_check_inconclusive'
  | 'awaiting_user'
  | 'polling'
  | 'approved'
  | 'failed'
  | 'expired'
  | 'subscription_required';

interface MethodAttemptInfo {
  enabled: boolean;
  maxAttempts: number;
  remaining: number;
}

export interface UseAgeVerificationReturn {
  status: AgeVerificationUIStatus;
  verificationId?: string;
  ageGate?: Record<string, MethodAttemptInfo>;
  /** Seconds until the next status poll, or null when not polling. */
  secondsUntilNextPoll: number | null;
  /** Present when status is 'subscription_required'; distinguishes SUBSCRIPTION_REQUIRED from SUBSCRIPTION_EXPIRED. */
  billingCode?: string;
  start: () => Promise<void>;
  optIn: (country?: string) => Promise<void>;
  /** Opens the stored VerifyMy interactive flow URL after an inconclusive email check. */
  continueInteractive: () => Promise<void>;
  cancel: () => void;
}

const POLL_INTERVAL_MS = 15000;
const MAX_POLL_INTERVAL_MS = 30000;

export function useAgeVerification(): UseAgeVerificationReturn {
  const { apiBaseUrl } = useAppConfig();
  const { refreshSession } = useAuth();
  const platform = usePlatform();

  const [status, setStatus] = useState<AgeVerificationUIStatus>('idle');
  const [verificationId, setVerificationId] = useState<string>();
  const [ageGate, setAgeGate] = useState<Record<string, MethodAttemptInfo>>();
  const [billingCode, setBillingCode] = useState<string>();
  const [secondsUntilNextPoll, setSecondsUntilNextPoll] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const providerVerificationIdRef = useRef<string>();
  const pendingRedirectUrlRef = useRef<string>();

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setSecondsUntilNextPoll(null);
  }, []);

  const startCountdown = useCallback((intervalMs: number) => {
    stopCountdown();
    setSecondsUntilNextPoll(Math.ceil(intervalMs / 1000));
    countdownRef.current = setInterval(() => {
      setSecondsUntilNextPoll((prev) => {
        if (prev === null || prev <= 1) return null;
        return prev - 1;
      });
    }, 1000);
  }, [stopCountdown]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
    stopCountdown();
  }, [stopCountdown]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopPolling();
    setStatus('idle');
    setVerificationId(undefined);
    setAgeGate(undefined);
    setBillingCode(undefined);
    pendingRedirectUrlRef.current = undefined;
  }, [stopPolling]);

  const pollStatus = useCallback(
    async (pvId: string, interval: number) => {
      if (cancelledRef.current) return;

      try {
        const response = await fetch(`${apiBaseUrl}/api/age-verification/status?id=${encodeURIComponent(pvId)}`, {
          credentials: 'include',
        });

        if (!response.ok) return;

        const json = (await response.json()) as {
          data?: {
            status: string;
            methodAttempts?: Record<string, MethodAttemptInfo>;
          };
        };

        const data = json.data;
        if (!data) return;

        if (data.methodAttempts) {
          setAgeGate(data.methodAttempts);
        }

        if (data.status === 'approved') {
          setStatus('approved');
          stopPolling();
          await refreshSession();
          return;
        }
        if (data.status === 'failed') {
          setStatus('failed');
          stopPolling();
          await refreshSession();
          return;
        }
        if (data.status === 'expired') {
          setStatus('expired');
          stopPolling();
          await refreshSession();
          return;
        }

        if (data.status === 'pending') {
          setStatus('polling');
        }

        if (!cancelledRef.current) {
          const nextInterval = Math.min(interval * 1.5, MAX_POLL_INTERVAL_MS);
          startCountdown(nextInterval);
          pollingRef.current = setTimeout(() => pollStatus(pvId, nextInterval), nextInterval);
        }
      } catch {
        if (!cancelledRef.current) {
          const nextInterval = Math.min(interval * 2, MAX_POLL_INTERVAL_MS);
          startCountdown(nextInterval);
          pollingRef.current = setTimeout(() => pollStatus(pvId, nextInterval), nextInterval);
        }
      }
    },
    [apiBaseUrl, refreshSession, startCountdown, stopPolling],
  );

  const startFlow = useCallback(
    async (endpoint: string, body?: Record<string, unknown>) => {
      cancelledRef.current = false;
      setStatus('starting');

      try {
        const response = await fetch(`${apiBaseUrl}/api/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          try {
            const errJson = (await response.json()) as { code?: string };
            if (errJson?.code === 'SUBSCRIPTION_REQUIRED' || errJson?.code === 'SUBSCRIPTION_EXPIRED') {
              setBillingCode(errJson.code);
              setStatus('subscription_required');
              return;
            }
          } catch { /* fall through to generic failure */ }
          setStatus('failed');
          return;
        }

        const json = (await response.json()) as {
          data?: {
            verificationId: string;
            providerVerificationId: string;
            status: string;
            redirectUrl?: string;
            backgroundCheckAttempted?: boolean;
          };
        };

        const data = json.data;
        if (!data) {
          setStatus('failed');
          return;
        }

        setVerificationId(data.verificationId);
        providerVerificationIdRef.current = data.providerVerificationId;

        if (data.status === 'approved') {
          setStatus('approved');
          await refreshSession();
          return;
        }

        if (data.backgroundCheckAttempted && data.redirectUrl) {
          pendingRedirectUrlRef.current = data.redirectUrl;
          setStatus('email_check_inconclusive');
        } else if (data.redirectUrl) {
          setStatus('awaiting_user');
          await openVerificationUrl(data.redirectUrl, platform);
          startCountdown(POLL_INTERVAL_MS);
          pollingRef.current = setTimeout(
            () => pollStatus(data.providerVerificationId, POLL_INTERVAL_MS),
            POLL_INTERVAL_MS,
          );
        } else {
          setStatus('polling');
          startCountdown(POLL_INTERVAL_MS);
          pollingRef.current = setTimeout(
            () => pollStatus(data.providerVerificationId, POLL_INTERVAL_MS),
            POLL_INTERVAL_MS,
          );
        }
      } catch {
        setStatus('failed');
      }
    },
    [apiBaseUrl, platform, pollStatus, refreshSession, startCountdown],
  );

  const start = useCallback(() => startFlow('age-verification/start'), [startFlow]);

  const optIn = useCallback(
    (country?: string) => startFlow('age-verification/opt-in', { country }),
    [startFlow],
  );

  const continueInteractive = useCallback(async () => {
    const url = pendingRedirectUrlRef.current;
    const pvId = providerVerificationIdRef.current;
    if (!url || !pvId) return;

    pendingRedirectUrlRef.current = undefined;
    setStatus('awaiting_user');
    await openVerificationUrl(url, platform);
    startCountdown(POLL_INTERVAL_MS);
    pollingRef.current = setTimeout(
      () => pollStatus(pvId, POLL_INTERVAL_MS),
      POLL_INTERVAL_MS,
    );
  }, [platform, pollStatus, startCountdown]);

  // Listen for postMessage from callback page (origin-checked)
  useEffect(() => {
    const expectedOrigin = apiBaseUrl || window.location.origin;
    const handler = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;
      if (event.data?.type === 'age-verification-callback') {
        const callbackStatus = event.data.status;
        if (callbackStatus === 'approved' || callbackStatus === 'failed' || callbackStatus === 'expired') {
          setStatus(callbackStatus as AgeVerificationUIStatus);
          stopPolling();
          refreshSession();
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [apiBaseUrl, refreshSession, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  return { status, verificationId, ageGate, billingCode, secondsUntilNextPoll, start, optIn, continueInteractive, cancel };
}
