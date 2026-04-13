import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import { registerSecureStorageIpc } from './ipc/secureStorage';
import { destroyBridgeWindow } from './webauthn-bridge';
import { getMainDirname, loadDesktopEnvIfPresent } from './main-process/load-desktop-env';
import { getCustomScheme, registerPrivilegedCustomScheme } from './main-process/scheme';
import { applyLinuxPasswordStore } from './main-process/linux-password-store';
import { extractDeepLinkPath } from './main-process/deep-link';
import { runtime } from './main-process/runtime';
import { shouldEnableCookieBridge, setupAdieuuCookieBridge } from './main-process/cookie-bridge';
import { registerProtocolHandler } from './main-process/protocol-handler';
import { registerWillNavigateGuard } from './main-process/navigation-guard';
import { createMainWindow } from './main-process/create-main-window';
import { initAutoUpdater, clearUpdateCheckTimer } from './main-process/auto-updater';
import { registerMainProcessIpc } from './main-process/register-main-ipc';

const __dirname = getMainDirname(import.meta.url);
loadDesktopEnvIfPresent(__dirname);

if (!app.isPackaged) {
  app.name = 'Adieuu-Dev';
}

const CUSTOM_SCHEME = getCustomScheme(app.isPackaged);
const CUSTOM_SCHEME_ORIGIN = `${CUSTOM_SCHEME}://app`;

registerPrivilegedCustomScheme(CUSTOM_SCHEME);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
    runtime.mainWindow.webContents.send(channel, ...args);
  }
}

function focusMainWindow(): void {
  if (!runtime.mainWindow || runtime.mainWindow.isDestroyed()) return;
  if (runtime.mainWindow.isMinimized()) runtime.mainWindow.restore();
  runtime.mainWindow.focus();
}

app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith(`${CUSTOM_SCHEME}://`));
  if (url) {
    const routePath = extractDeepLinkPath(url);
    sendToRenderer('deep-link', routePath);
  }
  focusMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  const routePath = extractDeepLinkPath(url);
  if (runtime.mainWindow && !runtime.mainWindow.isDestroyed()) {
    runtime.mainWindow.webContents.send('deep-link', routePath);
    focusMainWindow();
  } else {
    runtime.pendingDeepLinkPath = routePath;
  }
});

applyLinuxPasswordStore(app);

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';

const RENDERER_DIR = path.resolve(__dirname, '../renderer');

const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'icon.png')
  : path.resolve(__dirname, '../../build/icon.png');

app.whenReady().then(() => {
  if (!isDev) {
    registerProtocolHandler(CUSTOM_SCHEME, RENDERER_DIR);
  }
  if (shouldEnableCookieBridge(isDev, process.env)) {
    setupAdieuuCookieBridge(session.defaultSession, {
      isDev,
      customSchemeOrigin: CUSTOM_SCHEME_ORIGIN,
    });
  }
  app.setAsDefaultProtocolClient(CUSTOM_SCHEME);

  const launchUrl = process.argv.find((arg) => arg.startsWith(`${CUSTOM_SCHEME}://`));
  if (launchUrl) {
    runtime.pendingDeepLinkPath = extractDeepLinkPath(launchUrl);
  }

  void createMainWindow({
    __dirname,
    isDev,
    isMac,
    customSchemeOrigin: CUSTOM_SCHEME_ORIGIN,
    iconPath: ICON_PATH,
  });
  void initAutoUpdater({ isDev, sendToRenderer });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  clearUpdateCheckTimer();
  destroyBridgeWindow();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow({
      __dirname,
      isDev,
      isMac,
      customSchemeOrigin: CUSTOM_SCHEME_ORIGIN,
      iconPath: ICON_PATH,
    });
  }
});

registerWillNavigateGuard(app, { isDev, customScheme: CUSTOM_SCHEME });

registerSecureStorageIpc();

registerMainProcessIpc({
  isDev,
  isMac,
  iconPath: ICON_PATH,
  sendToRenderer,
});
