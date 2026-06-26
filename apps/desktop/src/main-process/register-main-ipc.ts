import path from 'path';
import fs from 'fs/promises';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { createCredential, getCredential } from '../webauthn-bridge';
import { runtime } from './runtime';
import { applyBadgeColor, applyDotColor, createBadgedIcon, getBaseIcon } from './taskbar-badge';
import { isTrayActive, setTrayBadge, getTrayUnreadState } from './tray';
import { registerAutoUpdaterIpc } from './auto-updater';
import { forceQuitApp } from './force-quit';
import { registerVerificationWindowIpc } from './verification-window';
import { isAllowedAudioPath } from './audio-path';
import { ensureInAppUpdateLogFileForOpen, getInAppUpdateLogPath } from './update-in-app-log';
import { openExternalHttpsUrl } from './open-external-https';
import { saveMainWindowLayoutIfChanged } from './window-state';
import {
  readClosePreferences,
  writeClosePreferences,
  normalizeClosePreferences,
  getCachedClosePreferences,
  type ClosePreferences,
} from './close-preferences';

export function registerMainProcessIpc(options: {
  isDev: boolean;
  isMac: boolean;
  iconPath: string;
  sendToRenderer: (channel: string, ...args: unknown[]) => void;
}): void {
  const { isDev, isMac, iconPath, sendToRenderer } = options;

  ipcMain.handle('webauthn:create', async (_event, optionsJSON: unknown) => {
    return createCredential(optionsJSON);
  });

  ipcMain.handle('webauthn:get', async (_event, optionsJSON: unknown) => {
    return getCredential(optionsJSON);
  });

  registerAutoUpdaterIpc({ isDev, sendToRenderer });
  registerVerificationWindowIpc();

  ipcMain.handle('get-pending-deep-link', () => {
    const link = runtime.pendingDeepLinkPath;
    runtime.pendingDeepLinkPath = null;
    return link;
  });

  ipcMain.handle(
    'app:open-external-url',
    async (_event, url: unknown): Promise<{ ok: true } | { ok: false; error: string }> => {
      return openExternalHttpsUrl(url);
    },
  );

  /** Terminate the application (all windows). Distinct from `window:close`, which closes one window. */
  ipcMain.handle('app:quit', () => {
    forceQuitApp();
  });

  ipcMain.handle('restart-app', () => {
    app.relaunch();
    app.exit(0);
  });

  /** Opens %LOCALAPPDATA%\\Adieuu\\logs\\installer.log with the default app (Windows only). */
  ipcMain.handle('open-windows-installer-log', async () => {
    if (process.platform !== 'win32') {
      return { ok: false as const, error: 'Only available on Windows.' };
    }
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData == null || localAppData.length === 0) {
      return { ok: false as const, error: 'LOCALAPPDATA is not available.' };
    }
    const logFile = path.join(localAppData, 'Adieuu', 'logs', 'installer.log');
    const message = await shell.openPath(logFile);
    if (message.length > 0) {
      return { ok: false as const, error: message };
    }
    return { ok: true as const };
  });

  /** Absolute path to userData/logs/update.log (electron-updater in-app log on all OSes). */
  ipcMain.handle('get-in-app-update-log-path', () => ({ path: getInAppUpdateLogPath() }));

  /** Opens the in-app update log with the system default app (e.g. editor for .log). */
  ipcMain.handle('open-in-app-update-log', async () => {
    try {
      await ensureInAppUpdateLogFileForOpen();
      const p = getInAppUpdateLogPath();
      const message = await shell.openPath(p);
      if (message.length > 0) {
        // Linux: xdg-open often reports exit code 4 ("The action failed") even when the handler opened
        // the file; Chromium maps that to this string. Treat as success to avoid a false error toast.
        if (process.platform === 'linux' && message === 'The action failed') {
          return { ok: true as const };
        }
        return { ok: false as const, error: message };
      }
      return { ok: true as const };
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: err };
    }
  });

  ipcMain.handle('window:minimize', () => {
    runtime.mainWindow?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    if (runtime.mainWindow?.isMaximized()) {
      runtime.mainWindow.unmaximize();
    } else {
      runtime.mainWindow?.maximize();
    }
  });

  ipcMain.handle('window:close', () => {
    const win = runtime.mainWindow;
    if (!win || win.isDestroyed()) return;
    // The actual close/tray logic is handled by the BrowserWindow `close`
    // event interceptor in create-main-window.ts. Just trigger the native
    // close flow so the same code path runs for both the custom title bar
    // and macOS traffic lights.
    win.close();
  });

  ipcMain.handle('window:get-close-preferences', async () => {
    return readClosePreferences();
  });

  ipcMain.handle('window:set-close-preferences', async (_event, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return;
    const current = getCachedClosePreferences();
    const merged = normalizeClosePreferences({ ...current, ...(patch as Partial<ClosePreferences>) });
    await writeClosePreferences(merged);
  });

  ipcMain.handle('window:isMaximized', () => {
    return runtime.mainWindow?.isMaximized() ?? false;
  });

  ipcMain.handle('window:setFullScreen', (_event, fullScreen: unknown) => {
    if (typeof fullScreen !== 'boolean') return;
    runtime.mainWindow?.setFullScreen(fullScreen);
  });

  ipcMain.handle('window:isFullScreen', () => {
    return runtime.mainWindow?.isFullScreen() ?? false;
  });

  ipcMain.handle('window:save-bounds-if-changed', () => {
    saveMainWindowLayoutIfChanged();
  });

  ipcMain.handle('window:setBadgeCount', (_event, count: unknown, accentHex?: unknown, secondaryHex?: unknown) => {
    if (typeof count !== 'number' || count < 0) return;
    const rounded = Math.round(count);

    let trayNeedsRedraw = false;

    if (typeof accentHex === 'string') {
      if (applyBadgeColor(accentHex)) trayNeedsRedraw = true;
    }
    if (typeof secondaryHex === 'string') {
      if (applyDotColor(secondaryHex)) trayNeedsRedraw = true;
    }

    if (trayNeedsRedraw && isTrayActive()) {
      setTrayBadge(getTrayUnreadState());
    }

    app.setBadgeCount(rounded);

    if (!isMac && runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
      const icon = rounded > 0 ? createBadgedIcon(iconPath, rounded) : getBaseIcon(iconPath);
      if (icon) runtime.mainWindow.setIcon(icon);
    }

    setTrayBadge(rounded > 0);
  });

  ipcMain.handle('audio:pick-sound-file', async () => {
    const parent = runtime.mainWindow ?? BrowserWindow.getFocusedWindow();
    const dialogOptions: Electron.OpenDialogOptions = {
      title: 'Choose notification sound',
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'oga'] }],
    };
    try {
      const result = parent
        ? await dialog.showOpenDialog(parent, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      if (result.canceled || !result.filePaths[0]) {
        return null;
      }
      const filePath = result.filePaths[0];
      if (!isAllowedAudioPath(filePath)) {
        return null;
      }
      return { name: path.basename(filePath), path: filePath };
    } catch (err) {
      console.error('[audio:pick-sound-file] dialog failed:', err);
      return null;
    }
  });

  ipcMain.handle('audio:load-sound-file', async (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || filePath.length === 0) {
      return null;
    }
    if (!isAllowedAudioPath(filePath)) {
      return null;
    }
    try {
      const buf = await fs.readFile(filePath);
      return buf.toString('base64');
    } catch {
      return null;
    }
  });
}
