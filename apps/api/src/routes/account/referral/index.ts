/**
 * Account referral routes.
 *
 * @module routes/account/referral
 */

import { Router } from '../../../router';
import { success, error } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import {
  createReferralCodeForUser,
  deleteReferralCodeForUser,
  getReferralStatsForUser,
  redeemReferralCodeForUser,
  updateReferralCodeForUser,
} from './controller';

const router = new Router();

const CREATE_ERROR_MESSAGES: Record<string, { code: string; message: string; status: number }> = {
  validation: {
    code: 'REFERRAL_INVALID_CODE',
    message: 'Referral code must be 3–24 characters and contain only letters, numbers, and dashes.',
    status: 400,
  },
  rate_limited: {
    code: 'RATE_LIMITED',
    message: 'Too many referral code creation attempts. Please try again later.',
    status: 429,
  },
  code_limit_reached: {
    code: 'REFERRAL_CODE_LIMIT',
    message: 'You can have at most three active referral codes.',
    status: 403,
  },
  code_taken: {
    code: 'REFERRAL_CODE_TAKEN',
    message: 'That referral code is already in use.',
    status: 409,
  },
  invalid_message: {
    code: 'REFERRAL_INVALID_MESSAGE',
    message: 'Custom message is invalid.',
    status: 400,
  },
};

const REDEEM_ERROR_MESSAGES: Record<string, { code: string; message: string; status: number }> = {
  validation: {
    code: 'REFERRAL_INVALID_CODE',
    message: 'Referral code must be 3–24 characters and contain only letters, numbers, and dashes.',
    status: 400,
  },
  rate_limited: {
    code: 'RATE_LIMITED',
    message: 'Too many referral redemption attempts. Please try again later.',
    status: 429,
  },
  invalid_code: {
    code: 'REFERRAL_INVALID',
    message: 'That referral code is not valid or cannot be redeemed.',
    status: 400,
  },
  self_referral: {
    code: 'REFERRAL_SELF',
    message: 'You cannot redeem your own referral code.',
    status: 403,
  },
  already_referred: {
    code: 'REFERRAL_ALREADY_APPLIED',
    message: 'You have already applied a referral code to your account.',
    status: 409,
  },
};

/** Reasons that must not reveal whether a code exists. */
const ANTI_ENUMERATION_REDEEM_REASONS = new Set(['invalid_code']);

/**
 * GET /account/referral
 */
router.get('/account/referral', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await getReferralStatsForUser(session.userId);
  if (!result.ok) return ctx.errors.notFound();

  return success(result.data);
});

/**
 * POST /account/referral/codes
 */
router.post('/account/referral/codes', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const body = ctx.body as { code?: unknown; customMessage?: unknown } | undefined;
  const result = await createReferralCodeForUser(session.userId, body);

  if (!result.ok) {
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    const mapped = CREATE_ERROR_MESSAGES[result.reason];
    if (mapped) {
      return error(mapped.code, mapped.message, mapped.status);
    }
    return ctx.errors.internal();
  }

  return success(result.data, undefined, 201);
});

/**
 * PATCH /account/referral/codes/:codeId
 */
router.patch('/account/referral/codes/:codeId', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const codeId = ctx.params.codeId;
  if (!codeId) return ctx.errors.validationFailed();

  const body = ctx.body as { code?: unknown; customMessage?: unknown } | undefined;
  const result = await updateReferralCodeForUser(session.userId, codeId, body);

  if (!result.ok) {
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'not_found') return ctx.errors.notFound();
    if (result.reason === 'validation') {
      return error(
        'REFERRAL_INVALID_CODE',
        'Referral code must be 3–24 characters and contain only letters, numbers, and dashes.',
        400,
      );
    }
    if (result.reason === 'code_taken') {
      return error('REFERRAL_CODE_TAKEN', 'That referral code is already in use.', 409);
    }
    if (result.reason === 'invalid_message') {
      return error('REFERRAL_INVALID_MESSAGE', 'Custom message is invalid.', 400);
    }
    return ctx.errors.internal();
  }

  return success(result.data);
});

/**
 * DELETE /account/referral/codes/:codeId
 */
router.delete('/account/referral/codes/:codeId', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const codeId = ctx.params.codeId;
  if (!codeId) return ctx.errors.validationFailed();

  const result = await deleteReferralCodeForUser(session.userId, codeId);

  if (!result.ok) {
    if (result.reason === 'validation' || result.reason === 'not_found') {
      return ctx.errors.notFound();
    }
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    return ctx.errors.internal();
  }

  return success({ deleted: true });
});

/**
 * POST /account/referral/redeem
 */
router.post('/account/referral/redeem', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const body = ctx.body as { code?: unknown } | undefined;
  const result = await redeemReferralCodeForUser(session.userId, body?.code);

  if (!result.ok) {
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'validation') return ctx.errors.validationFailed();

    const mapped = ANTI_ENUMERATION_REDEEM_REASONS.has(result.reason)
      ? REDEEM_ERROR_MESSAGES.invalid_code
      : REDEEM_ERROR_MESSAGES[result.reason];

    if (mapped) {
      return error(mapped.code, mapped.message, mapped.status);
    }
    return ctx.errors.internal();
  }

  return success(result.data);
});

export const referralRoutes = router;
