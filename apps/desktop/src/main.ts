import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { execSync } from 'child_process';
import { registerSecureStorageIpc } from './ipc/secureStorage';

// ============================================================================
// Linux password store detection (must run before app.whenReady)
// ============================================================================

if (process.platform === 'linux') {
  const override = process.env.ADIEUU_PASSWORD_STORE;
  const desktop = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase();
  const kdeVersion = process.env.KDE_SESSION_VERSION ?? '';

  let store: string | undefined;

  if (override) {
    store = override;
  } else if (desktop.includes('kde')) {
    store = parseInt(kdeVersion || '5', 10) >= 6 ? 'kwallet6' : 'kwallet5';
  } else if (desktop.includes('gnome') || desktop.includes('unity') || desktop.includes('pantheon') || desktop.includes('cinnamon')) {
    store = 'gnome-libsecret';
  }

  // Env vars may be missing (e.g. when launched from an IDE or AppImage).
  // Fall back to probing D-Bus for available secret service backends.
  if (!store && !override) {
    store = probeDbusSecretBackend();
  }

  if (store) {
    console.info('[SafeStorage] Using --password-store=' + store);
    app.commandLine.appendSwitch('password-store', store);
  }
}

/**
 * Probes D-Bus for available secret-service backends when environment
 * variables like XDG_CURRENT_DESKTOP are unavailable.
 *
 * Tried in order: KWallet 6, KWallet 5, freedesktop Secret Service
 * (GNOME Keyring, etc.). Returns the first one that responds.
 */
function probeDbusSecretBackend(): string | undefined {
  const probes: Array<{ store: string; dest: string; path: string }> = [
    { store: 'kwallet6', dest: 'org.kde.kwalletd6', path: '/modules/kwalletd6' },
    { store: 'kwallet5', dest: 'org.kde.kwalletd5', path: '/modules/kwalletd5' },
  ];

  for (const { store, dest, path: objPath } of probes) {
    try {
      execSync(
        `dbus-send --session --print-reply --dest=${dest} ${objPath} org.kde.KWallet.isEnabled`,
        { timeout: 2000, stdio: 'pipe' }
      );
      console.info(`[SafeStorage] D-Bus probe found ${store}`);
      return store;
    } catch {
      // Service not available, try next
    }
  }

  // Try freedesktop Secret Service (GNOME Keyring, KeePassXC, etc.)
  try {
    execSync(
      'dbus-send --session --print-reply --dest=org.freedesktop.secrets /org/freedesktop/secrets org.freedesktop.DBus.Peer.Ping',
      { timeout: 2000, stdio: 'pipe' }
    );
    console.info('[SafeStorage] D-Bus probe found freedesktop Secret Service');
    return 'gnome-libsecret';
  } catch {
    // No secret service found
  }

  console.warn('[SafeStorage] No secret service backend found via D-Bus');
  return undefined;
}

// ============================================================================

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 320,
    minHeight: 400,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    // macOS: use native traffic lights with hidden title bar
    // Windows/Linux: fully frameless for custom window controls
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: false, titleBarStyle: 'hidden' }),
    show: false,
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // In dev, load from electron-vite renderer dev server
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(rendererUrl);
    // Uncomment to open dev tools on startup:
    // mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built renderer
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Security: Prevent navigation to unknown origins
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const allowedOrigins = ['localhost', '127.0.0.1'];

    if (!allowedOrigins.some((origin) => parsedUrl.hostname.includes(origin))) {
      event.preventDefault();
    }
  });
});

// Secure storage IPC (safeStorage + local file)
registerSecureStorageIpc();

// Window control IPC handlers
ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});
