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
import { sanitizeString } from '../../utils/sanitize';
import { MAX_IDENTITIES_PER_USER } from '../../services/identity.service';
import { getPlatformCapabilities } from '../../services/platform-capabilities.service';
import {
  buildLogoutCookie,
  getSessionFromRequest,
  getSessionIdFromRequest,
} from '../../services/session.service';
import {
  requestOtp,
  verifyOtpHandler,
  getSessionHandler,
  logoutHandler,
  listSessionsHandler,
  revokeSessionHandler,
  revokeAllSessionsHandler,
  verifyMfaTotpHandler,
  verifyMfaWebAuthnHandler,
  getClientIp,
} from './controller';
import { z } from '@adieuu/shared/schemas';

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
    if (result.error === 'account_locked' && result.retryAfterSeconds) {
      const response = ctx.errors.rateLimited();
      const headers = new Headers(response.headers);
      headers.set('Retry-After', result.retryAfterSeconds.toString());
      return new Response(response.body, { status: 429, headers });
    }
    if (result.error === 'not_allowed') {
      return ctx.errors.signInRestricted();
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
  const userAgent = ctx.request.headers.get('User-Agent') ?? undefined;

  const result = await verifyOtpHandler({ identifier, code }, clientIp, userAgent);

  if (!result.success) {
    if (result.error === 'not_allowed') {
      return ctx.errors.signInRestricted();
    }
    if (result.error === 'backoff' && result.retryAfterSeconds) {
      const response = ctx.errors.rateLimited();
      const headers = new Headers(response.headers);
      headers.set('Retry-After', result.retryAfterSeconds.toString());
      return new Response(response.body, { status: 429, headers });
    }
    if (result.error === 'account_locked' && result.retryAfterSeconds) {
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

  // Check if MFA is required
  if ('mfaRequired' in result && result.mfaRequired) {
    return success({
      mfaRequired: true,
      mfaToken: result.mfaToken,
      mfaOptions: {
        totp: result.mfaOptions.totpEnabled,
        webauthn: result.mfaOptions.webauthnEnabled,
      },
      webauthnChallenge: result.webauthnChallenge?.options,
    }, 'MFA verification required.');
  }

  // Return success with Set-Cookie header (HTTP-only session cookie)
  // At this point we know it's not mfaRequired, so cookie exists
  const cookie = 'cookie' in result ? result.cookie : '';
  const response = success(undefined, 'Authentication successful.');
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
});

/**
 * GET /auth/session - Get current session status.
 *
 * Returns the current user's session information if authenticated.
 * If the cookie holds an identity session, returns `{ sessionType: 'identity' }`
 * so the client can distinguish "wrong session type" from "no session at all".
 *
 * @route GET /api/auth/session
 *
 * @returns 200 OK with session info (account) or `{ sessionType: 'identity' }`
 * @returns 401 Unauthorized if no valid session
 *
 * @security
 * - Session is read from HTTP-only cookie (not accessible to JavaScript)
 * - Does not expose sensitive session internals
 */
router.get('/auth/session', async (ctx) => {
  const result = await getSessionHandler(ctx.request, ctx.accountUser ?? undefined);

  if (!result) {
    // No account session — identity mode: prefer enriched context from
    // `enrichIdentitySession` (subscription labels from decrypted grants + key
    // from cookie, merged with identity overrides). Fall back to Mongo only for
    // edge cases where enrichment did not attach.
    if (ctx.identitySession) {
      const { identity, subscriptions, entitlements } = ctx.identitySession;
      const capabilities = await getPlatformCapabilities(identity._id);
      return success({
        sessionType: 'identity' as const,
        isPlatformAdmin: capabilities.isPlatformAdmin,
        isPlatformModerator: capabilities.isPlatformModerator,
        platformPermissions: capabilities.permissions,
        subscriptions,
        entitlements,
      });
    }

    const rawSession = await getSessionFromRequest(ctx.request);
    if (rawSession?.type === 'identity') {
      const capabilities = await getPlatformCapabilities(rawSession.identityId);
      return success({
        sessionType: 'identity' as const,
        isPlatformAdmin: capabilities.isPlatformAdmin,
        isPlatformModerator: capabilities.isPlatformModerator,
        platformPermissions: capabilities.permissions,
        subscriptions: rawSession.subscriptions,
        entitlements: rawSession.entitlements,
      });
    }
    if (getSessionIdFromRequest(ctx.request)) {
      return ctx.errors.sessionExpiredWithClearCookie();
    }
    return ctx.errors.unauthorized();
  }

  const { session, signedToken, identityCount, maskedIp, geo, subscriptions, entitlements } = result;

  return success({
    identifier: session.identifier,
    identifierType: session.identifierType,
    identityCount,
    maxIdentities: MAX_IDENTITIES_PER_USER,
    signedToken,
    maskedIp,
    geo,
    subscriptions,
    entitlements,
  });
});

/**
 * POST /auth/logout - Log out the current session.
 *
 * Destroys the current user session and identity session (if any),
 * and clears both session cookies.
 *
 * @route POST /api/auth/logout
 *
 * @returns 200 OK with cleared session cookies
 */
router.post('/auth/logout', async (ctx) => {
  const { cookie } = await logoutHandler(ctx.request);

  const response = success(undefined, 'Logged out successfully.');
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
});

/**
 * GET /auth/sessions - List all sessions for the current user.
 *
 * Returns a list of all active sessions for the authenticated user,
 * with the current session marked.
 *
 * @route GET /api/auth/sessions
 *
 * @returns 200 OK with list of sessions
 * @returns 401 Unauthorized if no valid session
 *
 * @security
 * - Requires authenticated session
 * - IP addresses are partially masked for privacy
 */
router.get('/auth/sessions', async (ctx) => {
  const result = await listSessionsHandler(ctx.request);

  if (!result.success) {
    return ctx.errors.unauthorized();
  }

  return success(result.sessions);
});

/**
 * DELETE /auth/sessions/:sessionId - Revoke a specific session.
 *
 * Revokes a specific session by ID. Cannot revoke the current session
 * (use /auth/logout for that).
 *
 * @route DELETE /api/auth/sessions/:sessionId
 *
 * @returns 200 OK on successful revocation
 * @returns 400 Bad Request if trying to revoke current session
 * @returns 401 Unauthorized if no valid session
 * @returns 404 Not Found if session doesn't exist or belongs to another user
 */
router.delete('/auth/sessions/:sessionId', async (ctx) => {
  const sessionId = ctx.params.sessionId;

  if (!sessionId) {
    return ctx.errors.badRequest();
  }

  const result = await revokeSessionHandler(ctx.request, sessionId);

  if (!result.success) {
    if (result.error === 'unauthorized') {
      return ctx.errors.unauthorized();
    }
    if (result.error === 'cannot_revoke_current') {
      return ctx.errors.badRequest();
    }
    return ctx.errors.notFound();
  }

  return success(undefined, 'Session revoked successfully.');
});

/**
 * DELETE /auth/sessions - Revoke all sessions except current.
 *
 * Revokes all sessions for the user except the current one.
 * Useful for "log out all other devices" functionality.
 *
 * @route DELETE /api/auth/sessions
 *
 * @queryParam includeCurrentSession - If 'true', also logs out current session
 *
 * @returns 200 OK with count of revoked sessions
 * @returns 401 Unauthorized if no valid session
 */
router.delete('/auth/sessions', async (ctx) => {
  // Check if we should include current session (full logout)
  const url = new URL(ctx.request.url);
  const includeCurrentSession = url.searchParams.get('includeCurrentSession') === 'true';

  const result = await revokeAllSessionsHandler(ctx.request, includeCurrentSession);

  if (!result.success) {
    return ctx.errors.unauthorized();
  }

  const response = success(
    { revokedCount: result.count },
    `${result.count} session(s) revoked successfully.`
  );

  if (result.cookie) {
    const headers = new Headers(response.headers);
    headers.set('Set-Cookie', result.cookie);
    return new Response(response.body, { status: response.status, headers });
  }

  return response;
});

/**
 * POST /auth/clear-session - Clear the current session (for account→identity transition).
 *
 * Destroys the current session and clears the cookie without fully logging out.
 * Used by the client before creating an identity session.
 *
 * @route POST /api/auth/clear-session
 */
router.post('/auth/clear-session', async (ctx) => {
  const { cookie } = await logoutHandler(ctx.request);

  const response = success(undefined, 'Session cleared.');
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  return new Response(response.body, { status: response.status, headers });
});

// ============================================================================
// MFA Verification Endpoints (during login)
// ============================================================================

const MfaTotpSchema = z.object({
  mfaToken: z.string().min(1),
  code: z.string().length(6),
});

/**
 * POST /auth/mfa/totp - Verify TOTP code during MFA login.
 *
 * After initial OTP verification returns mfaRequired, use this endpoint
 * to complete login with an authenticator app code.
 */
router.post('/auth/mfa/totp', async (ctx) => {
  const parsed = MfaTotpSchema.safeParse(ctx.body);

  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const sanitizedMfaToken = sanitizeString(parsed.data.mfaToken, 'base64url');
  const sanitizedCode = sanitizeString(parsed.data.code, 'authcode');

  if (!sanitizedMfaToken.value || !sanitizedCode.value) {
    return ctx.errors.badRequest();
  }

  const result = await verifyMfaTotpHandler(sanitizedMfaToken.value, sanitizedCode.value);

  if (!result.success) {
    if (result.error === 'invalid_token' || result.error === 'expired') {
      return ctx.errors.unauthorized();
    }
    return ctx.errors.verificationFailed();
  }

  const response = success({ message: 'MFA verification successful' });
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', result.cookie);
  return new Response(response.body, { status: response.status, headers });
});

const MfaWebAuthnSchema = z.object({
  mfaToken: z.string().min(1),
  response: z.any(), // WebAuthn response is complex
});

/**
 * POST /auth/mfa/webauthn - Verify WebAuthn during MFA login.
 *
 * After initial OTP verification returns mfaRequired, use this endpoint
 * to complete login with a passkey.
 */
router.post('/auth/mfa/webauthn', async (ctx) => {
  const parsed = MfaWebAuthnSchema.safeParse(ctx.body);

  if (!parsed.success) {
    return ctx.errors.badRequest();
  }

  const sanitizedMfaToken = sanitizeString(parsed.data.mfaToken, 'base64url');
  if (!sanitizedMfaToken.value) {
    return ctx.errors.badRequest();
  }

  // Note: WebAuthn response is validated by the @simplewebauthn/server library
  const { response: webauthnResponse } = parsed.data;
  const result = await verifyMfaWebAuthnHandler(sanitizedMfaToken.value, webauthnResponse);

  if (!result.success) {
    if (result.error === 'invalid_token' || result.error === 'expired') {
      return ctx.errors.unauthorized();
    }
    return ctx.errors.verificationFailed();
  }

  const response = success({ message: 'MFA verification successful' });
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', result.cookie);
  return new Response(response.body, { status: response.status, headers });
});

export const authRoutes = router;
