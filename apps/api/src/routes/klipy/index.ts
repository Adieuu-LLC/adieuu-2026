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
import type { KlipyContentType } from '../../services/klipy.service';
import {
  klipySearchResult,
  klipyTrendingResult,
  klipyShareResult,
} from './controller';

const router = new Router();

function klipyRateLimitedResponse(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: 'rate_limited', retryAfter }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
  });
}

for (const type of ['gifs', 'stickers'] as const) {
  const contentType: KlipyContentType = type === 'gifs' ? 'gif' : 'sticker';

  router.get(`/klipy/${type}/search`, async (ctx) => {
    if (!ctx.identitySession) return ctx.errors.unauthorized();
    const { identity } = ctx.identitySession;

    const result = await klipySearchResult(identity._id.toHexString(), contentType, ctx.query);
    if (!result.ok) {
      if (result.kind === 'validation_failed') return ctx.errors.validationFailed();
      return klipyRateLimitedResponse(result.retryAfter);
    }
    return success(result.data);
  });

  router.get(`/klipy/${type}/trending`, async (ctx) => {
    if (!ctx.identitySession) return ctx.errors.unauthorized();
    const { identity } = ctx.identitySession;

    const result = await klipyTrendingResult(identity._id.toHexString(), contentType, ctx.query);
    if (!result.ok) {
      return klipyRateLimitedResponse(result.retryAfter);
    }
    return success(result.data);
  });
}

router.post('/klipy/share', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = klipyShareResult(identity._id.toHexString(), ctx.body);
  if (!result.ok) {
    return ctx.errors.validationFailed();
  }

  return success({ ok: true });
});

export const klipyRoutes = router;
