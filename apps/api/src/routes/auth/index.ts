/**
 * Authentication routes module.
 *
 * Handles all authentication-related endpoints including OTP (One-Time Password)
 * request and verification flows. These routes support passwordless authentication
 * via email and SMS delivery channels.
 *
 * @module routes/auth
 *
 * @security
 * - Rate limiting is applied per identifier and per IP address
 * - Responses are designed to prevent user enumeration attacks
 * - All identifiers are sanitized and validated before processing
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { requestOtp, getClientIp } from './controller';
import { z } from '@chadder/shared/schemas';

const router = new Router();

/**
 * Zod schema for validating OTP request payloads.
 *
 * @property identifier - The email address or phone number to send the OTP to
 * @property type - The delivery channel: 'email' for email delivery, 'sms' for SMS
 *
 * @remarks
 * The schema includes a refinement that validates the identifier format based on
 * the specified type:
 * - For 'email': Must be a valid email address format
 * - For 'sms': Must match E.164 or common phone number formats
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
 * POST /auth/request - Request a one-time password (OTP) for authentication.
 *
 * Initiates the passwordless authentication flow by generating and sending
 * an OTP to the specified email address or phone number.
 *
 * @route POST /api/auth/request
 *
 * @requestBody
 * - `identifier` (string, required): Email address or phone number
 * - `type` ('email' | 'sms', required): Delivery channel for the OTP
 *
 * @returns 200 OK with success message on valid request
 * @returns 400 Bad Request if validation fails
 * @returns 429 Too Many Requests if rate limit exceeded (includes Retry-After header)
 *
 * @security
 * - Rate limited by both identifier and IP address
 * - Returns consistent response regardless of whether the identifier exists
 *   (anti-enumeration measure)
 * - Adds timing jitter to prevent timing-based attacks
 *
 * @example
 * ```json
 * // Request body
 * {
 *   "identifier": "user@example.com",
 *   "type": "email"
 * }
 *
 * // Success response
 * {
 *   "success": true,
 *   "message": "If this account exists, a code has been sent."
 * }
 * ```
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
