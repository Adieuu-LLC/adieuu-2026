/**
 * Sponsorship routes.
 *
 * All routes require an account session.
 *
 * @module routes/sponsorship
 */

import { Router } from '../../router';
import { success, error } from '../../utils/response';
import { requireAccountSession } from '../../services/session.service';
import {
  getSponsorshipStatus,
  createSponsorshipRequest,
  withdrawSponsorshipRequest,
  getSponsorshipDirectory,
  createSponsorshipCheckout,
} from './controller';

const router = new Router();

/**
 * GET /sponsorship/status
 *
 * Returns the current user's own sponsorship request status.
 */
router.get('/sponsorship/status', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await getSponsorshipStatus(session.userId);
  if (!result.ok) return ctx.errors.notFound();

  return success(result.data);
});

/**
 * POST /sponsorship/request
 *
 * Create a sponsorship request (adds entry to directory).
 */
router.post('/sponsorship/request', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await createSponsorshipRequest(session.userId, ctx.body);

  if (!result.ok) {
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'has_subscription') {
      return error('HAS_SUBSCRIPTION', 'Users with an active subscription cannot request sponsorship.', 409);
    }
    if (result.reason === 'already_requested') {
      return error('ALREADY_REQUESTED', 'You already have a sponsorship request.', 409);
    }
    if (result.reason === 'stripe_disabled') {
      return error('SERVICE_UNAVAILABLE', 'Sponsorship is temporarily unavailable.', 503);
    }
    return ctx.errors.internal();
  }

  return success({ id: result.id }, undefined, 201);
});

/**
 * DELETE /sponsorship/request
 *
 * Withdraw own sponsorship request.
 */
router.delete('/sponsorship/request', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await withdrawSponsorshipRequest(session.userId);

  if (!result.ok) {
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'no_active_request') {
      return error('NO_ACTIVE_REQUEST', 'No active sponsorship request to withdraw.', 404);
    }
    return ctx.errors.internal();
  }

  return success({ success: true });
});

/**
 * GET /sponsorship/directory
 *
 * Paginated list of active sponsorship requests.
 */
router.get('/sponsorship/directory', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const url = new URL(ctx.request.url);
  const cursor = url.searchParams.get('cursor') ?? undefined;

  const result = await getSponsorshipDirectory(session.userId, cursor);

  if (!result.ok) {
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    return ctx.errors.internal();
  }

  return success(result.data);
});

/**
 * POST /sponsorship/checkout
 *
 * Sponsor initiates checkout for a specific request + chosen product.
 */
router.post('/sponsorship/checkout', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const result = await createSponsorshipCheckout(session.userId, ctx.body);

  if (!result.ok) {
    if (result.reason === 'stripe_disabled') {
      return error('SERVICE_UNAVAILABLE', 'Sponsorship is temporarily unavailable.', 503);
    }
    if (result.reason === 'rate_limited') return ctx.errors.rateLimited();
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    if (result.reason === 'user_not_found') return ctx.errors.notFound();
    if (result.reason === 'request_not_found' || result.reason === 'request_not_active') {
      return error('REQUEST_UNAVAILABLE', 'This sponsorship request is no longer available.', 404);
    }
    if (result.reason === 'self_sponsor') {
      return error('SELF_SPONSOR', 'You cannot sponsor your own request.', 409);
    }
    if (result.reason === 'billing_config') {
      return error('SERVICE_UNAVAILABLE', 'Sponsorship is temporarily unavailable.', 503);
    }
    return ctx.errors.internal();
  }

  return success({ url: result.url });
});

export const sponsorshipRoutes = router;
