import { app, BrowserWindow, shell } from 'electron';
import path from 'path';

// Handle creating/removing shortcuts on Windows when installing/uninstalling
// Note: electron-squirrel-startup is only needed for Squirrel.Windows installers
// We use NSIS so this can be safely removed

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hiddenInset',
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
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built web app
    // You would copy the built web app here during build process
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
