/**
 * Identity controller module.
 *
 * Contains the business logic for identity management endpoints including
 * creation, login, logout, deletion, and blocklist management.
 *
 * @module routes/identity/controller
 */

import { success, errors } from '../../utils/response';
import { RouteContext } from '../../router';
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
import {
  blockIdentity,
  unblockIdentity,
  checkIfBlocked,
  getBlockedIdentities,
  getBlockedIdentityIds,
} from '../../services/block.service';
import { toPublicIdentity } from '../../models/identity';
import { getClientIp } from '../auth/controller';
import { isValidObjectId } from '../../utils';
import { z } from '@adieuu/shared/schemas';

// ============================================================================
// Zod Schemas
// ============================================================================

const CreateIdentitySchema = z.object({
  passphrase: z.string().min(MIN_PASSPHRASE_LENGTH),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens'),
  displayName: z.string().min(1).max(50),
});

const LoginIdentitySchema = z.object({
  passphrase: z.string().min(1),
});

const BlockIdentitySchema = z.object({
  identityId: z.string().length(24),
});

// ============================================================================
// Identity Search & Profile Controllers
// ============================================================================

export async function searchIdentitiesCtrl(ctx: RouteContext): Promise<Response> {
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

  // Get blocked identity IDs if caller has an identity session
  let excludeIds;
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (identitySessionId) {
    const identity = await getIdentityFromSession(identitySessionId);
    if (identity) {
      excludeIds = await getBlockedIdentityIds(identity._id);
    }
  }

  const identityRepo = getIdentityRepository();
  const results = await identityRepo.search(query, limit, excludeIds);

  return success(results.map(toPublicIdentity));
}

export async function getIdentityByIdCtrl(ctx: RouteContext): Promise<Response> {
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
}

// ============================================================================
// Identity CRUD Controllers
// ============================================================================

export async function createIdentityCtrl(ctx: RouteContext): Promise<Response> {
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

  // Sanitize displayName
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
}

export async function loginIdentityCtrl(ctx: RouteContext): Promise<Response> {
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
  const response = success({ identity: result.identity }, 'Identity login successful.');
  const headers = new Headers(response.headers);
  if (result.cookie) {
    headers.set('Set-Cookie', result.cookie);
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function logoutIdentityCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function getIdentitySessionCtrl(ctx: RouteContext): Promise<Response> {
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
}

export async function deleteIdentityCtrl(ctx: RouteContext): Promise<Response> {
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
}

// ============================================================================
// Blocklist Controllers
// ============================================================================

export async function getBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Parse pagination params
  const limitParam = ctx.query.get('limit');
  const cursor = ctx.query.get('cursor');

  let limit = limitParam ? parseInt(limitParam, 10) : 50;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  // Validate cursor if provided
  let validCursor: string | undefined;
  if (cursor) {
    const sanitizedCursor = sanitizeString(cursor, 'general');
    if (sanitizedCursor.value && isValidObjectId(sanitizedCursor.value)) {
      validCursor = sanitizedCursor.value;
    }
  }

  const result = await getBlockedIdentities(identity._id, limit, validCursor);

  return success({
    blocks: result.blocks,
    cursor: result.cursor,
  });
}

export async function addToBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  // Validate request body
  const parseResult = BlockIdentitySchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const { identityId } = parseResult.data;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(identityId, 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await blockIdentity(identity._id, sanitized.value);

  if (!result.success) {
    switch (result.errorCode) {
      case 'CANNOT_BLOCK_SELF':
        return errors.badRequest('Cannot block yourself.');
      case 'ALREADY_BLOCKED':
        return errors.badRequest('Identity already blocked.');
      case 'IDENTITY_NOT_FOUND':
        return errors.notFound('Identity not found.');
      default:
        return errors.badRequest(result.error ?? 'Block failed.');
    }
  }

  return success(undefined, 'Identity blocked.');
}

export async function removeFromBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { identityId } = ctx.params;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await unblockIdentity(identity._id, sanitized.value);

  if (!result.success) {
    if (result.errorCode === 'BLOCK_NOT_FOUND') {
      return errors.notFound('Block not found.');
    }
    return errors.badRequest(result.error ?? 'Unblock failed.');
  }

  return success(undefined, 'Identity unblocked.');
}

export async function checkBlocklistCtrl(ctx: RouteContext): Promise<Response> {
  // Require identity session
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

  const { identityId } = ctx.params;

  // Sanitize and validate identity ID
  const sanitized = sanitizeString(identityId ?? '', 'general');
  if (!sanitized.value || !isValidObjectId(sanitized.value)) {
    return errors.badRequest('Invalid identity ID.');
  }

  const result = await checkIfBlocked(identity._id, sanitized.value);

  return success({
    blocked: result.blocked,
    blockedAt: result.blockedAt,
  });
}
