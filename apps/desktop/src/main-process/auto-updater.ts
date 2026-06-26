import path from 'path';
import fs from 'fs/promises';
import { spawn } from 'child_process';
import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import {
  removeUpdaterCacheDirectory,
  resolveUpdaterCacheDirectory,
  type ClearInstallerCacheResult,
} from './clear-installer-cache';
import {
  DEFAULT_UPDATE_PREFS,
  MIN_CHECK_INTERVAL_MINUTES,
  normalizeUpdatePreferences,
  type UpdatePreferences,
} from './update-preferences';
import { appendInAppUpdateLog } from './update-in-app-log';

const { autoUpdater } = electronUpdater;

const UPDATE_PREFS_FILE = 'update-preferences.json';

export type { UpdatePreferences };
export {
  DEFAULT_UPDATE_PREFS,
  MIN_CHECK_INTERVAL_MINUTES,
  normalizeUpdatePreferences,
} from './update-preferences';

export async function readUpdatePreferences(): Promise<UpdatePreferences> {
  try {
    const filePath = path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpdatePreferences>;
    return normalizeUpdatePreferences(parsed);
  } catch {
    return { ...DEFAULT_UPDATE_PREFS };
  }
}

export async function writeUpdatePreferences(prefs: UpdatePreferences): Promise<void> {
  const filePath = path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
  await fs.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
}

let updateCheckTimer: ReturnType<typeof setInterval> | null = null;
let lastProgressLogBucket = -1;

export function resetElectronUpdaterQuitAndInstallGuard(): void {
  const updater = autoUpdater as unknown as { quitAndInstallCalled?: boolean };
  updater.quitAndInstallCalled = false;
}

export function scheduleUpdateChecks(intervalMinutes: number): void {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  const ms = Math.max(intervalMinutes, MIN_CHECK_INTERVAL_MINUTES) * 60 * 1000;
  updateCheckTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[AutoUpdater] Periodic check failed:', err);
    });
  }, ms);
}

export function clearUpdateCheckTimer(): void {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}

let deferredInitialUpdateCheckDone = false;

/**
 * Run once after the renderer has registered IPC listeners so update events
 * (including update-downloaded for a cached installer) are not missed.
 */
export function runDeferredInitialUpdateCheck(): void {
  if (deferredInitialUpdateCheckDone) return;
  deferredInitialUpdateCheckDone = true;

  void readUpdatePreferences().then((prefs) => {
    if (!prefs.autoCheckEnabled) return;
    const isDev = process.env.NODE_ENV === 'development';
    if (isUpdaterInactiveInDev(isDev)) return;
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[AutoUpdater] Initial check failed:', err);
    });
  });
}

function isUpdaterInactiveInDev(isDev: boolean): boolean {
  return isDev && !process.env.ADIEUU_UPDATE_SERVER_URL;
}

export async function initAutoUpdater(options: {
  isDev: boolean;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}): Promise<void> {
  const { isDev, sendToRenderer } = options;
  const initPrefs = await readUpdatePreferences();
  autoUpdater.autoDownload = initPrefs.autoDownloadEnabled;
  autoUpdater.autoInstallOnAppQuit = !isDev;

  autoUpdater.requestHeaders = { 'User-Agent': 'Adieuu-Desktop-Updater' };

  if (isDev && process.env.ADIEUU_UPDATE_SERVER_URL) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: process.env.ADIEUU_UPDATE_SERVER_URL,
    });
    console.info(
      '[AutoUpdater] Feed URL overridden:',
      process.env.ADIEUU_UPDATE_SERVER_URL,
    );
  }

  autoUpdater.on('checking-for-update', () => {
    void appendInAppUpdateLog('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    lastProgressLogBucket = -1;
    console.info('[AutoUpdater] Update available:', info.version);
    void appendInAppUpdateLog(`update-available version=${info.version} autoDownload=${String(autoUpdater.autoDownload)}`);
    sendToRenderer('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      autoDownloading: autoUpdater.autoDownload,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    lastProgressLogBucket = -1;
    const v = info != null && typeof (info as { version?: string }).version === 'string'
      ? (info as { version: string }).version
      : null;
    void appendInAppUpdateLog(
      v != null
        ? `update-not-available latest=${v}`
        : 'update-not-available',
    );
    sendToRenderer('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    const bucket = Math.floor(progress.percent / 25);
    if (bucket !== lastProgressLogBucket) {
      lastProgressLogBucket = bucket;
      void appendInAppUpdateLog(
        `download-progress ${progress.percent.toFixed(1)}% ${progress.transferred}/${progress.total} bytes`,
      );
    }
    sendToRenderer('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    resetElectronUpdaterQuitAndInstallGuard();
    console.info('[AutoUpdater] Update downloaded:', info.version);
    lastProgressLogBucket = -1;
    void appendInAppUpdateLog(`update-downloaded version=${info.version}`);
    sendToRenderer('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    void appendInAppUpdateLog(`error ${err.message}`);
    lastProgressLogBucket = -1;
    sendToRenderer('update-error', { message: err.message });
  });

  if (isUpdaterInactiveInDev(isDev)) {
    console.info('[AutoUpdater] Dev mode without ADIEUU_UPDATE_SERVER_URL; auto-check disabled.');
    return;
  }

  if (initPrefs.autoCheckEnabled) {
    scheduleUpdateChecks(initPrefs.checkIntervalMinutes);
  }
}

export function registerAutoUpdaterIpc(options: {
  isDev: boolean;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}): void {
  const { isDev, sendToRenderer } = options;

  ipcMain.handle('renderer-update-ready', () => {
    runDeferredInitialUpdateCheck();
  });

  ipcMain.handle('download-update', async () => {
    void appendInAppUpdateLog('download-update IPC (manual) started');
    try {
      await autoUpdater.downloadUpdate();
      void appendInAppUpdateLog('download-update IPC completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      void appendInAppUpdateLog(`download-update IPC failed: ${message}`);
      console.error('[AutoUpdater] Download failed:', message);
      sendToRenderer('update-error', { message });
    }
  });

  ipcMain.handle('install-update', () => {
    if (isDev) {
      console.info('[AutoUpdater] Dev mode: install-update called (no-op)');
      void appendInAppUpdateLog('install-update IPC (dev no-op)');
      return;
    }

    const INSTALL_TIMEOUT_S = 60;

    void appendInAppUpdateLog(
      `install-update IPC → quitAndInstall pid=${process.pid} platform=${process.platform} arch=${process.arch}`,
    );

    // On Linux, quitAndInstall() can block the event loop indefinitely via
    // a synchronous package-manager install (spawnSync + pkexec). Spawn a
    // watchdog process that force-kills us if we don't exit in time.
    if (process.platform === 'linux') {
      try {
        const pid = process.pid;
        const cmd = [
          `sleep ${INSTALL_TIMEOUT_S}`,
          `[ -e /proc/${pid}/exe ] && kill -9 ${pid} 2>/dev/null || true`,
        ].join('; ');
        const watchdog = spawn('/bin/sh', ['-c', cmd], {
          detached: true,
          stdio: 'ignore',
        });
        watchdog.unref();
      } catch (e) {
        console.warn('[AutoUpdater] Failed to spawn install watchdog:', e);
      }
    }

    // Fallback for non-blocking failures: if quitAndInstall() returns
    // without exiting the process, force-exit after the timeout.
    const fallback = setTimeout(() => {
      console.error('[AutoUpdater] quitAndInstall did not exit, forcing exit');
      void appendInAppUpdateLog('install-update fallback force exit');
      process.exit(1);
    }, INSTALL_TIMEOUT_S * 1000);
    fallback.unref();

    autoUpdater.quitAndInstall();
  });

  ipcMain.handle('get-update-preferences', async () => {
    return readUpdatePreferences();
  });

  ipcMain.handle('set-update-preferences', async (_event, prefs: Partial<UpdatePreferences>) => {
    const current = await readUpdatePreferences();
    const updated: UpdatePreferences = {
      autoCheckEnabled: typeof prefs.autoCheckEnabled === 'boolean'
        ? prefs.autoCheckEnabled
        : current.autoCheckEnabled,
      autoDownloadEnabled: typeof prefs.autoDownloadEnabled === 'boolean'
        ? prefs.autoDownloadEnabled
        : current.autoDownloadEnabled,
      checkIntervalMinutes: typeof prefs.checkIntervalMinutes === 'number'
          && prefs.checkIntervalMinutes >= MIN_CHECK_INTERVAL_MINUTES
        ? prefs.checkIntervalMinutes
        : current.checkIntervalMinutes,
    };
    await writeUpdatePreferences(updated);

    autoUpdater.autoDownload = updated.autoDownloadEnabled;

    if (updated.autoCheckEnabled) {
      scheduleUpdateChecks(updated.checkIntervalMinutes);
    } else if (updateCheckTimer) {
      clearInterval(updateCheckTimer);
      updateCheckTimer = null;
    }

    return updated;
  });

  ipcMain.handle('check-for-updates', async () => {
    void appendInAppUpdateLog('check-for-updates IPC (manual) started');
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update check failed';
      void appendInAppUpdateLog(`check-for-updates IPC failed: ${message}`);
      console.error('[AutoUpdater] Manual check failed:', message);
      sendToRenderer('update-error', { message });
    }
  });

  ipcMain.handle('clear-installer-cache', async (): Promise<ClearInstallerCacheResult> => {
    void appendInAppUpdateLog('clear-installer-cache IPC started');
    try {
      const cacheDir = await resolveUpdaterCacheDirectory(app);
      await removeUpdaterCacheDirectory(cacheDir);
      try {
        const updater = autoUpdater as unknown as { downloadedUpdateHelper: null };
        updater.downloadedUpdateHelper = null;
        resetElectronUpdaterQuitAndInstallGuard();
      } catch (e) {
        console.warn('[AutoUpdater] Could not reset downloadedUpdateHelper (cache still cleared):', e);
      }
      try {
        sendToRenderer('installer-cache-cleared');
      } catch (e) {
        console.warn('[AutoUpdater] Could not notify renderer of cache clear:', e);
      }
      void appendInAppUpdateLog(`clear-installer-cache ok path=${cacheDir}`);
      console.info('[AutoUpdater] Cleared installer cache:', cacheDir);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not clear update cache';
      void appendInAppUpdateLog(`clear-installer-cache failed: ${message}`);
      console.error('[AutoUpdater] Clear installer cache failed:', message);
      return { ok: false, error: message };
    }
  });
}
