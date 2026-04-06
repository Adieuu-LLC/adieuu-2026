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
import { success } from '../../utils/response';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
  getIdentitySession,
} from '../../services/identity.service';
import {
  submitMessageReport,
  submitProfileReport,
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

// ---------------------------------------------------------------------------
// POST /reports — submit a manual report
// ---------------------------------------------------------------------------

router.post('/reports', async (ctx) => {
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) return ctx.errors.unauthorized();

  const identitySession = await getIdentitySession(identitySessionId);
  if (!identitySession) return ctx.errors.unauthorized();

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) return ctx.errors.unauthorized();

  const identityId = identity._id.toHexString();

  // Rate limit
  const rl = await checkRateLimit('report:submit', identityId, REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many reports. Please try again later.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(rl.resetAt - Math.floor(Date.now() / 1000)),
      },
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
      switch (result.errorCode) {
        case 'DUPLICATE_REPORT':
          return ctx.errors.badRequest();
        case 'MESSAGE_NOT_FOUND':
          return ctx.errors.notFound();
        case 'CONVERSATION_NOT_FOUND':
          return ctx.errors.notFound();
        case 'NOT_PARTICIPANT':
          return ctx.errors.forbidden();
        case 'DELETED_MESSAGE':
          return ctx.errors.badRequest();
        case 'MISSING_SESSION_KEY':
        case 'DECRYPTION_FAILED':
          return ctx.errors.badRequest();
        default:
          return ctx.errors.badRequest();
      }
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
    switch (result.errorCode) {
      case 'DUPLICATE_REPORT':
        return ctx.errors.badRequest();
      case 'IDENTITY_NOT_FOUND':
        return ctx.errors.notFound();
      default:
        return ctx.errors.badRequest();
    }
  }

  return success({ reportId: result.reportId }, 'Report submitted.');
});

export const reportRoutes = router;
