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
import { success } from '../../utils/response';
import { requestOtp, verifyOtpHandler, getClientIp } from './controller';
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
    return ctx.errors.validationFailed();
  }

  const { identifier, type } = parseResult.data;
  const clientIp = getClientIp(ctx.request);

  // Process OTP request
  const result = await requestOtp({ identifier, type }, clientIp);

  if (!result.success) {
    if (result.error === 'rate_limited') {
      const response = ctx.errors.rateLimited();
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
    return ctx.errors.badRequest();
  }

  // Always return same message (anti-enumeration)
  return success(undefined, 'If this account exists, a code has been sent.');
});

/**
 * Zod schema for validating OTP verification payloads.
 *
 * @property identifier - The email address or phone number used to request the OTP
 * @property code - The 6-digit OTP code from the user
 */
const VerifyOtpSchema = z.object({
  identifier: z.string().min(1).max(255),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

/**
 * POST /auth/verify - Verify an OTP code for authentication.
 *
 * Completes the passwordless authentication flow by verifying the OTP
 * and creating a session on success.
 *
 * @route POST /api/auth/verify
 *
 * @requestBody
 * - `identifier` (string, required): Email address or phone number
 * - `code` (string, required): The 6-digit OTP code
 *
 * @returns 200 OK with session data on successful verification
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if OTP is invalid, expired, or locked
 * @returns 429 Too Many Requests if in backoff period
 *
 * @security
 * - Implements exponential backoff after failed attempts
 * - Constant-time comparison prevents timing attacks
 * - OTP is single-use (deleted after successful verification)
 *
 * @example
 * ```json
 * // Request body
 * {
 *   "identifier": "user@example.com",
 *   "code": "123456"
 * }
 *
 * // Success response
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJ...",
 *     "expiresIn": 3600
 *   }
 * }
 * ```
 */
router.post('/auth/verify', async (ctx) => {
  const parseResult = VerifyOtpSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { identifier, code } = parseResult.data;
  const clientIp = getClientIp(ctx.request);

  const result = await verifyOtpHandler({ identifier, code }, clientIp);

  if (!result.success) {
    if (result.error === 'backoff' && result.retryAfterSeconds) {
      const response = ctx.errors.rateLimited();
      const headers = new Headers(response.headers);
      headers.set('Retry-After', result.retryAfterSeconds.toString());
      return new Response(response.body, { status: 429, headers });
    }
    if (result.error === 'max_attempts') {
      return ctx.errors.tooManyAttempts();
    }
    return ctx.errors.verificationFailed();
  }

  return success(result.data, 'Authentication successful.');
});

export const authRoutes = router;
