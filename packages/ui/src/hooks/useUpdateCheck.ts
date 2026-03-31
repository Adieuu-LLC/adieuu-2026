/**
 * Hook for detecting application updates.
 *
 * On web: polls /version.json and compares against the build-time version.
 * On desktop: listens for electron-updater IPC events from the main process.
 *   Supports a two-prompt flow (available -> download -> ready -> restart)
 *   when auto-download is disabled, or a single-prompt flow when enabled.
 * On mobile: no-op (updates are handled by app stores).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePlatform } from './usePlatform';

const POLL_INTERVAL_MS = 60_000;

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'error'
  | 'dismissed';

export interface UseUpdateCheckResult {
  /** Current update status */
  status: UpdateStatus;
  /** Version string of the available/downloaded update (desktop only) */
  newVersion: string | null;
  /** Human-readable error detail from the main process (desktop only, when status is 'error') */
  errorMessage: string | null;
  /** Dismiss the update notification until next version change or page load */
  dismiss: () => void;
  /** Apply the update (reload on web, quit-and-install on desktop) */
  applyUpdate: () => void;
  /** Manually trigger an update check (desktop only) */
  checkForUpdates: () => void;
  /** Start downloading the available update (desktop only, when auto-download is off) */
  downloadUpdate: () => void;
}

/**
 * Detects when a new app version is available and provides controls
 * to dismiss or apply the update.
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const platform = usePlatform();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
  useEffect(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      on: (channel: string, cb: (...args: unknown[]) => void) => () => void;
    } }).electron;

    if (!electron) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(electron.on('update-available', (...args: unknown[]) => {
      const payload = args[0] as { version?: string; autoDownloading?: boolean } | undefined;
      if (payload?.version) {
        setNewVersion(payload.version);
      }
      if (statusRef.current !== 'dismissed') {
        if (payload?.autoDownloading) {
          setStatus('downloading');
        } else {
          setStatus('available');
        }
      }
    }));

    cleanups.push(electron.on('update-not-available', () => {
      setStatus('up-to-date');
    }));

    cleanups.push(electron.on('download-progress', () => {
      if (statusRef.current !== 'dismissed') {
        setStatus('downloading');
      }
    }));

    cleanups.push(electron.on('update-downloaded', () => {
      setStatus('ready');
    }));

    cleanups.push(electron.on('update-error', (...args: unknown[]) => {
      const payload = args[0] as { message?: string } | undefined;
      setErrorMessage(payload?.message ?? null);
      setStatus('error');
    }));

    return () => {
      cleanups.forEach((fn) => fn());
    };
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

  const checkForUpdates = useCallback(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;

    if (!electron) return;

    setStatus('checking');
    electron.invoke('check-for-updates');
  }, [platform]);

  const downloadUpdate = useCallback(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;

    if (!electron) return;

    setStatus('downloading');
    electron.invoke('download-update');
  }, [platform]);

  return { status, newVersion, errorMessage, dismiss, applyUpdate, checkForUpdates, downloadUpdate };
}
