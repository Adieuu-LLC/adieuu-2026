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
  | 'awaiting_user'
  | 'polling'
  | 'approved'
  | 'failed'
  | 'expired';

interface MethodAttemptInfo {
  enabled: boolean;
  remaining: number;
}

export interface UseAgeVerificationReturn {
  status: AgeVerificationUIStatus;
  verificationId?: string;
  ageGate?: Record<string, MethodAttemptInfo>;
  start: () => Promise<void>;
  optIn: (country?: string) => Promise<void>;
  cancel: () => void;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 15000;

export function useAgeVerification(): UseAgeVerificationReturn {
  const { apiBaseUrl } = useAppConfig();
  const { refreshSession } = useAuth();
  const platform = usePlatform();

  const [status, setStatus] = useState<AgeVerificationUIStatus>('idle');
  const [verificationId, setVerificationId] = useState<string>();
  const [ageGate, setAgeGate] = useState<Record<string, MethodAttemptInfo>>();
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  const providerVerificationIdRef = useRef<string>();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopPolling();
    setStatus('idle');
    setVerificationId(undefined);
    setAgeGate(undefined);
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
          pollingRef.current = setTimeout(() => pollStatus(pvId, nextInterval), nextInterval);
        }
      } catch {
        if (!cancelledRef.current) {
          const nextInterval = Math.min(interval * 2, MAX_POLL_INTERVAL_MS);
          pollingRef.current = setTimeout(() => pollStatus(pvId, nextInterval), nextInterval);
        }
      }
    },
    [apiBaseUrl, refreshSession, stopPolling],
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
          setStatus('failed');
          return;
        }

        const json = (await response.json()) as {
          data?: {
            verificationId: string;
            providerVerificationId: string;
            status: string;
            redirectUrl?: string;
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

        if (data.redirectUrl) {
          setStatus('awaiting_user');
          await openVerificationUrl(data.redirectUrl, platform);
          pollingRef.current = setTimeout(
            () => pollStatus(data.providerVerificationId, POLL_INTERVAL_MS),
            POLL_INTERVAL_MS,
          );
        } else {
          setStatus('polling');
          pollingRef.current = setTimeout(
            () => pollStatus(data.providerVerificationId, POLL_INTERVAL_MS),
            POLL_INTERVAL_MS,
          );
        }
      } catch {
        setStatus('failed');
      }
    },
    [apiBaseUrl, platform, pollStatus, refreshSession],
  );

  const start = useCallback(() => startFlow('age-verification/start'), [startFlow]);

  const optIn = useCallback(
    (country?: string) => startFlow('age-verification/opt-in', { country }),
    [startFlow],
  );

  // Listen for postMessage from callback page
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'age-verification-callback') {
        const callbackStatus = event.data.status;
        if (callbackStatus === 'approved') {
          setStatus('approved');
          stopPolling();
          refreshSession();
        } else if (callbackStatus === 'failed') {
          setStatus('failed');
          stopPolling();
          refreshSession();
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshSession, stopPolling]);

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  return { status, verificationId, ageGate, start, optIn, cancel };
}
