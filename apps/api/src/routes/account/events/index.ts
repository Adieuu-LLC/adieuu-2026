/**
 * Account pending events routes.
 *
 * @module routes/account/events
 */

import { Router } from '../../../router';
import { success } from '../../../utils/response';
import { requireAccountSession } from '../../../services/session.service';
import { checkRateLimit, type RateLimitConfig } from '../../../services/rate-limit.service';
import {
  dismissPendingEventForUser,
  getPendingEventsForUser,
} from './controller';

const router = new Router();

const PENDING_EVENTS_POLL_RATE_LIMIT: RateLimitConfig = { limit: 60, windowSeconds: 60 };

/**
 * GET /account/events/pending
 *
 * Returns pending account events (e.g. subscription upgrades) for polling.
 *
 * @route GET /api/account/events/pending
 */
router.get('/account/events/pending', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const rate = await checkRateLimit(
    'account_events_pending',
    session.userId,
    PENDING_EVENTS_POLL_RATE_LIMIT,
  );
  if (!rate.allowed) return ctx.errors.rateLimited();

  const result = await getPendingEventsForUser(session.userId);
  if (!result.ok) return ctx.errors.notFound();

  return success({ events: result.events });
});

/**
 * POST /account/events/dismiss
 *
 * Dismisses a pending account event after the client has shown it.
 *
 * @route POST /api/account/events/dismiss
 */
router.post('/account/events/dismiss', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const body = ctx.body as { eventId?: unknown } | undefined;
  const result = await dismissPendingEventForUser(session.userId, body?.eventId);

  if (!result.ok) {
    if (result.reason === 'validation') return ctx.errors.validationFailed();
    return ctx.errors.notFound();
  }

  return success({ dismissed: result.dismissed });
});

export const accountEventsRoutes = router;
