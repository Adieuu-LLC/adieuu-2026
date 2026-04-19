/**
 * User-facing report submission routes.
 *
 * Allows authenticated identities to report messages (with
 * cryptographic E2E evidence verification) and profiles.
 * Reports feed into the existing platform moderation pipeline.
 *
 * @module routes/reports
 */

import { Router } from '../../router';
import { success, error } from '../../utils/response';
import { getErrorMessage } from '../../i18n';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import {
  submitMessageReport,
  submitProfileReport,
  type ReportSubmissionResult,
} from '../../services/report-submission.service';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { REPORT_CATEGORIES } from '../../models/report';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

const REPORT_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 3600 };

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SubmitMessageReportSchema = z.object({
  type: z.literal('message'),
  targetMessageId: z.string().length(24),
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
  sessionKeys: z.record(z.string().length(24), z.string().min(1).max(500)),
});

const SubmitProfileReportSchema = z.object({
  type: z.literal('profile'),
  targetIdentityId: z.string().length(24),
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
});

const SubmitReportSchema = z.discriminatedUnion('type', [
  SubmitMessageReportSchema,
  SubmitProfileReportSchema,
]);

function reportSubmissionErrorResponse(result: ReportSubmissionResult): Response {
  const message = result.error ?? 'Request failed';
  const code = result.errorCode ?? 'BAD_REQUEST';

  switch (result.errorCode) {
    case 'DUPLICATE_REPORT':
      return error(code, message, 409);
    case 'MESSAGE_NOT_FOUND':
    case 'CONVERSATION_NOT_FOUND':
    case 'IDENTITY_NOT_FOUND':
      return error(code, message, 404);
    case 'NOT_PARTICIPANT':
      return error(code, message, 403);
    case 'MISSING_SESSION_KEY':
    case 'DECRYPTION_FAILED':
    case 'DELETED_MESSAGE':
      return error(code, message, 400);
    default:
      return error('BAD_REQUEST', message, 400);
  }
}

// ---------------------------------------------------------------------------
// POST /reports — submit a manual report
// ---------------------------------------------------------------------------

router.post('/reports', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) return ctx.errors.unauthorized();

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) return ctx.errors.sessionExpiredWithClearCookie();

  const identityId = identity._id.toHexString();

  // Rate limit
  const rl = await checkRateLimit('report:submit', identityId, REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    const message = getErrorMessage('rateLimited', ctx.locale);
    const retryAfter = Math.max(0, rl.resetAt - Math.floor(Date.now() / 1000));
    return error('RATE_LIMITED', message, 429, undefined, {
      'Retry-After': String(retryAfter),
    });
  }

  const parseResult = SubmitReportSchema.safeParse(ctx.body);
  if (!parseResult.success) return ctx.errors.validationFailed();

  const data = parseResult.data;

  if (data.type === 'message') {
    // Prevent self-report
    const result = await submitMessageReport(identityId, '', {
      targetMessageId: data.targetMessageId,
      category: data.category as typeof REPORT_CATEGORIES[number],
      reason: data.reason,
      sessionKeys: data.sessionKeys,
    });

    if (!result.success) {
      return reportSubmissionErrorResponse(result);
    }

    return success({ reportId: result.reportId }, 'Report submitted.');
  }

  // Profile report
  if (data.targetIdentityId === identityId) {
    return ctx.errors.badRequest();
  }

  const result = await submitProfileReport(identityId, '', {
    targetIdentityId: data.targetIdentityId,
    category: data.category as typeof REPORT_CATEGORIES[number],
    reason: data.reason,
  });

  if (!result.success) {
    return reportSubmissionErrorResponse(result);
  }

  return success({ reportId: result.reportId }, 'Report submitted.');
});

export const reportRoutes = router;
