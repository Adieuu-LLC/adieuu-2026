/**
 * Identity routes module.
 *
 * Provides endpoints for anonymous identity management including creation,
 * login, logout, and deletion.
 *
 * @module routes/identity
 *
 * SECURITY ARCHITECTURE:
 * - All identity routes require an authenticated user session
 * - Identities are cryptographically unlinkable to users
 * - Rate limiting with progressive backoff prevents brute force attacks
 * - Lockout notifications alert users to potential attack attempts
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import { getSessionFromRequest } from '../../services/session.service';
import { getUserRepository } from '../../repositories/user.repository';
import {
  getIdentityRepository,
  IDENTITY_SEARCH_DEFAULTS,
} from '../../repositories/identity.repository';
import {
  createIdentity,
  loginToIdentity,
  logoutFromIdentity,
  deleteIdentity,
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
  buildIdentityLogoutCookie,
  MIN_PASSPHRASE_LENGTH,
} from '../../services/identity.service';
import { toPublicIdentity } from '../../models/identity';
import { getClientIp } from '../auth/controller';
import { z } from '@adieuu/shared/schemas';

const router = new Router();

/**
 * GET /identity/search - Search for identities
 *
 * Public endpoint for searching identities by username or display name.
 * Returns public identity information only.
 *
 * @route GET /api/identity/search
 *
 * @queryParam q (string, required): Search query (min 2 characters)
 * @queryParam limit (number, optional): Max results (default: 10, max: 50)
 *
 * @returns 200 OK with array of matching identities
 * @returns 400 Bad Request if query is too short
 */
router.get('/identity/search', async (ctx) => {
  const query = ctx.query.get('q')?.trim() ?? '';
  const limitParam = ctx.query.get('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : IDENTITY_SEARCH_DEFAULTS.DEFAULT_LIMIT;

  if (query.length < IDENTITY_SEARCH_DEFAULTS.MIN_QUERY_LENGTH) {
    return errors.badRequest(
      `Search query must be at least ${IDENTITY_SEARCH_DEFAULTS.MIN_QUERY_LENGTH} characters.`
    );
  }

  if (isNaN(limit) || limit < 1) {
    return errors.badRequest('Invalid limit parameter.');
  }

  const identityRepo = getIdentityRepository();
  const results = await identityRepo.search(query, limit);

  return success(results.map(toPublicIdentity));
});

/**
 * GET /identity/:id - Get a public identity by ID
 *
 * Public endpoint for fetching a specific identity's public profile.
 *
 * @route GET /api/identity/:id
 *
 * @param id (string, required): Identity ID
 *
 * @returns 200 OK with identity profile
 * @returns 404 Not Found if identity doesn't exist
 */
router.get('/identity/:id', async (ctx) => {
  const identityId = ctx.params.id;

  if (!identityId || identityId.length !== 24) {
    return errors.badRequest('Invalid identity ID.');
  }

  const identityRepo = getIdentityRepository();
  const identity = await identityRepo.findByIdentityId(identityId);

  if (!identity) {
    return errors.notFound('Identity not found.');
  }

  return success(toPublicIdentity(identity));
});

/**
 * Zod schema for identity creation
 */
const CreateIdentitySchema = z.object({
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  displayName: z.string().min(1).max(50),
});

/**
 * POST /identity - Create a new identity
 *
 * Creates a new anonymous identity for the authenticated user.
 * The identity is cryptographically unlinkable to the user.
 *
 * @route POST /api/identity
 *
 * @requestBody
 * - `passphrase` (string, required): Min 8 characters
 * - `username` (string, required): 3-30 chars, alphanumeric + underscores/hyphens
 * - `displayName` (string, required): 1-50 characters
 *
 * @returns 200 OK with identity data
 * @returns 400 Bad Request if validation fails
 * @returns 401 Unauthorized if not authenticated
 * @returns 409 Conflict if username is taken or max identities reached
 */
router.post('/identity', async (ctx) => {
  // Require authenticated user session
  const session = await getSessionFromRequest(ctx.request);
  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = CreateIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { passphrase, username, displayName: rawDisplayName } = parseResult.data;

  // Sanitize displayName to remove control characters and other problematic chars
  // Note: We don't log sanitization details to avoid log injection vectors
  const { value: displayName } = sanitizeString(rawDisplayName, 'general');
  if (!displayName || displayName.length === 0) {
    return ctx.errors.validationFailed();
  }

  // Get user to obtain createdAt for salt
  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) {
    return ctx.errors.unauthorized();
  }

  // Create identity
  const result = await createIdentity(
    user._id,
    user.createdAt,
    passphrase,
    username,
    displayName
  );

  if (!result.success) {
    if (result.errorCode === 'MAX_IDENTITIES') {
      return errors.conflict('Maximum number of identities reached.');
    }
    if (result.errorCode === 'USERNAME_TAKEN') {
      return errors.conflict('Username is already taken.');
    }
    return errors.badRequest(result.error ?? 'Identity creation failed.');
  }

  return success(result.identity, 'Identity created successfully.');
});

/**
 * Zod schema for identity login
 */
const LoginIdentitySchema = z.object({
  passphrase: z.string().min(1),
});

/**
 * POST /identity/login - Login to an identity
 *
 * Authenticates to an identity using the passphrase.
 * Creates an identity session cookie on success.
 *
 * @route POST /api/identity/login
 *
 * @requestBody
 * - `passphrase` (string, required): The identity passphrase
 *
 * @returns 200 OK with identity data and session cookie
 * @returns 401 Unauthorized if passphrase is invalid
 * @returns 429 Too Many Requests if rate limited or locked out
 */
router.post('/identity/login', async (ctx) => {
  // Require authenticated user session
  const session = await getSessionFromRequest(ctx.request);
  if (!session || !session.userId) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = LoginIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { passphrase } = parseResult.data;
  const clientIp = getClientIp(ctx.request);
  const userAgent = ctx.request.headers.get('User-Agent') ?? undefined;

  // Get user to obtain createdAt for salt
  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) {
    return ctx.errors.unauthorized();
  }

  // Attempt login
  const result = await loginToIdentity(
    user._id,
    user.createdAt,
    passphrase,
    { userAgent, ipAddress: clientIp }
  );

  if (!result.success) {
    // Handle different error codes
    if (result.errorCode === 'LOCKED_OUT' || result.errorCode === 'RATE_LIMITED') {
      const response = ctx.errors.rateLimited();
      if (result.retryAfter) {
        const headers = new Headers(response.headers);
        headers.set('Retry-After', result.retryAfter.toString());

        // Include helpful message in body
        const body = JSON.stringify({
          success: false,
          error: result.error,
          retryAfter: result.retryAfter,
          attemptNumber: result.attemptNumber,
        });

        return new Response(body, {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': result.retryAfter.toString(),
          },
        });
      }
      return response;
    }

    if (result.errorCode === 'INVALID_PASSPHRASE') {
      // Return 401 with attempt info so client can show helpful message
      const body = JSON.stringify({
        success: false,
        error: result.error,
        attemptNumber: result.attemptNumber,
        retryAfter: result.retryAfter,
      });

      return new Response(body, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return ctx.errors.unauthorized();
  }

  // Success - set identity session cookie
  // Wrap identity in an object to match the expected IdentityLoginResponse type
  const response = success({ identity: result.identity }, 'Identity login successful.');
  const headers = new Headers(response.headers);
  if (result.cookie) {
    headers.set('Set-Cookie', result.cookie);
  }
  return new Response(response.body, { status: response.status, headers });
});

/**
 * POST /identity/logout - Logout from identity
 *
 * Revokes the current identity session and clears the identity cookie.
 *
 * @route POST /api/identity/logout
 *
 * @returns 200 OK with cleared identity cookie
 */
router.post('/identity/logout', async (ctx) => {
  // Get identity session from cookie
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);

  if (identitySessionId) {
    await logoutFromIdentity(identitySessionId);
  }

  // Clear the identity cookie
  const logoutCookie = buildIdentityLogoutCookie();

  const response = success(undefined, 'Identity logout successful.');
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', logoutCookie);
  return new Response(response.body, { status: response.status, headers });
});

/**
 * GET /identity/session - Get current identity session
 *
 * Returns the current identity's public profile if logged in.
 *
 * @route GET /api/identity/session
 *
 * @returns 200 OK with identity profile
 * @returns 401 Unauthorized if not logged into an identity
 */
router.get('/identity/session', async (ctx) => {
  // Require authenticated user session
  const userSession = await getSessionFromRequest(ctx.request);
  if (!userSession || !userSession.userId) {
    return ctx.errors.unauthorized();
  }

  // Get identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  return success(toPublicIdentity(identity));
});

/**
 * DELETE /identity - Delete the current identity
 *
 * Soft-deletes the current identity. The identity record remains
 * for historical references (chats, posts) but the ident hash is cleared.
 *
 * @route DELETE /api/identity
 *
 * @returns 200 OK with cleared identity cookie
 * @returns 401 Unauthorized if not logged into an identity
 */
router.delete('/identity', async (ctx) => {
  // Require authenticated user session
  const userSession = await getSessionFromRequest(ctx.request);
  if (!userSession || !userSession.userId) {
    return ctx.errors.unauthorized();
  }

  // Get identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Delete the identity
  const result = await deleteIdentity(identity._id, identitySessionId);
  if (!result.success) {
    return errors.badRequest(result.error ?? 'Identity deletion failed.');
  }

  // Clear the identity cookie
  const logoutCookie = buildIdentityLogoutCookie();

  const response = success(undefined, 'Identity deleted successfully.');
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', logoutCookie);
  return new Response(response.body, { status: response.status, headers });
});

export const identityRoutes = router;
