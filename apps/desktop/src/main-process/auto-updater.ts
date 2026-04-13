import path from 'path';
import fs from 'fs/promises';
import { app, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import {
  DEFAULT_UPDATE_PREFS,
  MIN_CHECK_INTERVAL_MINUTES,
  normalizeUpdatePreferences,
  type UpdatePreferences,
} from './update-preferences';

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

  autoUpdater.on('update-available', (info) => {
    console.info('[AutoUpdater] Update available:', info.version);
    sendToRenderer('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      autoDownloading: autoUpdater.autoDownload,
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendToRenderer('update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendToRenderer('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    resetElectronUpdaterQuitAndInstallGuard();
    console.info('[AutoUpdater] Update downloaded:', info.version);
    sendToRenderer('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
    sendToRenderer('update-error', { message: err.message });
  });

  if (isDev && !process.env.ADIEUU_UPDATE_SERVER_URL) {
    console.info('[AutoUpdater] Dev mode without ADIEUU_UPDATE_SERVER_URL; auto-check disabled.');
    return;
  }

  if (initPrefs.autoCheckEnabled) {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[AutoUpdater] Initial check failed:', err);
    });
    scheduleUpdateChecks(initPrefs.checkIntervalMinutes);
  }
}

export function registerAutoUpdaterIpc(options: {
  isDev: boolean;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}): void {
  const { isDev, sendToRenderer } = options;

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      console.error('[AutoUpdater] Download failed:', message);
      sendToRenderer('update-error', { message });
    }
  });

  ipcMain.handle('install-update', () => {
    if (isDev) {
      console.info('[AutoUpdater] Dev mode: install-update called (no-op)');
      return;
    }
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
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Update check failed';
      console.error('[AutoUpdater] Manual check failed:', message);
      sendToRenderer('update-error', { message });
    }
  });
}
