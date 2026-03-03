/**
 * Hook for detecting application updates.
 *
 * On web: polls /version.json and compares against the build-time version.
 * On desktop: listens for electron-updater IPC events from the main process.
 * On mobile: no-op (updates are handled by app stores).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlatform } from './usePlatform';

const POLL_INTERVAL_MS = 60_000;

export type UpdateStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'dismissed';

export interface UseUpdateCheckResult {
  /** Current update status */
  status: UpdateStatus;
  /** Dismiss the update notification until next version change or page load */
  dismiss: () => void;
  /** Apply the update (reload on web, quit-and-install on desktop) */
  applyUpdate: () => void;
}

/**
 * Detects when a new app version is available and provides controls
 * to dismiss or apply the update.
 *
 * @example
 * ```tsx
 * function UpdateBanner() {
 *   const { status, dismiss, applyUpdate } = useUpdateCheck();
 *   if (status === 'available') {
 *     return <Banner onRefresh={applyUpdate} onDismiss={dismiss} />;
 *   }
 *   return null;
 * }
 * ```
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const platform = usePlatform();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const statusRef = useRef(status);
  statusRef.current = status;
  const dismissedVersionRef = useRef<string | null>(null);

  // -- Web: poll /version.json --
  useEffect(() => {
    if (platform !== 'web') return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const currentVersion =
      typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;

    if (!currentVersion) return;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (
          data.version &&
          data.version !== currentVersion &&
          data.version !== dismissedVersionRef.current
        ) {
          setStatus('available');
        }
      } catch {
        // Silently retry on next interval
      }
    }

    check();
    timer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [platform]);

  // -- Desktop: listen for electron-updater IPC events --
  // Registered once; uses statusRef to avoid stale closure reads.
  useEffect(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      on: (channel: string, cb: (...args: unknown[]) => void) => void;
    } }).electron;

    if (!electron) return;

    electron.on('update-available', () => {
      if (statusRef.current !== 'dismissed') {
        setStatus('downloading');
      }
    });

    electron.on('download-progress', () => {
      if (statusRef.current !== 'dismissed') {
        setStatus('downloading');
      }
    });

    electron.on('update-downloaded', () => {
      setStatus('ready');
    });
  }, [platform]);

  const dismiss = useCallback(() => {
    setStatus('dismissed');
    if (typeof __APP_VERSION__ !== 'undefined') {
      dismissedVersionRef.current = __APP_VERSION__;
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (platform === 'web') {
      window.location.reload();
    } else if (platform === 'desktop') {
      const electron = (window as Window & { electron?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      } }).electron;

      electron?.invoke('install-update');
    }
  }, [platform]);

  return { status, dismiss, applyUpdate };
}
