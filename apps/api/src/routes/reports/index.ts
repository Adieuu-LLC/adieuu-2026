/**
 * User-facing report submission routes.
 *
 * Allows authenticated identities to report messages (with
 * cryptographic E2E evidence verification) and profiles.
 * Reports feed into the existing platform moderation pipeline.
 *
 * @module routes/reports
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import { Router, type RouteContext } from '../../router';
import { success, error } from '../../utils/response';
import { getErrorMessage } from '../../i18n';
import { submitReportResult, type ReportSubmitResult } from './controller';

const router = new Router();

function mapReportSubmitFailure(
  ctx: RouteContext,
  result: Extract<ReportSubmitResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'self_report':
      return ctx.errors.badRequest();
    case 'rate_limited':
      return error('RATE_LIMITED', getErrorMessage('rateLimited', ctx.locale), 429, undefined, {
        'Retry-After': String(result.retryAfter ?? 0),
      });
    case 'duplicate_report':
      return error(result.errorCode ?? 'DUPLICATE_REPORT', result.message ?? 'Request failed', 409);
    case 'not_found':
      return error(result.errorCode ?? 'NOT_FOUND', result.message ?? 'Not found', 404);
    case 'forbidden':
      return error(result.errorCode ?? 'NOT_PARTICIPANT', result.message ?? 'Forbidden', 403);
    case 'bad_request':
      return error(result.errorCode ?? 'BAD_REQUEST', result.message ?? 'Request failed', 400);
  }
}

/**
 * POST /reports — submit a manual report
 *
 * @route POST /api/reports
 */
router.post('/reports', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity, subscriptions } = ctx.identitySession;

  const body = ctx.body as Record<string, unknown> | undefined;
  if (body?.type === 'profile') {
    const hasPaid = subscriptions.some((t: SubscriptionTierId) => t !== 'free');
    if (!hasPaid) {
      return error(
        'FREE_TIER_RESTRICTED',
        'Profile reporting is not available on the free plan.',
        403,
      );
    }
  }

  const result = await submitReportResult(identity._id.toHexString(), ctx.body);
  if (!result.ok) {
    return mapReportSubmitFailure(ctx, result);
  }

  return success({ reportId: result.data.reportId }, 'Report submitted.');
});

export const reportRoutes = router;
