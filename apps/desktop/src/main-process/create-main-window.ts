import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { runtime } from './runtime';

export async function createMainWindow(options: {
  __dirname: string;
  isDev: boolean;
  isMac: boolean;
  customSchemeOrigin: string;
  iconPath: string;
}): Promise<void> {
  const { __dirname, isDev, isMac, customSchemeOrigin, iconPath } = options;

  runtime.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 320,
    minHeight: 400,
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

  runtime.mainWindow.on('closed', () => {
    runtime.mainWindow = null;
  });

  runtime.mainWindow.once('ready-to-show', () => {
    runtime.mainWindow?.show();
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

  });

  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    await runtime.mainWindow.loadURL(rendererUrl);
  } else {
    await runtime.mainWindow.loadURL(`${customSchemeOrigin}/`);
  }
}
