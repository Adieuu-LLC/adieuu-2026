/**
 * Klipy route controller — sanitization, rate limits, and service orchestration.
 *
 * @module routes/klipy/controller
 */

import { z } from '@adieuu/shared/schemas';
import { logKlipySearch } from '../../models/klipy-search-log';
import {
  checkRateLimit,
  escalateKlipyThrottle,
  getKlipySearchConfig,
} from '../../services/rate-limit.service';
import {
  searchKlipy,
  trendingKlipy,
  triggerKlipyShare,
  type KlipyContentType,
  type KlipySearchResponse,
} from '../../services/klipy.service';
import elog from '../../utils/adieuuLogger';
import { sanitizeString } from '../../utils/sanitize';

export const KlipyShareSchema = z.object({
  slug: z.string().min(1).max(200),
  type: z.enum(['gif', 'sticker']),
  searchTerm: z.string().max(200).optional(),
});

const MAX_QUERY_LEN = 200;

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Klipy list pagination: page 1–100, default 1 */
export function clampKlipyPage(raw: string | null): number {
  return clampInt(raw, 1, 100, 1);
}

/** Klipy list pagination: per_page 1–50, default 6 */
export function clampKlipyPerPage(raw: string | null): number {
  return clampInt(raw, 1, 50, 6);
}

function parseSanitizedSearchQuery(raw: string | null): { ok: false } | { ok: true; query: string } {
  if (!raw) return { ok: false };
  const sanitized = sanitizeString(raw.trim(), 'general');
  if (sanitized.deltas > 0) {
    elog.warn('Klipy search query sanitization modified input', { deltas: sanitized.deltas });
  }
  const q = sanitized.value;
  if (!q || q.length > MAX_QUERY_LEN) return { ok: false };
  return { ok: true, query: q };
}

type RateLimitOk = { ok: true } | { ok: false; retryAfter: number };

async function enforceKlipySearchRateLimit(identityId: string): Promise<RateLimitOk> {
  const rlConfig = await getKlipySearchConfig(identityId);
  const rl = await checkRateLimit('klipy:search:identity', identityId, rlConfig);
  if (!rl.allowed) {
    await escalateKlipyThrottle(identityId);
    const retryAfter = Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

export type KlipySearchRouteResult =
  | { ok: true; data: KlipySearchResponse }
  | { ok: false; kind: 'validation_failed' }
  | { ok: false; kind: 'rate_limited'; retryAfter: number };

export async function klipySearchResult(
  identityId: string,
  contentType: KlipyContentType,
  query: URLSearchParams,
): Promise<KlipySearchRouteResult> {
  const parsed = parseSanitizedSearchQuery(query.get('q'));
  if (!parsed.ok) {
    return { ok: false, kind: 'validation_failed' };
  }

  const rl = await enforceKlipySearchRateLimit(identityId);
  if (!rl.ok) {
    return { ok: false, kind: 'rate_limited', retryAfter: rl.retryAfter };
  }

  logKlipySearch(parsed.query, contentType);

  const page = clampKlipyPage(query.get('page'));
  const perPage = clampKlipyPerPage(query.get('per_page'));

  const data = await searchKlipy(contentType, {
    query: parsed.query,
    page,
    perPage,
    identityId,
  });

  return { ok: true, data };
}

export type KlipyTrendingRouteResult =
  | { ok: true; data: KlipySearchResponse }
  | { ok: false; kind: 'rate_limited'; retryAfter: number };

export async function klipyTrendingResult(
  identityId: string,
  contentType: KlipyContentType,
  query: URLSearchParams,
): Promise<KlipyTrendingRouteResult> {
  const rl = await enforceKlipySearchRateLimit(identityId);
  if (!rl.ok) {
    return { ok: false, kind: 'rate_limited', retryAfter: rl.retryAfter };
  }

  const page = clampKlipyPage(query.get('page'));
  const perPage = clampKlipyPerPage(query.get('per_page'));

  const data = await trendingKlipy(contentType, {
    page,
    perPage,
    identityId,
  });

  return { ok: true, data };
}

export type KlipyShareRouteResult = { ok: true } | { ok: false; kind: 'validation_failed' };

export function klipyShareResult(identityId: string, body: unknown): KlipyShareRouteResult {
  const parseResult = KlipyShareSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const { slug, type, searchTerm } = parseResult.data;

  const slugSan = sanitizeString(slug, 'idenhanced');
  if (slugSan.deltas > 0) {
    elog.warn('Klipy share slug sanitization modified input', { deltas: slugSan.deltas });
  }
  if (!slugSan.value || slugSan.value.length > MAX_QUERY_LEN) {
    return { ok: false, kind: 'validation_failed' };
  }

  let optionalTerm: string | undefined;
  if (searchTerm !== undefined && searchTerm.length > 0) {
    const termSan = sanitizeString(searchTerm.trim(), 'general');
    if (termSan.deltas > 0) {
      elog.warn('Klipy share searchTerm sanitization modified input', { deltas: termSan.deltas });
    }
    if (termSan.value && termSan.value.length <= MAX_QUERY_LEN) {
      optionalTerm = termSan.value;
    }
  }

  void triggerKlipyShare(type, slugSan.value, identityId, optionalTerm);

  return { ok: true };
}
