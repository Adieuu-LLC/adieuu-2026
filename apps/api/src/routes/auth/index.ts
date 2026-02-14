/**
 * Auth routes
 * /api/auth/*
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { requestOtp, getClientIp } from './controller';
import { z } from '@chadder/shared/schemas';

const router = new Router();

/**
 * Request OTP schema
 */
const RequestOtpSchema = z.object({
  identifier: z.string().min(1).max(255),
  type: z.enum(['email', 'sms']),
}).refine((data) => {
  if (data.type === 'email') {
    return z.string().email().safeParse(data.identifier).success;
  }
  if (data.type === 'sms') {
    // Basic phone validation - should be E.164 or common formats
    // Full validation happens in sanitizeString
    return /^[+\d][\d\s\-().]{7,}$/.test(data.identifier);
  }
  return false;
}, {
  message: 'Invalid identifier format for the specified type',
});

/**
 * POST /auth/request
 * Request an OTP to be sent via email or SMS
 */
router.post('/auth/request', async (ctx) => {
  // Validate request body
  const parseResult = RequestOtpSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return errors.badRequest(parseResult.error.errors[0]?.message ?? 'Invalid request');
  }

  const { identifier, type } = parseResult.data;
  const clientIp = getClientIp(ctx.request);

  // Process OTP request
  const result = await requestOtp({ identifier, type }, clientIp);

  if (!result.success) {
    if (result.error === 'rate_limited') {
      const response = errors.rateLimited();
      // Add rate limit headers
      if (result.rateLimitResult) {
        const headers = new Headers(response.headers);
        headers.set('X-RateLimit-Limit', result.rateLimitResult.limit.toString());
        headers.set('X-RateLimit-Remaining', result.rateLimitResult.remaining.toString());
        headers.set('X-RateLimit-Reset', result.rateLimitResult.resetAt.toString());
        headers.set('Retry-After', Math.ceil(result.rateLimitResult.resetAt - Date.now() / 1000).toString());
        return new Response(response.body, { status: 429, headers });
      }
      return response;
    }
    return errors.badRequest('Invalid request');
  }

  // Always return same message (anti-enumeration)
  return success(undefined, 'If this account exists, a code has been sent.');
});

export const authRoutes = router;

