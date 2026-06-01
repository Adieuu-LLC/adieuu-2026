/**
 * Unfurl controller.
 *
 * Fetches and caches OpenGraph metadata for external URLs.
 * Validates URLs to prevent SSRF and restricts to public http(s) URLs.
 *
 * @module routes/unfurl/controller
 */

import type { RouteContext } from '../../router/types';
import { success } from '../../utils/response';
import elog from '../../utils/adieuuLogger';

export interface UnfurlMetadata {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
  siteName?: string;
  url: string;
}

const UNFURL_CACHE = new Map<string, { data: UnfurlMetadata | null; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour
const CACHE_ERROR_TTL_MS = 1000 * 60 * 5; // 5 min for failures
const MAX_CACHE_ENTRIES = 5000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB max HTML to parse

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
]);

function isPrivateIp(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  // Block RFC1918, link-local, and loopback ranges
  if (/^10\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^169\.254\./.test(hostname)) return true;
  if (/^fc00:/i.test(hostname) || /^fe80:/i.test(hostname)) return true;
  return false;
}

function isValidUnfurlUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (isPrivateIp(url.hostname)) return null;
    if (!url.hostname.includes('.')) return null;
    return url;
  } catch {
    return null;
  }
}

function extractMetaTags(html: string, pageUrl: URL): UnfurlMetadata {
  const meta: UnfurlMetadata = { url: pageUrl.href };

  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle?.[1]) meta.title = decodeHtmlEntities(ogTitle[1]);

  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogDesc?.[1]) meta.description = decodeHtmlEntities(ogDesc[1]);

  const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImage?.[1]) meta.image = resolveUrl(ogImage[1], pageUrl);

  const ogSiteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  if (ogSiteName?.[1]) meta.siteName = decodeHtmlEntities(ogSiteName[1]);

  // Fallback to <title> if no OG title
  if (!meta.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) meta.title = decodeHtmlEntities(titleMatch[1].trim());
  }

  // Fallback to meta description
  if (!meta.description) {
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (descMatch?.[1]) meta.description = decodeHtmlEntities(descMatch[1]);
  }

  // Favicon
  const faviconMatch = html.match(/<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i);
  if (faviconMatch?.[1]) {
    meta.favicon = resolveUrl(faviconMatch[1], pageUrl);
  } else {
    meta.favicon = `${pageUrl.origin}/favicon.ico`;
  }

  return meta;
}

function resolveUrl(raw: string, base: URL): string {
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

async function fetchMetadata(url: URL): Promise<UnfurlMetadata | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.href, {
      method: 'GET',
      headers: {
        'User-Agent': 'AdieuuBot/1.0 (link preview)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    const reader = response.body?.getReader();
    if (!reader) return null;

    let html = '';
    let bytesRead = 0;
    const decoder = new TextDecoder();

    while (bytesRead < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      html += decoder.decode(value, { stream: true });
      // Stop early once we have </head> -- OG tags live there
      if (html.includes('</head>')) break;
    }

    reader.cancel().catch(() => {});
    return extractMetaTags(html, url);
  } catch (err) {
    elog.debug('Unfurl fetch failed', { url: url.href, error: String(err) });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function pruneCache(): void {
  if (UNFURL_CACHE.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of UNFURL_CACHE) {
    if (entry.expiresAt < now) UNFURL_CACHE.delete(key);
  }
  // If still too large, remove oldest entries
  if (UNFURL_CACHE.size > MAX_CACHE_ENTRIES) {
    const entries = [...UNFURL_CACHE.entries()];
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toRemove = entries.slice(0, entries.length - MAX_CACHE_ENTRIES);
    for (const [key] of toRemove) UNFURL_CACHE.delete(key);
  }
}

export async function unfurlCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();

  const rawUrl = ctx.query.get('url');
  if (!rawUrl) return ctx.errors.badRequest();

  const parsedUrl = isValidUnfurlUrl(rawUrl);
  if (!parsedUrl) return ctx.errors.badRequest();

  const cacheKey = parsedUrl.href;
  const cached = UNFURL_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.data === null) {
      return success({ metadata: null });
    }
    return success({ metadata: cached.data });
  }

  const metadata = await fetchMetadata(parsedUrl);

  pruneCache();
  UNFURL_CACHE.set(cacheKey, {
    data: metadata,
    expiresAt: Date.now() + (metadata ? CACHE_TTL_MS : CACHE_ERROR_TTL_MS),
  });

  return success({ metadata });
}
