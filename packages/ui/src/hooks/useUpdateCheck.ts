/**
 * Hook for detecting application updates.
 *
 * On web: polls /version.json and compares against the build-time version.
 * On desktop: listens for electron-updater IPC events from the main process.
 *   Supports a two-prompt flow (available -> download -> ready -> restart)
 *   when auto-download is disabled, or a single-prompt flow when enabled.
 * On mobile: no-op (updates are handled by app stores).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

export interface UseUpdateCheckResult {
  /** Current update status */
  status: UpdateStatus;
  /** Version string of the available/downloaded update (desktop only) */
  newVersion: string | null;
  /** Human-readable error detail from the main process (desktop only, when status is 'error') */
  errorMessage: string | null;
  /** Download progress data (desktop only, when status is 'downloading') */
  downloadProgress: DownloadProgress | null;
  /** Whether the app is currently applying / installing the update */
  installing: boolean;
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
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [installing, setInstalling] = useState(false);
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
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;

    if (!electron?.on || typeof electron.invoke !== 'function') return;

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

    cleanups.push(electron.on('download-progress', (...args: unknown[]) => {
      const payload = args[0] as { percent?: number; transferred?: number; total?: number } | undefined;
      if (payload) {
        setDownloadProgress({
          percent: payload.percent ?? 0,
          transferred: payload.transferred ?? 0,
          total: payload.total ?? 0,
        });
      }
      if (statusRef.current !== 'dismissed') {
        setStatus('downloading');
      }
    }));

    cleanups.push(electron.on('update-downloaded', () => {
      setDownloadProgress(null);
      setStatus('ready');
    }));

    cleanups.push(electron.on('update-error', (...args: unknown[]) => {
      const payload = args[0] as { message?: string } | undefined;
      setErrorMessage(payload?.message ?? null);
      setInstalling(false);
      setStatus('error');
    }));

    cleanups.push(electron.on('installer-cache-cleared', () => {
      setNewVersion(null);
      setErrorMessage(null);
      setDownloadProgress(null);
      setInstalling(false);
      setStatus('idle');
    }));

    void electron.invoke('renderer-update-ready');

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [platform]);

  const dismiss = useCallback(() => {
    setStatus('dismissed');
    setInstalling(false);
    if (typeof __APP_VERSION__ !== 'undefined') {
      dismissedVersionRef.current = __APP_VERSION__;
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (platform === 'web') {
      window.location.reload();
      return;
    }

    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;

    if (!electron) return;

    setInstalling(true);

    // Delay IPC call slightly so the overlay renders before the main process
    // blocks on the synchronous package-manager install (spawnSync).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        electron.invoke('install-update');
      });
    });
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

    setDownloadProgress(null);
    setStatus('downloading');
    electron.invoke('download-update');
  }, [platform]);

  return useMemo<UseUpdateCheckResult>(
    () => ({
      status,
      newVersion,
      errorMessage,
      downloadProgress,
      installing,
      dismiss,
      applyUpdate,
      checkForUpdates,
      downloadUpdate,
    }),
    [
      status,
      newVersion,
      errorMessage,
      downloadProgress,
      installing,
      dismiss,
      applyUpdate,
      checkForUpdates,
      downloadUpdate,
    ],
  );
}
