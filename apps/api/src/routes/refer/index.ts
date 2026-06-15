/**
 * Public referral landing API.
 *
 * @module routes/refer
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { getReferralLandingData } from '../../services/referral.service';
import { checkRateLimit } from '../../services/rate-limit.service';
import { getClientIp } from '../auth/controller';

const router = new Router();

const LANDING_RATE_LIMIT = { limit: 60, windowSeconds: 3600 };

/**
 * GET /refer/:code
 *
 * Returns landing page data for a referral code. Increments useCount.
 */
router.get('/refer/:code', async (ctx) => {
  const ip = getClientIp(ctx.request) ?? 'unknown';
  const rate = await checkRateLimit('referral_landing', ip, LANDING_RATE_LIMIT);
  if (!rate.allowed) {
    return ctx.errors.rateLimited();
  }

  const code = ctx.params.code;
  if (!code) return success({ valid: false });

  const data = await getReferralLandingData(code);
  return success(data);
});

export const publicReferRoutes = router;
