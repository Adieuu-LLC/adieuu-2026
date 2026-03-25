import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
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

app.whenReady().then(() => {
  createWindow();
  initAutoUpdater();
});

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

// ============================================================================
// Auto-updater (electron-updater)
// ============================================================================

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function initAutoUpdater() {
  if (isDev) {
    simulateUpdateFlow();
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.info('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.info('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });

  autoUpdater.checkForUpdates().catch((err: unknown) => {
    console.error('[AutoUpdater] Initial check failed:', err);
  });

  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[AutoUpdater] Periodic check failed:', err);
    });
  }, UPDATE_CHECK_INTERVAL_MS);
}

/**
 * Simulates the update lifecycle in dev mode so the banner UI can be tested.
 * Fires update-available after 5s, download-progress ticks for 3s, then
 * update-downloaded. install-update just logs instead of quitting.
 */
function simulateUpdateFlow() {
  const fakeVersion = '99.0.0';
  console.info('[AutoUpdater] Dev mode: simulating update flow in 5s');

  setTimeout(() => {
    console.info('[AutoUpdater] Dev: update-available');
    mainWindow?.webContents.send('update-available', {
      version: fakeVersion,
      releaseNotes: 'Simulated update for development testing.',
    });

    let percent = 0;
    const progressInterval = setInterval(() => {
      percent += 25;
      mainWindow?.webContents.send('download-progress', {
        percent,
        transferred: percent * 1_000_000,
        total: 100_000_000,
      });

      if (percent >= 100) {
        clearInterval(progressInterval);
        console.info('[AutoUpdater] Dev: update-downloaded');
        mainWindow?.webContents.send('update-downloaded', {
          version: fakeVersion,
        });
      }
    }, 750);
  }, 5000);
}

ipcMain.handle('install-update', () => {
  if (isDev) {
    console.info('[AutoUpdater] Dev mode: install-update called (no-op)');
    return;
  }
  autoUpdater.quitAndInstall();
});

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

// ============================================================================
// Notification sound (local file path only; never uploaded)
// ============================================================================

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.oga', '.opus']);

function isAllowedAudioPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return AUDIO_EXTENSIONS.has(ext);
}

ipcMain.handle('audio:pick-sound-file', async () => {
  const parent = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const dialogOptions = {
    title: 'Choose notification sound',
    properties: ['openFile' as const],
    filters: [
      { name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'm4a', 'flac', 'opus', 'oga'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  };
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
