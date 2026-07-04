import type { Session } from 'electron';

export const PRODUCTION_APP_ORIGIN =
  process.env.ADIEUU_APP_ORIGIN || 'https://app.adieuu.com';

/**
 * Default hostnames for the cookie + CORS bridge when `ADIEUU_COOKIE_BRIDGE_HOSTS`
 * is not set. No wildcards; add staging hosts via `ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS`
 * or replace entirely via `ADIEUU_COOKIE_BRIDGE_HOSTS`.
 *
 * Each token becomes `https://<token>/*` and `wss://<token>/*` (WebSocket upgrades
 * use `wss://`, which must be listed explicitly).
 */
export const DEFAULT_COOKIE_BRIDGE_HOSTS = [
  'api.adieuu.com',
  'ws.adieuu.com',
  'downloads.adieuu.com',
  'media.adieuu.com',
  'status.adieuu.com',
] as const;

export function parseEnvCommaList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export type CookieBridgeEnv = Pick<
  NodeJS.ProcessEnv,
  'ADIEUU_COOKIE_BRIDGE_HOSTS' | 'ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS' | 'ADIEUU_ENABLE_COOKIE_BRIDGE'
>;

/**
 * Resolves host tokens: `hostname` or `hostname:port` (no scheme, no path).
 */
export function getCookieBridgeHostTokens(env: CookieBridgeEnv): string[] {
  const override = env.ADIEUU_COOKIE_BRIDGE_HOSTS;
  if (override !== undefined && override.trim() !== '') {
    return parseEnvCommaList(override);
  }
  return [
    ...DEFAULT_COOKIE_BRIDGE_HOSTS,
    ...parseEnvCommaList(env.ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS),
  ];
}

export function tokenToBridgePatterns(token: string): string[] {
  const t = token.trim();
  if (!t) return [];
  if (t.includes('://') || t.includes('/')) {
    console.warn('[CookieBridge] Ignoring invalid host token (use host or host:port only):', t);
    return [];
  }
  return [`https://${t}/*`, `wss://${t}/*`];
}

export function buildCookieBridgeUrlPatterns(env: CookieBridgeEnv): string[] {
  const patterns: string[] = [];
  for (const token of getCookieBridgeHostTokens(env)) {
    patterns.push(...tokenToBridgePatterns(token));
  }
  return [...new Set(patterns)];
}

/**
 * Packaged app: always on. Dev: opt-in so Vite + localhost CORS is unchanged unless
 * you set `ADIEUU_ENABLE_COOKIE_BRIDGE=true` (e.g. to test `wss://` against local chat).
 */
export function shouldEnableCookieBridge(isDev: boolean, env: CookieBridgeEnv): boolean {
  if (!isDev) return true;
  const v = env.ADIEUU_ENABLE_COOKIE_BRIDGE?.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function setupAdieuuCookieBridge(
  session: Session,
  options: {
    isDev: boolean;
    customSchemeOrigin: string;
    env?: CookieBridgeEnv;
  },
): void {
  const env = options.env ?? process.env;
  const patterns = buildCookieBridgeUrlPatterns(env);
  if (patterns.length === 0) {
    console.warn('[CookieBridge] No URL patterns; set ADIEUU_COOKIE_BRIDGE_HOSTS or ADIEUU_COOKIE_BRIDGE_EXTRA_HOSTS');
    return;
  }

  const filter = { urls: patterns };
  /** Dev + Vite must keep `Access-Control-Allow-Origin` for `http://localhost:5173`. */
  const rewriteCorsForPackagedApp = !options.isDev;

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = { ...details.requestHeaders };

    if (headers['Origin'] === options.customSchemeOrigin) {
      headers['Origin'] = PRODUCTION_APP_ORIGIN;
    }

    // Preflight requests never carry cookies; skip the async cookie lookup
    // so the callback fires synchronously and Chromium doesn't abort it.
    if (details.method === 'OPTIONS') {
      callback({ requestHeaders: headers });
      return;
    }

    session.cookies
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

  session.webRequest.onHeadersReceived(filter, (details, callback) => {
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
        headers[acaoKey] = [options.customSchemeOrigin];
      } else {
        headers['Access-Control-Allow-Origin'] = [options.customSchemeOrigin];
        headers['Access-Control-Allow-Credentials'] = ['true'];
      }
    }

    const setCookieKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === 'set-cookie',
    );
    if (setCookieKey) {
      for (const raw of headers[setCookieKey] ?? []) {
        persistCookie(session, details.url, raw);
      }
    }

    callback({ responseHeaders: headers });
  });
}

/**
 * Parses a raw Set-Cookie header and stores it in the session cookie jar.
 */
export function persistCookie(session: Session, url: string, raw: string): void {
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

  session.cookies.set(cookie).catch((err) => {
    console.warn('[CookieBridge] Failed to persist cookie:', name, err);
  });
}
