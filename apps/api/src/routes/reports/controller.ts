/**
 * Reports controller — validation, rate limiting, and report submission orchestration.
 *
 * Route modules map structured results to HTTP responses.
 *
 * @module routes/reports/controller
 */

import { z } from '@adieuu/shared/schemas';
import { isReportContextMessageCount } from '@adieuu/shared';
import { REPORT_CATEGORIES } from '../../models/report';
import {
  submitMessageReport,
  submitProfileReport,
  type ReportSubmissionResult,
} from '../../services/report-submission.service';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { sanitizeString, sanitizeObjectId } from '../../utils/sanitize';

const REPORT_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 3600 };

const SubmitMessageReportSchema = z.object({
  type: z.literal('message'),
  targetMessageId: z.string().length(24),
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
  contextMessageCount: z
    .number()
    .refine((n): n is 3 | 5 | 10 | 25 => isReportContextMessageCount(n), {
      message: 'Invalid contextMessageCount',
    }),
  sessionKeys: z.record(z.string().length(24), z.string().min(1).max(500)),
});

const SubmitProfileReportSchema = z.object({
  type: z.literal('profile'),
  targetIdentityId: z.string().length(24),
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
});

/** Zod schema for POST /reports body */
export const SubmitReportSchema = z.discriminatedUnion('type', [
  SubmitMessageReportSchema,
  SubmitProfileReportSchema,
]);

export type ReportSubmitFailureKind =
  | 'validation_failed'
  | 'self_report'
  | 'rate_limited'
  | 'duplicate_report'
  | 'not_found'
  | 'forbidden'
  | 'bad_request';

export type ReportSubmitResult =
  | { ok: true; data: { reportId: string } }
  | {
      ok: false;
      kind: ReportSubmitFailureKind;
      message?: string;
      errorCode?: string;
      retryAfter?: number;
    };

function mapSubmissionFailure(result: ReportSubmissionResult): Extract<ReportSubmitResult, { ok: false }> {
  const message = result.error ?? 'Request failed';
  const errorCode = result.errorCode ?? 'BAD_REQUEST';

  switch (result.errorCode) {
    case 'DUPLICATE_REPORT':
      return { ok: false, kind: 'duplicate_report', message, errorCode };
    case 'MESSAGE_NOT_FOUND':
    case 'CONVERSATION_NOT_FOUND':
    case 'IDENTITY_NOT_FOUND':
      return { ok: false, kind: 'not_found', message, errorCode };
    case 'NOT_PARTICIPANT':
      return { ok: false, kind: 'forbidden', message, errorCode };
    case 'MISSING_SESSION_KEY':
    case 'DECRYPTION_FAILED':
    case 'DELETED_MESSAGE':
    case 'BAD_REQUEST':
      return { ok: false, kind: 'bad_request', message, errorCode };
    default:
      return { ok: false, kind: 'bad_request', message, errorCode: 'BAD_REQUEST' };
  }
}

/**
 * Validates, rate-limits, and submits a user report (message or profile).
 */
export async function submitReportResult(
  identityId: string,
  body: unknown,
): Promise<ReportSubmitResult> {
  const rl = await checkRateLimit('report:submit', identityId, REPORT_RATE_LIMIT);
  if (!rl.allowed) {
    const retryAfter = Math.max(0, rl.resetAt - Math.floor(Date.now() / 1000));
    return { ok: false, kind: 'rate_limited', retryAfter };
  }

  const parseResult = SubmitReportSchema.safeParse(body);
  if (!parseResult.success) {
    return { ok: false, kind: 'validation_failed' };
  }

  const data = parseResult.data;

  if (data.type === 'message') {
    const targetMsgId = sanitizeObjectId(data.targetMessageId);
    if (!targetMsgId.ok) return { ok: false, kind: 'validation_failed' };
    const sanitizedTargetMessageId = targetMsgId.id;

    const sanitizedReason = data.reason
      ? sanitizeString(data.reason, 'general').value || undefined
      : undefined;

    const sanitizedSessionKeys: Record<string, string> = {};
    const seenKeys = new Set<string>();
    for (const [key, value] of Object.entries(data.sessionKeys)) {
      const sKey = sanitizeObjectId(key);
      if (!sKey.ok) return { ok: false, kind: 'validation_failed' };
      if (seenKeys.has(sKey.id)) return { ok: false, kind: 'validation_failed' };
      seenKeys.add(sKey.id);
      sanitizedSessionKeys[sKey.id] = value;
    }

    const result = await submitMessageReport(identityId, {
      targetMessageId: sanitizedTargetMessageId,
      category: data.category as (typeof REPORT_CATEGORIES)[number],
      reason: sanitizedReason,
      contextMessageCount: data.contextMessageCount,
      sessionKeys: sanitizedSessionKeys,
    });

    if (!result.success) {
      return mapSubmissionFailure(result);
    }

    if (!result.reportId) {
      return { ok: false, kind: 'bad_request', message: 'Request failed', errorCode: 'BAD_REQUEST' };
    }

    return { ok: true, data: { reportId: result.reportId } };
  }

  const targetIdResult = sanitizeObjectId(data.targetIdentityId);
  if (!targetIdResult.ok) return { ok: false, kind: 'validation_failed' };
  const sanitizedTargetIdentityId = targetIdResult.id;

  if (sanitizedTargetIdentityId === identityId) {
    return { ok: false, kind: 'self_report' };
  }

  const sanitizedProfileReason = data.reason
    ? sanitizeString(data.reason, 'general').value || undefined
    : undefined;

  const result = await submitProfileReport(identityId, {
    targetIdentityId: sanitizedTargetIdentityId,
    category: data.category as (typeof REPORT_CATEGORIES)[number],
    reason: sanitizedProfileReason,
  });

  if (!result.success) {
    return mapSubmissionFailure(result);
  }

  if (!result.reportId) {
    return { ok: false, kind: 'bad_request', message: 'Request failed', errorCode: 'BAD_REQUEST' };
  }

  return { ok: true, data: { reportId: result.reportId } };
}
