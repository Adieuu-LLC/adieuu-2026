/**
 * Klipy GIF/sticker proxy routes.
 *
 * All endpoints require identity auth.  Search and trending are
 * subject to progressive rate limiting; search also logs the
 * anonymised term for analytics.
 *
 * @module routes/klipy
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import {
  checkRateLimit,
  getKlipySearchConfig,
  escalateKlipyThrottle,
} from '../../services/rate-limit.service';
import {
  searchKlipy,
  trendingKlipy,
  triggerKlipyShare,
  type KlipyContentType,
} from '../../services/klipy.service';
import { logKlipySearch } from '../../models/klipy-search-log';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseType(raw: string | null): KlipyContentType | null {
  if (raw === 'gif' || raw === 'sticker') return raw;
  return null;
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// ---------------------------------------------------------------------------
// GET /klipy/gifs/search   GET /klipy/stickers/search
// ---------------------------------------------------------------------------

for (const type of ['gifs', 'stickers'] as const) {
  const contentType: KlipyContentType = type === 'gifs' ? 'gif' : 'sticker';

  router.get(`/klipy/${type}/search`, async (ctx) => {
    if (!ctx.identitySession) return ctx.errors.unauthorized();
    const { identity } = ctx.identitySession;

    const identityId = identity._id.toHexString();
    const q = ctx.query.get('q')?.trim();
    if (!q || q.length === 0 || q.length > 200) return ctx.errors.validationFailed();

    const rlConfig = await getKlipySearchConfig(identityId);
    const rl = await checkRateLimit('klipy:search:identity', identityId, rlConfig);
    if (!rl.allowed) {
      await escalateKlipyThrottle(identityId);
      const retryAfter = Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000));
      return new Response(
        JSON.stringify({ error: 'rate_limited', retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    logKlipySearch(q, contentType);

    const page = clampInt(ctx.query.get('page'), 1, 100, 1);
    const perPage = clampInt(ctx.query.get('per_page'), 1, 50, 6);

    const result = await searchKlipy(contentType, {
      query: q,
      page,
      perPage,
      identityId,
    });

    return success(result);
  });

  // -------------------------------------------------------------------------
  // GET /klipy/gifs/trending   GET /klipy/stickers/trending
  // -------------------------------------------------------------------------

  router.get(`/klipy/${type}/trending`, async (ctx) => {
    if (!ctx.identitySession) return ctx.errors.unauthorized();
    const { identity } = ctx.identitySession;

    const identityId = identity._id.toHexString();

    const rlConfig = await getKlipySearchConfig(identityId);
    const rl = await checkRateLimit('klipy:search:identity', identityId, rlConfig);
    if (!rl.allowed) {
      await escalateKlipyThrottle(identityId);
      const retryAfter = Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000));
      return new Response(
        JSON.stringify({ error: 'rate_limited', retryAfter }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        },
      );
    }

    const page = clampInt(ctx.query.get('page'), 1, 100, 1);
    const perPage = clampInt(ctx.query.get('per_page'), 1, 50, 6);

    const result = await trendingKlipy(contentType, {
      page,
      perPage,
      identityId,
    });

    return success(result);
  });
}

// ---------------------------------------------------------------------------
// POST /klipy/share — share trigger (fire-and-forget to Klipy)
// ---------------------------------------------------------------------------

const ShareSchema = z.object({
  slug: z.string().min(1).max(200),
  type: z.enum(['gif', 'sticker']),
  searchTerm: z.string().max(200).optional(),
});

router.post('/klipy/share', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const parseResult = ShareSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const { slug, type, searchTerm } = parseResult.data;

  triggerKlipyShare(type, slug, identity._id.toHexString(), searchTerm);

  return success({ ok: true });
});

export const klipyRoutes = router;
