/**
 * User routes module.
 *
 * Provides endpoints for user management including profile retrieval,
 * email/phone verification, and profile updates.
 *
 * @module routes/users
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import {
  getUserById,
  getCurrentUserProfile,
  requestEmailVerification,
  verifyEmailAddress,
  requestPhoneVerification,
  verifyPhoneNumber,
} from './controller';
import { getSessionFromRequest } from '../../services/session.service';
import { getClientIp } from '../auth/controller';
import { z, UserThemePreferencesSchema } from '@adieuu/shared/schemas';
import { getUserPreferencesRepository } from '../../repositories/user-preferences.repository';

const router = new Router();

/**
 * GET /users/me - Get current user's profile.
 *
 * Returns the authenticated user's full profile including avatar data.
 *
 * @route GET /api/users/me
 *
 * @returns 200 OK with user profile
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/users/me', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);

  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  const profile = await getCurrentUserProfile(session.userId);

  if (!profile) {
    return ctx.errors.notFound();
  }

  return success(profile);
});

/**
 * Zod schema for email request payload.
 */
const EmailRequestSchema = z.object({
  email: z.string().email().max(255),
});

/**
 * POST /users/me/email - Request email verification.
 *
 * Sends a verification code to the specified email address.
 * Note: We don't check if the email belongs to another user here to prevent
 * account enumeration. That check happens AFTER OTP verification.
 *
 * @route POST /api/users/me/email
 *
 * @requestBody
 * - `email` (string, required): Email address to verify
 *
 * @returns 200 OK - Verification code sent
 * @returns 401 Unauthorized if not authenticated
 * @returns 429 Too Many Requests if rate limited
 */
router.post('/users/me/email', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);

  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  const parseResult = EmailRequestSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { email } = parseResult.data;
  const clientIp = getClientIp(ctx.request);

  const result = await requestEmailVerification(session.userId, email, clientIp);

  if (!result.success) {
    if (result.error === 'rate_limited') {
      return ctx.errors.rateLimited();
    }
    if (result.error === 'already_verified') {
      return success(undefined, 'Email already verified.');
    }
    return ctx.errors.badRequest();
  }

  return success(undefined, 'Verification code sent.');
});

/**
 * Zod schema for email verification payload.
 */
const EmailVerifySchema = z.object({
  email: z.string().email().max(255),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

/**
 * POST /users/me/email/verify - Verify email with OTP.
 *
 * Verifies the email address using the provided OTP code.
 * Note: The check for whether this email belongs to another account happens
 * AFTER OTP verification to prevent enumeration attacks. Only after proving
 * ownership do we reveal if it's already attached to another account.
 *
 * @route POST /api/users/me/email/verify
 *
 * @requestBody
 * - `email` (string, required): Email address being verified
 * - `code` (string, required): 6-digit verification code
 *
 * @returns 200 OK with updated user profile
 * @returns 401 Unauthorized if not authenticated or verification failed
 * @returns 409 Conflict if email belongs to another account (after proving ownership)
 * @returns 429 Too Many Requests if in backoff period
 */
router.post('/users/me/email/verify', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);

  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  const parseResult = EmailVerifySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { email, code } = parseResult.data;

  const result = await verifyEmailAddress(session.userId, email, code);

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
    // User proved ownership but email is attached to another account
    if (result.error === 'already_owned') {
      return ctx.errors.alreadyOwned();
    }
    return ctx.errors.verificationFailed();
  }

  return success(result.user, 'Email verified successfully.');
});

/**
 * Zod schema for phone request payload.
 */
const PhoneRequestSchema = z.object({
  phone: z.string().min(8).max(20).regex(/^[+\d][\d\s\-().]{7,}$/, 'Invalid phone format'),
});

/**
 * POST /users/me/phone - Request phone verification.
 *
 * Sends a verification code to the specified phone number.
 * Note: We don't check if the phone belongs to another user here to prevent
 * account enumeration. That check happens AFTER OTP verification.
 *
 * @route POST /api/users/me/phone
 *
 * @requestBody
 * - `phone` (string, required): Phone number to verify (E.164 format)
 *
 * @returns 200 OK - Verification code sent
 * @returns 401 Unauthorized if not authenticated
 * @returns 429 Too Many Requests if rate limited
 */
router.post('/users/me/phone', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);

  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  const parseResult = PhoneRequestSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { phone } = parseResult.data;
  const clientIp = getClientIp(ctx.request);

  const result = await requestPhoneVerification(session.userId, phone, clientIp);

  if (!result.success) {
    if (result.error === 'rate_limited') {
      return ctx.errors.rateLimited();
    }
    if (result.error === 'already_verified') {
      return success(undefined, 'Phone already verified.');
    }
    return ctx.errors.badRequest();
  }

  return success(undefined, 'Verification code sent.');
});

/**
 * Zod schema for phone verification payload.
 */
const PhoneVerifySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

/**
 * POST /users/me/phone/verify - Verify phone with OTP.
 *
 * Verifies the phone number using the provided OTP code.
 * Note: The check for whether this phone belongs to another account happens
 * AFTER OTP verification to prevent enumeration attacks. Only after proving
 * ownership do we reveal if it's already attached to another account.
 *
 * @route POST /api/users/me/phone/verify
 *
 * @requestBody
 * - `phone` (string, required): Phone number being verified
 * - `code` (string, required): 6-digit verification code
 *
 * @returns 200 OK with updated user profile
 * @returns 401 Unauthorized if not authenticated or verification failed
 * @returns 409 Conflict if phone belongs to another account (after proving ownership)
 * @returns 429 Too Many Requests if in backoff period
 */
router.post('/users/me/phone/verify', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);

  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  const parseResult = PhoneVerifySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { phone, code } = parseResult.data;

  const result = await verifyPhoneNumber(session.userId, phone, code);

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
    // User proved ownership but phone is attached to another account
    if (result.error === 'already_owned') {
      return ctx.errors.alreadyOwned();
    }
    return ctx.errors.verificationFailed();
  }

  return success(result.user, 'Phone verified successfully.');
});

/**
 * GET /users/:id - Retrieve a user by their unique identifier.
 *
 * Fetches a user's public profile information by their UUID.
 *
 * @route GET /api/users/:id
 *
 * @param id - The user's UUID (path parameter)
 *
 * @returns 200 OK with user data if found
 * @returns 400 Bad Request if the ID format is invalid
 * @returns 404 Not Found if no user exists with the given ID
 */
router.get('/users/:id', async (ctx) => {
  const id = ctx.params.id;

  if (!id) {
    return ctx.errors.badRequest();
  }

  // Validate UUID format
  const parseResult = z.string().uuid().safeParse(id);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const result = await getUserById(id);

  if (!result.success) {
    return ctx.errors.notFound();
  }

  return success(result.user);
});

// ============================================================================
// User Preferences (Theme / Appearance)
// ============================================================================

/**
 * GET /users/me/preferences - Get the current user's theme preferences.
 *
 * @route GET /api/users/me/preferences
 *
 * @returns 200 OK with preferences (or empty object if none saved)
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/users/me/preferences', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }

  const repo = getUserPreferencesRepository();
  const prefs = await repo.findByUserId(session.userId);

  return success({
    themeId: prefs?.themeId,
    customThemes: prefs?.customThemes ?? [],
    iconPackId: prefs?.iconPackId,
  });
});

/**
 * PUT /users/me/preferences - Update the current user's theme preferences.
 *
 * @route PUT /api/users/me/preferences
 *
 * @requestBody
 * - `themeId` (string, optional): Selected theme ID
 * - `customThemes` (array, optional): User's custom theme definitions
 *
 * @returns 200 OK on success
 * @returns 401 Unauthorized if not authenticated
 * @returns 400 Bad Request if validation fails
 */
router.put('/users/me/preferences', async (ctx) => {
  const session = await getSessionFromRequest(ctx.request);
  if (!session?.userId) {
    return ctx.errors.unauthorized();
  }

  const parseResult = UserThemePreferencesSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const repo = getUserPreferencesRepository();
  await repo.upsert(session.userId, parseResult.data);

  return success(undefined, 'Preferences updated.');
});

export const userRoutes = router;
