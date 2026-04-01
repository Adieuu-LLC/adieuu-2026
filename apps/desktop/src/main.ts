import { app, BrowserWindow, shell, ipcMain, dialog, session, protocol, net } from 'electron';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import { registerSecureStorageIpc } from './ipc/secureStorage';
import { createCredential, getCredential, destroyBridgeWindow } from './webauthn-bridge';
import { config as loadDotenv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/main -> ../../.env ; src (rare) -> ../.env — avoid loading repo-root .env by mistake
const desktopEnvPath = __dirname.endsWith(`${path.sep}src`)
  ? path.resolve(__dirname, '../.env')
  : path.resolve(__dirname, '../../.env');
if (existsSync(desktopEnvPath)) {
  loadDotenv({ path: desktopEnvPath });
}

// ============================================================================
// Dev-mode isolation
//
// When running an unpackaged (development) build, use a distinct app name and
// protocol scheme so the dev instance is fully isolated from a production
// installation running on the same machine. This gives each build its own
// userData directory, single-instance lock, and deep-link protocol.
// ============================================================================

if (!app.isPackaged) {
  app.name = 'Adieuu-Dev';
}

// ============================================================================
// Custom protocol scheme (must be registered before app 'ready' fires)
// ============================================================================

const CUSTOM_SCHEME = app.isPackaged ? 'adieuu' : 'adieuu-dev';
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
    sendToRenderer('deep-link', routePath);
  }
  focusMainWindow();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  const routePath = extractDeepLinkPath(url);
  if (mainWindow && !mainWindow.isDestroyed()) {
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

/**
 * Safely sends an IPC message to the renderer. Guards against both a null
 * reference (window not yet created or already nulled) and a destroyed
 * native object (window closed but JS reference not yet cleared).
 */
function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

const PRODUCTION_APP_ORIGIN = 'https://app.adieuu.com';

/**
 * Default hostnames for the cookie + CORS bridge when `ADIEUU_COOKIE_BRIDGE_HOSTS`
 * is not set. No wildcards; add staging hosts via `ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS`
 * or replace entirely via `ADIEUU_COOKIE_BRIDGE_HOSTS`.
 *
 * Each token becomes `https://<token>/*` and `wss://<token>/*` (WebSocket upgrades
 * use `wss://`, which must be listed explicitly).
 */
const DEFAULT_COOKIE_BRIDGE_HOSTS = [
  'api.adieuu.com',
  'ws.adieuu.com',
  'downloads.adieuu.com',
  'media.adieuu.com',
  'status.adieuu.com',
] as const;

function parseEnvCommaList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolves host tokens: `hostname` or `hostname:port` (no scheme, no path).
 */
function getCookieBridgeHostTokens(): string[] {
  const override = process.env.ADIEUU_COOKIE_BRIDGE_HOSTS;
  if (override !== undefined && override.trim() !== '') {
    return parseEnvCommaList(override);
  }
  return [
    ...DEFAULT_COOKIE_BRIDGE_HOSTS,
    ...parseEnvCommaList(process.env.ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS),
  ];
}

function tokenToBridgePatterns(token: string): string[] {
  const t = token.trim();
  if (!t) return [];
  if (t.includes('://') || t.includes('/')) {
    console.warn('[CookieBridge] Ignoring invalid host token (use host or host:port only):', t);
    return [];
  }
  return [`https://${t}/*`, `wss://${t}/*`];
}

function buildCookieBridgeUrlPatterns(): string[] {
  const patterns: string[] = [];
  for (const token of getCookieBridgeHostTokens()) {
    patterns.push(...tokenToBridgePatterns(token));
  }
  return [...new Set(patterns)];
}

/**
 * Packaged app: always on. Dev: opt-in so Vite + localhost CORS is unchanged unless
 * you set `ADIEUU_ENABLE_COOKIE_BRIDGE=true` (e.g. to test `wss://` against local chat).
 */
function shouldEnableCookieBridge(): boolean {
  if (!isDev) return true;
  const v = process.env.ADIEUU_ENABLE_COOKIE_BRIDGE?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
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
      // In production the renderer loads from adieuu://app, whose hostname
      // does not match the WebAuthn RP ID. The preload exposes an IPC bridge
      // so the ceremony runs in a hidden window with the correct origin.
      additionalArguments: isDev ? [] : ['--webauthn-bridge-enabled'],
    },
    // macOS: use native traffic lights with hidden title bar
    // Windows/Linux: fully frameless for custom window controls
    ...(isMac
      ? { titleBarStyle: 'hiddenInset' }
      : { frame: false, titleBarStyle: 'hidden' }),
    show: false,
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
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

  // ---- Keyboard shortcuts --------------------------------------------------
  // Electron's default menu accelerators can be unreliable on Linux with
  // frame: false (e.g. Ctrl+Shift+= for zoom-in, F11 for fullscreen).
  // Handle them explicitly via before-input-event so they work everywhere.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !mainWindow || mainWindow.isDestroyed()) return;

    const ctrlOrCmd = input.control || input.meta;

    // Zoom in: Ctrl+Shift+= (produces '+') and Ctrl+NumpadAdd
    if (ctrlOrCmd && !input.alt && input.key === '+') {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5);
      event.preventDefault();
      return;
    }

    // Zoom out: Ctrl+NumpadSubtract (the regular Ctrl+- is handled by the
    // default menu, but the numpad variant may not be)
    if (ctrlOrCmd && !input.alt && !input.shift && input.code === 'NumpadSubtract') {
      mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5);
      event.preventDefault();
      return;
    }

    // Reset zoom: Ctrl+0
    if (ctrlOrCmd && !input.alt && !input.shift && input.key === '0') {
      mainWindow.webContents.setZoomLevel(0);
      event.preventDefault();
      return;
    }

    // Toggle fullscreen: F11
    if (!ctrlOrCmd && !input.alt && !input.shift && input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
      return;
    }

    // Block DevTools in production (Ctrl+Shift+I / F12)
    if (!isDev) {
      if ((ctrlOrCmd && input.shift && input.key === 'I') || input.key === 'F12') {
        event.preventDefault();
        return;
      }
    }
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
  }
  if (shouldEnableCookieBridge()) {
    setupAdieuuCookieBridge();
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

app.on('will-quit', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  destroyBridgeWindow();
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
  if (!mainWindow || mainWindow.isDestroyed()) return;
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
// CORS + cookie bridge (adieuu://app -> allowlisted API hosts)
//
// The packaged renderer loads from adieuu://app, which is a different site to
// https://api.adieuu.com (and other API hosts). The API's CORS policy only
// allows https://app.adieuu.com, and SameSite=Lax cookies are not sent on
// cross-site fetch() requests.
//
// We fix both at the Electron network layer:
//   1. Rewrite the outgoing Origin so the server recognises the request.
//   2. Inject session cookies that SameSite=Lax would otherwise withhold.
//   3. Rewrite the incoming Access-Control-Allow-Origin so Chromium
//      accepts the response for the adieuu://app origin (packaged app only).
//
// Host lists and dev opt-in: `ADIEUU_COOKIE_BRIDGE_HOSTS` / `EXTRA` / `ENABLE`.
// ============================================================================

function setupAdieuuCookieBridge(): void {
  const patterns = buildCookieBridgeUrlPatterns();
  if (patterns.length === 0) {
    console.warn('[CookieBridge] No URL patterns; set ADIEUU_COOKIE_BRIDGE_HOSTS or ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS');
    return;
  }

  const filter = { urls: patterns };
  /** Dev + Vite must keep `Access-Control-Allow-Origin` for `http://localhost:5173`. */
  const rewriteCorsForPackagedApp = !isDev;

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

    if (rewriteCorsForPackagedApp) {
      const acaoKey = Object.keys(headers).find(
        (k) => k.toLowerCase() === 'access-control-allow-origin',
      );

      if (acaoKey) {
        headers[acaoKey] = [CUSTOM_SCHEME_ORIGIN];
      } else {
        headers['Access-Control-Allow-Origin'] = [CUSTOM_SCHEME_ORIGIN];
        headers['Access-Control-Allow-Credentials'] = ['true'];
      }
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

// WebAuthn IPC bridge (production only — see webauthn-bridge.ts)
ipcMain.handle('webauthn:create', async (_event, optionsJSON: unknown) => {
  return createCredential(optionsJSON);
});

ipcMain.handle('webauthn:get', async (_event, optionsJSON: unknown) => {
  return getCredential(optionsJSON);
});

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
  autoDownloadEnabled: boolean;
  checkIntervalMinutes: number;
}

const DEFAULT_UPDATE_PREFS: UpdatePreferences = {
  autoCheckEnabled: true,
  autoDownloadEnabled: false,
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
      autoDownloadEnabled: typeof parsed.autoDownloadEnabled === 'boolean'
        ? parsed.autoDownloadEnabled
        : DEFAULT_UPDATE_PREFS.autoDownloadEnabled,
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
  const initPrefs = await readUpdatePreferences();
  autoUpdater.autoDownload = initPrefs.autoDownloadEnabled;
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
