/**
 * Account promo code routes.
 *
 * @module routes/account/promo-code
 */

import { Router } from '../../../router';
import { success, error } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import { redeemPromoCodeForUser } from './controller';

const router = new Router();

const PROMO_ERROR_MESSAGES: Record<string, { code: string; message: string; status: number }> = {
  /** Generic response for invalid/unavailable codes — avoids shortcode enumeration. */
  invalid: {
    code: 'PROMO_INVALID',
    message: 'That promotional code is not valid or cannot be redeemed.',
    status: 400,
  },
  already_redeemed: {
    code: 'PROMO_ALREADY_REDEEMED',
    message: 'You have already redeemed this promotional code.',
    status: 400,
  },
  missing_required_codes: {
    code: 'PROMO_MISSING_REQUIRED',
    message: 'You must redeem other required promotional codes first.',
    status: 400,
  },
  incompatible_code_redeemed: {
    code: 'PROMO_INCOMPATIBLE',
    message: 'This promotional code cannot be combined with one you have already redeemed.',
    status: 400,
  },
  audience_restricted: {
    code: 'PROMO_AUDIENCE',
    message: 'This code is not available for your subscription status.',
    status: 400,
  },
};

/** Reasons that must not reveal whether a shortcode exists. */
const ANTI_ENUMERATION_REASONS = new Set([
  'not_found',
  'expired',
  'jurisdiction_restricted',
  'max_uses_reached',
]);

/**
 * POST /account/promo-code/redeem
 *
 * Redeems a promotional code for the authenticated account user.
 *
 * @route POST /api/account/promo-code/redeem
 */
router.post('/account/promo-code/redeem', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const body = ctx.body as { shortcode?: unknown } | undefined;
  const result = await redeemPromoCodeForUser(session.userId, body?.shortcode);

  if (!result.ok) {
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();

    const mapped = ANTI_ENUMERATION_REASONS.has(result.reason)
      ? PROMO_ERROR_MESSAGES.invalid
      : PROMO_ERROR_MESSAGES[result.reason];
    if (mapped) {
      return error(mapped.code, mapped.message, mapped.status);
    }

    return ctx.errors.internal();
  }

  return success(result.data);
});

export const promoCodeRoutes = router;
