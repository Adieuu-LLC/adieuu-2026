import { app, BrowserWindow, shell, ipcMain, dialog, session, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import { registerSecureStorageIpc } from './ipc/secureStorage';

// ============================================================================
// Custom protocol scheme (must be registered before app 'ready' fires)
// ============================================================================

const CUSTOM_SCHEME = 'adieuu';
const CUSTOM_SCHEME_ORIGIN = `${CUSTOM_SCHEME}://app`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: CUSTOM_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// ============================================================================
// Single-instance lock + deep link handling
//
// Only one instance of the app should run at a time. When a second launch
// occurs (e.g. the user clicks an adieuu:// link while the app is running),
// the URL is forwarded to the existing instance via second-instance (Win/Linux)
// or open-url (macOS).
// ============================================================================

let pendingDeepLinkPath: string | null = null;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith(`${CUSTOM_SCHEME}://`));
  if (url) {
    const routePath = extractDeepLinkPath(url);
    mainWindow?.webContents.send('deep-link', routePath);
  }
  focusMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  const routePath = extractDeepLinkPath(url);
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('deep-link', routePath);
    focusMainWindow();
  } else {
    pendingDeepLinkPath = routePath;
  }
});

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

const PRODUCTION_API_ORIGINS = ['https://api.adieuu.com', 'https://ws.adieuu.com'];
const PRODUCTION_APP_ORIGIN = 'https://app.adieuu.com';
const RENDERER_DIR = path.resolve(__dirname, '../renderer');

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
      // Allow notification / preview sounds after async IPC (Chromium otherwise treats play() as autoplay).
      autoplayPolicy: 'no-user-gesture-required',
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
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';
    await mainWindow.loadURL(rendererUrl);
  } else {
    await mainWindow.loadURL(`${CUSTOM_SCHEME_ORIGIN}/`);
  }
}

app.whenReady().then(() => {
  if (!isDev) {
    registerProtocolHandler();
    setupProductionCors();
  }
  app.setAsDefaultProtocolClient(CUSTOM_SCHEME);

  // Check launch args for a deep link URL (cold start on Windows/Linux)
  const launchUrl = process.argv.find((arg) => arg.startsWith(`${CUSTOM_SCHEME}://`));
  if (launchUrl) {
    pendingDeepLinkPath = extractDeepLinkPath(launchUrl);
  }

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

    if (parsedUrl.protocol === `${CUSTOM_SCHEME}:`) {
      return;
    }

    const allowedHostnames = isDev
      ? ['localhost', '127.0.0.1']
      : ['localhost', '127.0.0.1', 'adieuu.com'];

    const allowed = allowedHostnames.some(
      (h) => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`),
    );

    if (!allowed) {
      event.preventDefault();
    }
  });
});

// ============================================================================
// Deep link helpers
// ============================================================================

/**
 * Extracts the SPA route path from a deep link URL.
 *
 * Example: adieuu://open/conversation/abc123 -> /conversation/abc123
 */
function extractDeepLinkPath(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname || '/';
  } catch {
    return '/';
  }
}

function focusMainWindow(): void {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

// ============================================================================
// Custom protocol handler (adieuu://app -> dist/renderer)
//
// Serves the built renderer files from the adieuu:// scheme, giving the
// renderer a proper origin instead of file:// (which sends Origin: null).
// ============================================================================

function registerProtocolHandler(): void {
  protocol.handle(CUSTOM_SCHEME, (request) => {
    const url = new URL(request.url);
    let filePath = decodeURIComponent(url.pathname);
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }

    const resolved = path.resolve(path.join(RENDERER_DIR, filePath));

    if (!resolved.startsWith(RENDERER_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(resolved).href);
  });
}

// ============================================================================
// Production CORS + cookie bridge (adieuu://app -> api.adieuu.com)
//
// The renderer loads from adieuu://app, which is a different site to
// https://api.adieuu.com. The API's CORS policy only allows
// https://app.adieuu.com, and SameSite=Lax cookies are not sent on
// cross-site fetch() requests.
//
// We fix both at the Electron network layer:
//   1. Rewrite the outgoing Origin so the server recognises the request.
//   2. Inject session cookies that SameSite=Lax would otherwise withhold.
//   3. Rewrite the incoming Access-Control-Allow-Origin so Chromium
//      accepts the response for the adieuu://app origin.
// ============================================================================

function setupProductionCors(): void {
  const filter = { urls: PRODUCTION_API_ORIGINS.map((o) => `${o}/*`) };

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = { ...details.requestHeaders };

    if (headers['Origin'] === CUSTOM_SCHEME_ORIGIN) {
      headers['Origin'] = PRODUCTION_APP_ORIGIN;
    }

    // SameSite=Lax prevents Chromium from attaching cookies on cross-site
    // fetch() calls. Read them from the jar and inject manually.
    session.defaultSession.cookies
      .get({ url: details.url })
      .then((cookies) => {
        if (cookies.length > 0) {
          headers['Cookie'] = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
        }
        callback({ requestHeaders: headers });
      })
      .catch(() => {
        callback({ requestHeaders: headers });
      });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = { ...details.responseHeaders };
    if (!headers) {
      callback({});
      return;
    }

    const acaoKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === 'access-control-allow-origin',
    );

    if (acaoKey) {
      headers[acaoKey] = [CUSTOM_SCHEME_ORIGIN];
    } else {
      headers['Access-Control-Allow-Origin'] = [CUSTOM_SCHEME_ORIGIN];
      headers['Access-Control-Allow-Credentials'] = ['true'];
    }

    const setCookieKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === 'set-cookie',
    );
    if (setCookieKey) {
      for (const raw of headers[setCookieKey] ?? []) {
        persistCookie(details.url, raw);
      }
    }

    callback({ responseHeaders: headers });
  });
}

/**
 * Parses a raw Set-Cookie header and stores it in the default session
 * cookie jar. Chromium may silently discard cross-site Set-Cookie headers
 * when the page origin is a custom scheme; this ensures they are persisted
 * so the onBeforeSendHeaders bridge can re-inject them on later requests.
 */
function persistCookie(url: string, raw: string): void {
  const parts = raw.split(';').map((p) => p.trim());
  const nameValue = parts[0];
  if (!nameValue) return;
  const attrs = parts.slice(1);
  const eqIdx = nameValue.indexOf('=');
  if (eqIdx < 0) return;

  const name = nameValue.substring(0, eqIdx);
  const value = nameValue.substring(eqIdx + 1);

  const cookie: Electron.CookiesSetDetails = { url, name, value };

  for (const attr of attrs) {
    const lower = attr.toLowerCase();
    if (lower === 'secure') {
      cookie.secure = true;
    } else if (lower === 'httponly') {
      cookie.httpOnly = true;
    } else if (lower.startsWith('path=')) {
      cookie.path = attr.substring(5);
    } else if (lower.startsWith('domain=')) {
      cookie.domain = attr.substring(7);
    } else if (lower.startsWith('max-age=')) {
      const seconds = parseInt(attr.substring(8), 10);
      if (!isNaN(seconds)) {
        cookie.expirationDate = Math.floor(Date.now() / 1000) + seconds;
      }
    } else if (lower.startsWith('samesite=')) {
      const val = attr.substring(9).toLowerCase();
      if (val === 'lax') cookie.sameSite = 'lax';
      else if (val === 'strict') cookie.sameSite = 'strict';
      else if (val === 'none') cookie.sameSite = 'no_restriction';
    }
  }

  session.defaultSession.cookies.set(cookie).catch((err) => {
    console.warn('[CookieBridge] Failed to persist cookie:', name, err);
  });
}

// Secure storage IPC (safeStorage + local file)
registerSecureStorageIpc();

// ============================================================================
// Auto-updater (electron-updater)
//
// Privacy: update checks hit downloads.adieuu.com via CloudFront. To
// minimise data exposure we (a) use a generic User-Agent, (b) send no
// custom analytics headers, (c) let the user configure the check interval
// and opt out entirely. CloudFront access logging is disabled on the
// downloads distribution. Each check exposes the client IP at the edge
// and standard HTTP headers -- no account or user ID is transmitted.
// ============================================================================

const MIN_CHECK_INTERVAL_MINUTES = 60;
const DEFAULT_CHECK_INTERVAL_MINUTES = 60;
const UPDATE_PREFS_FILE = 'update-preferences.json';

interface UpdatePreferences {
  autoCheckEnabled: boolean;
  checkIntervalMinutes: number;
}

const DEFAULT_UPDATE_PREFS: UpdatePreferences = {
  autoCheckEnabled: true,
  checkIntervalMinutes: DEFAULT_CHECK_INTERVAL_MINUTES,
};

async function readUpdatePreferences(): Promise<UpdatePreferences> {
  try {
    const filePath = path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpdatePreferences>;
    return {
      autoCheckEnabled: typeof parsed.autoCheckEnabled === 'boolean'
        ? parsed.autoCheckEnabled
        : DEFAULT_UPDATE_PREFS.autoCheckEnabled,
      checkIntervalMinutes: typeof parsed.checkIntervalMinutes === 'number'
          && parsed.checkIntervalMinutes >= MIN_CHECK_INTERVAL_MINUTES
        ? parsed.checkIntervalMinutes
        : DEFAULT_UPDATE_PREFS.checkIntervalMinutes,
    };
  } catch {
    return { ...DEFAULT_UPDATE_PREFS };
  }
}

async function writeUpdatePreferences(prefs: UpdatePreferences): Promise<void> {
  const filePath = path.join(app.getPath('userData'), UPDATE_PREFS_FILE);
  await fs.writeFile(filePath, JSON.stringify(prefs, null, 2), 'utf-8');
}

let updateCheckTimer: ReturnType<typeof setInterval> | null = null;

function scheduleUpdateChecks(intervalMinutes: number): void {
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

async function initAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = !isDev;

  // Privacy: use a generic User-Agent instead of the detailed default
  // (which includes OS, architecture, and Electron version).
  autoUpdater.requestHeaders = { 'User-Agent': 'Adieuu-Desktop-Updater' };

  // Allow overriding the update server URL for local testing. When set,
  // electron-updater fetches manifests and binaries from this URL instead
  // of the production downloads.adieuu.com endpoint.
  // Usage: ADIEUU_UPDATE_SERVER_URL=http://localhost:8089 pnpm --filter @adieuu/desktop dev
  if (process.env.ADIEUU_UPDATE_SERVER_URL) {
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
    mainWindow?.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-not-available');
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
    mainWindow?.webContents.send('update-error', { message: err.message });
  });

  if (isDev && !process.env.ADIEUU_UPDATE_SERVER_URL) {
    console.info('[AutoUpdater] Dev mode without ADIEUU_UPDATE_SERVER_URL; auto-check disabled.');
    return;
  }

  const prefs = await readUpdatePreferences();

  if (prefs.autoCheckEnabled) {
    autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('[AutoUpdater] Initial check failed:', err);
    });
    scheduleUpdateChecks(prefs.checkIntervalMinutes);
  }
}

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
    checkIntervalMinutes: typeof prefs.checkIntervalMinutes === 'number'
        && prefs.checkIntervalMinutes >= MIN_CHECK_INTERVAL_MINUTES
      ? prefs.checkIntervalMinutes
      : current.checkIntervalMinutes,
  };
  await writeUpdatePreferences(updated);

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
    mainWindow?.webContents.send('update-error', { message });
  }
});

// Deep link IPC
ipcMain.handle('get-pending-deep-link', () => {
  const link = pendingDeepLinkPath;
  pendingDeepLinkPath = null;
  return link;
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
  // Prefer the main app window so the dialog is modal to it. On Linux, using
  // getFocusedWindow() can attach to DevTools or another window and break GTK/portal dialogs.
  const parent = mainWindow ?? BrowserWindow.getFocusedWindow();
  const dialogOptions: Electron.OpenDialogOptions = {
    title: 'Choose notification sound',
    properties: ['openFile'],
    // Only real extensions — `extensions: ['*']` ("All Files") is invalid per Electron and
    // commonly prevents GTK file dialogs from opening on Linux.
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
