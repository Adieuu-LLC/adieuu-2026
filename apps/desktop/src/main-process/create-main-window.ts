import { app, BrowserWindow, Menu, Notification, shell } from 'electron';
import path from 'path';
import { runtime } from './runtime';
import {
  attachMainWindowLayoutPersistence,
  loadWindowLayoutState,
  MIN_WIN_HEIGHT,
  MIN_WIN_WIDTH,
  resolveInitialWindowPlacement,
} from './window-state';
import { getCachedClosePreferences, writeClosePreferences } from './close-preferences';
import { hideToTray, restoreFromTray } from './tray';

function showFirstMinimizeNotification(win: BrowserWindow, iconPath: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: 'Adieuu is still running',
    body: 'We minimized Adieuu to your system tray. Click here to change this behavior.',
    icon: iconPath,
  });
  n.on('click', () => {
    restoreFromTray();
    win.webContents.send('deep-link', '/identity/appearance#desktop-behavior');
  });
  n.show();
}

export async function createMainWindow(options: {
  __dirname: string;
  isDev: boolean;
  isMac: boolean;
  customSchemeOrigin: string;
  iconPath: string;
}): Promise<void> {
  const { __dirname, isDev, isMac, customSchemeOrigin, iconPath } = options;

  await loadWindowLayoutState();
  const placement = resolveInitialWindowPlacement();

  const boundsOpts
    = placement.kind === 'saved'
      ? {
          x: placement.state.x,
          y: placement.state.y,
          width: placement.state.width,
          height: placement.state.height,
        }
      : {
          width: placement.width,
          height: placement.height,
        };

  runtime.mainWindow = new BrowserWindow({
    ...boundsOpts,
    minWidth: MIN_WIN_WIDTH,
    minHeight: MIN_WIN_HEIGHT,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
      additionalArguments: isDev ? [] : ['--webauthn-bridge-enabled'],
    },
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' as const }
      : { frame: false, titleBarStyle: 'hidden' as const }),
    ...(isMac ? {} : { icon: iconPath }),
    show: false,
  });

  attachMainWindowLayoutPersistence(runtime.mainWindow);

  runtime.mainWindow.on('close', (event) => {
    if (runtime.isQuitting) return;

    const win = runtime.mainWindow;
    if (!win || win.isDestroyed()) return;

    const prefs = getCachedClosePreferences();

    if (prefs.behavior === 'minimize-to-tray') {
      event.preventDefault();
      hideToTray(iconPath);

      if (!prefs.hasBeenAsked) {
        showFirstMinimizeNotification(win, iconPath);
        void writeClosePreferences({ ...prefs, hasBeenAsked: true });
      }
      return;
    }
  });

  runtime.mainWindow.on('closed', () => {
    runtime.mainWindow = null;
  });

  runtime.mainWindow.once('ready-to-show', () => {
    const win = runtime.mainWindow;
    if (!win || win.isDestroyed()) return;
    if (placement.kind === 'saved') {
      if (placement.state.isFullScreen) {
        win.setFullScreen(true);
      } else if (placement.state.isMaximized) {
        win.maximize();
      }
    }
    win.show();
  });

  runtime.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Malformed URL — silently ignore
    }
    return { action: 'deny' };
  });

  // Remove the default Electron menu so its built-in accelerators (including
  // Ctrl+Shift+I for DevTools) don't silently consume key events before
  // before-input-event fires. We handle all shortcuts explicitly below.
  Menu.setApplicationMenu(null);

  runtime.mainWindow.webContents.on('before-input-event', (event, input) => {
    const win = runtime.mainWindow;
    if (input.type !== 'keyDown' || !win || win.isDestroyed()) return;

    const ctrlOrCmd = input.control || input.meta;

    if (ctrlOrCmd && !input.alt && (input.code === 'Equal' || input.code === 'NumpadAdd')) {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() + 0.5);
      event.preventDefault();
      return;
    }

    if (ctrlOrCmd && !input.alt && (input.code === 'Minus' || input.code === 'NumpadSubtract')) {
      win.webContents.setZoomLevel(win.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
      return;
    }

    if (ctrlOrCmd && !input.alt && !input.shift && (input.code === 'Digit0' || input.code === 'Numpad0')) {
      win.webContents.setZoomLevel(0);
      event.preventDefault();
      return;
    }

    // Chromium-style reload (default menu removed; accelerators must be explicit)
    if (ctrlOrCmd && input.shift && !input.alt && input.code === 'KeyR') {
      win.webContents.reloadIgnoringCache();
      event.preventDefault();
      return;
    }

    if (ctrlOrCmd && !input.alt && !input.shift && input.code === 'KeyR') {
      win.webContents.reload();
      event.preventDefault();
      return;
    }

    if (!ctrlOrCmd && !input.alt && !input.shift && input.code === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
      return;
    }

    if (!ctrlOrCmd && !input.alt && !input.shift && input.code === 'F1') {
      shell.openExternal('https://adieuu.com');
      event.preventDefault();
      return;
    }

    if (
      (ctrlOrCmd && input.shift && !input.alt && (input.code === 'KeyI' || input.key.toLowerCase() === 'i')) ||
      (!ctrlOrCmd && !input.alt && !input.shift && input.code === 'F12')
    ) {
      win.webContents.toggleDevTools();
      event.preventDefault();
      return;
    }

  });

  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    await runtime.mainWindow.loadURL(rendererUrl);
  } else {
    await runtime.mainWindow.loadURL(`${customSchemeOrigin}/`);
  }
}
