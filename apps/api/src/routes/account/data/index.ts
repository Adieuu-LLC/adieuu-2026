/**
 * Account data routes.
 *
 * Provides data export (GDPR portability) and account deletion endpoints.
 * All routes require an account session.
 *
 * @module routes/account/data
 */

import { Router } from '../../../router';
import { success } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import { getUserRepository } from '../../../repositories/user.repository';
import {
  gatherAccountData,
  requestAccountDeletion,
  confirmAccountDeletion,
} from './controller';
import { getClientIp } from '../../auth/controller';

const router = new Router();

/**
 * GET /account/data-export
 *
 * Returns all account-scoped data as a structured JSON object.
 * Sensitive internal fields (Stripe IDs, secrets) are excluded.
 *
 * @route GET /api/account/data-export
 */
router.get('/account/data-export', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.notFound();

  const data = await gatherAccountData(session.userId, user);
  return success(data);
});

/**
 * POST /account/delete/request
 *
 * Sends a 6-digit OTP to the account's email address for deletion
 * verification. Rate-limited to 3 requests per 15 minutes.
 *
 * @route POST /api/account/delete/request
 */
router.post('/account/delete/request', async (ctx) => {
  const { requireCaptchaForFreeTier } = await import('../../../middleware/captcha');
  const captchaError = await requireCaptchaForFreeTier(ctx);
  if (captchaError) return captchaError;

  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const ip = getClientIp(ctx.request);
  const result = await requestAccountDeletion(
    session.userId,
    ip,
  );

  if (!result.ok) {
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'no_email') {
      return ctx.errors.badRequest();
    }
    return ctx.errors.internal();
  }

  return success({ success: true });
});

/**
 * POST /account/delete/confirm
 *
 * Verifies the OTP code and permanently deletes the account.
 * On success, returns logout cookies to clear the session.
 *
 * @route POST /api/account/delete/confirm
 */
router.post('/account/delete/confirm', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const body = ctx.body as { code?: unknown } | undefined;
  const code = typeof body?.code === 'string' ? body.code.trim() : '';

  if (!code || code.length !== 6) {
    return ctx.errors.validationFailed();
  }

  const result = await confirmAccountDeletion(
    session.userId,
    code,
  );

  if (!result.ok) {
    if (result.reason === 'invalid_code') return ctx.errors.verificationFailed();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'no_email') {
      return ctx.errors.badRequest();
    }
    return ctx.errors.internal();
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of result.cookies) {
    headers.append('Set-Cookie', cookie);
  }

  return new Response(
    JSON.stringify({
      success: true,
      meta: { timestamp: new Date().toISOString() },
    }),
    { status: 200, headers },
  );
});

export const accountDataRoutes = router;
