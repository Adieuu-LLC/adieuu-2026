import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { registerSecureStorageIpc } from './ipc/secureStorage';

// ============================================================================
// Linux password store detection (must run before app.whenReady)
// ============================================================================

if (process.platform === 'linux') {
  const override = process.env.ADIEUU_PASSWORD_STORE;
  if (override) {
    app.commandLine.appendSwitch('password-store', override);
  } else {
    const desktop = (process.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase();
    if (desktop.includes('kde')) {
      app.commandLine.appendSwitch('password-store', 'kwallet5');
    } else if (desktop.includes('gnome') || desktop.includes('unity') || desktop.includes('pantheon') || desktop.includes('cinnamon')) {
      app.commandLine.appendSwitch('password-store', 'gnome-libsecret');
    }
  }
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
