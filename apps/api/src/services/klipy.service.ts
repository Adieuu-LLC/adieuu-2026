/**
 * @fileoverview Klipy GIF/Sticker Proxy Service
 *
 * Server-side proxy for the Klipy API that keeps the API key out of the
 * browser, sanitises CDN URLs, caches results in Redis, and shapes
 * responses into a slim format for the client.
 *
 * @module services/klipy
 */

import { createHmac } from 'crypto';
import { config } from '../config';
import { getRedis, isRedisConnected, RedisKeys } from '../db';
import elog from '../utils/adieuuLogger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KlipyContentType = 'gif' | 'sticker';

export interface KlipyItem {
  id: number;
  slug: string;
  title: string;
  type: KlipyContentType;
  blurPreview: string;
  previewUrl: string;
  previewWidth: number;
  previewHeight: number;
  url: string;
  width: number;
  height: number;
  tinyUrl: string;
}

export interface KlipySearchResponse {
  items: KlipyItem[];
  currentPage: number;
  perPage: number;
  hasNext: boolean;
}

// ---------------------------------------------------------------------------
// Klipy raw response shapes (internal)
// ---------------------------------------------------------------------------

interface KlipyFileVariant {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
}

interface KlipySizeTier {
  gif?: KlipyFileVariant;
  webp?: KlipyFileVariant;
  jpg?: KlipyFileVariant;
  mp4?: KlipyFileVariant;
  webm?: KlipyFileVariant;
}

interface KlipyRawItem {
  id: number;
  slug: string;
  title?: string;
  type?: string;
  blur_preview?: string;
  tags?: string[];
  file?: {
    hd?: KlipySizeTier;
    md?: KlipySizeTier;
    sm?: KlipySizeTier;
    xs?: KlipySizeTier;
  };
}

interface KlipyRawResponse {
  result: boolean;
  data?: {
    data?: KlipyRawItem[];
    current_page?: number;
    per_page?: number;
    has_next?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_CDN_HOSTNAME = 'static.klipy.com';
const KLIPY_CUSTOMER_DOMAIN = 'adieuu-klipy-cid-v1';

// ---------------------------------------------------------------------------
// URL sanitisation
// ---------------------------------------------------------------------------

/**
 * Validates a Klipy CDN URL and strips all query parameters / fragments.
 * Returns `undefined` for any URL that does not point to the allowed hostname.
 */
export function sanitiseKlipyUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname !== ALLOWED_CDN_HOSTNAME || parsed.protocol !== 'https:') {
      return undefined;
    }
    return `https://${ALLOWED_CDN_HOSTNAME}${parsed.pathname}`;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Format preference helpers
// ---------------------------------------------------------------------------

/**
 * Picks the best available image variant from a size tier, preferring
 * webp > gif > jpg.  Returns `undefined` when no valid variant is found.
 */
function pickBestVariant(tier: KlipySizeTier | undefined): KlipyFileVariant | undefined {
  if (!tier) return undefined;
  for (const format of [tier.webp, tier.gif, tier.jpg]) {
    if (format?.url && sanitiseKlipyUrl(format.url)) return format;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Customer ID hashing
// ---------------------------------------------------------------------------

/**
 * Derives a stable, one-way customer ID from an identity ID.
 * Uses HMAC-SHA256 with a domain-separated key so it cannot be
 * reversed or correlated with other hashes in the system.
 */
export function deriveKlipyCustomerId(identityId: string): string {
  return createHmac('sha256', config.security.accountHashSecret)
    .update(`${identityId}:${KLIPY_CUSTOMER_DOMAIN}`)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

function shapeItem(raw: KlipyRawItem, fallbackType: KlipyContentType): KlipyItem | null {
  const hd = pickBestVariant(raw.file?.hd);
  const sm = pickBestVariant(raw.file?.sm);
  const xs = pickBestVariant(raw.file?.xs);

  const hdUrl = sanitiseKlipyUrl(hd?.url);
  const smUrl = sanitiseKlipyUrl(sm?.url);
  const xsUrl = sanitiseKlipyUrl(xs?.url);

  if (!hdUrl || !smUrl) return null;

  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title ?? '',
    type: (raw.type === 'sticker' ? 'sticker' : 'gif') as KlipyContentType,
    blurPreview: raw.blur_preview ?? '',
    previewUrl: smUrl,
    previewWidth: sm?.width ?? 220,
    previewHeight: sm?.height ?? 220,
    url: hdUrl,
    width: hd?.width ?? 498,
    height: hd?.height ?? 498,
    tinyUrl: xsUrl ?? smUrl,
  };
}

function shapeResponse(raw: KlipyRawResponse, fallbackType: KlipyContentType): KlipySearchResponse {
  const items: KlipyItem[] = [];
  for (const rawItem of raw.data?.data ?? []) {
    const shaped = shapeItem(rawItem, fallbackType);
    if (shaped) items.push(shaped);
  }
  return {
    items,
    currentPage: raw.data?.current_page ?? 1,
    perPage: raw.data?.per_page ?? 24,
    hasNext: raw.data?.has_next ?? false,
  };
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function fetchKlipy(path: string, params: Record<string, string>): Promise<KlipyRawResponse> {
  const { apiKey, baseUrl } = config.klipy;
  if (!apiKey) {
    throw new Error('Klipy API key is not configured');
  }

  const url = new URL(`${baseUrl}/${apiKey}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Klipy API returned ${res.status}`);
  }

  return (await res.json()) as KlipyRawResponse;
}

// ---------------------------------------------------------------------------
// Redis cache helpers
// ---------------------------------------------------------------------------

async function getCached(key: string): Promise<KlipySearchResponse | null> {
  if (!isRedisConnected()) return null;
  try {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as KlipySearchResponse;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: KlipySearchResponse, ttl: number): Promise<void> {
  if (!isRedisConnected()) return;
  try {
    await getRedis().set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    elog.warn('Failed to cache Klipy result', { error: err });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface KlipySearchParams {
  query: string;
  page?: number;
  perPage?: number;
  identityId: string;
}

export interface KlipyTrendingParams {
  page?: number;
  perPage?: number;
  identityId: string;
}

export async function searchKlipy(
  type: KlipyContentType,
  params: KlipySearchParams
): Promise<KlipySearchResponse> {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 24;

  const cacheKey = RedisKeys.klipyCache(type, params.query.toLowerCase().trim(), page, perPage);
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const raw = await fetchKlipy(`${type}s/search`, {
    q: params.query,
    page: String(page),
    per_page: String(perPage),
    customer_id: deriveKlipyCustomerId(params.identityId),
    content_filter: config.klipy.contentFilter,
    format_filter: 'webp,gif,jpg',
  });

  const shaped = shapeResponse(raw, type);
  await setCache(cacheKey, shaped, config.klipy.cacheTtlSearch);
  return shaped;
}

export async function trendingKlipy(
  type: KlipyContentType,
  params: KlipyTrendingParams
): Promise<KlipySearchResponse> {
  const page = params.page ?? 1;
  const perPage = params.perPage ?? 24;

  const cacheKey = RedisKeys.klipyTrendingCache(type, page);
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const raw = await fetchKlipy(`${type}s/trending`, {
    page: String(page),
    per_page: String(perPage),
    customer_id: deriveKlipyCustomerId(params.identityId),
    content_filter: config.klipy.contentFilter,
    format_filter: 'webp,gif,jpg',
  });

  const shaped = shapeResponse(raw, type);
  await setCache(cacheKey, shaped, config.klipy.cacheTtlTrending);
  return shaped;
}

/**
 * Fires Klipy's share trigger (fire-and-forget).
 * Called when a user sends a GIF/sticker so Klipy can improve relevance.
 */
export async function triggerKlipyShare(
  type: KlipyContentType,
  slug: string,
  identityId: string,
  searchTerm?: string
): Promise<void> {
  const { apiKey, baseUrl } = config.klipy;
  if (!apiKey) return;

  try {
    const url = `${baseUrl}/${apiKey}/${type}s/share/${encodeURIComponent(slug)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: deriveKlipyCustomerId(identityId),
        ...(searchTerm ? { q: searchTerm } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    elog.warn('Klipy share trigger failed (non-blocking)', { error: err });
  }
}
