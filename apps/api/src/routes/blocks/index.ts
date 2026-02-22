/**
 * Blocks routes module.
 *
 * Provides endpoints for managing blocked identities.
 * All endpoints require an authenticated identity session.
 *
 * PRIVACY NOTES:
 * - Blocks are invisible to the blocked party
 * - Only the blocker can see their block list
 * - Cannot check if someone has blocked you
 *
 * @module routes/blocks
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { sanitizeString } from '../../utils/sanitize';
import {
  getIdentityFromSession,
  getIdentitySessionIdFromRequest,
} from '../../services/identity.service';
import {
  blockIdentity,
  unblockIdentity,
  checkIfBlocked,
  getBlockedIdentities,
} from '../../services/block.service';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { toPublicIdentity } from '../../models/identity';
import { z } from '@adieuu/shared/schemas';
import { ObjectId } from 'mongodb';

const router = new Router();

/**
 * Validates that a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id: string): boolean {
  if (!id || id.length !== 24) return false;
  try {
    new ObjectId(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Zod schema for block request
 */
const BlockIdentitySchema = z.object({
  identityId: z.string().length(24),
});

/**
 * POST /blocks - Block an identity
 *
 * Blocks the specified identity. Side effects:
 * - Any existing friendship is removed (both directions)
 * - Any pending friend requests between the identities are cancelled/ignored
 * - Future friend requests from blocked identity are silently ignored
 *
 * @route POST /api/blocks
 *
 * @requestBody
 * - `identityId` (string, required): The identity ID to block
 *
 * @returns 200 OK with success message
 * @returns 400 Bad Request if cannot block yourself or already blocked
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if identity doesn't exist
 */
router.post('/blocks', async (ctx) => {
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
});

/**
 * DELETE /blocks/:identityId - Unblock an identity
 *
 * Removes the block on the specified identity.
 *
 * @route DELETE /api/blocks/:identityId
 *
 * @param identityId (string, required): The identity ID to unblock
 *
 * @returns 200 OK with success message
 * @returns 401 Unauthorized if not authenticated
 * @returns 404 Not Found if block doesn't exist
 */
router.delete('/blocks/:identityId', async (ctx) => {
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
});

/**
 * GET /blocks - Get list of blocked identities
 *
 * Returns the list of identities blocked by the current identity.
 * Uses cursor-based pagination.
 *
 * @route GET /api/blocks
 *
 * @queryParam limit (number, optional): Max results (default: 50, max: 100)
 * @queryParam cursor (string, optional): Pagination cursor
 *
 * @returns 200 OK with array of blocked identities and pagination cursor
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/blocks', async (ctx) => {
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
});

/**
 * GET /blocks/check/:identityId - Check if an identity is blocked
 *
 * Checks if the current identity has blocked the specified identity.
 * NOTE: This only checks if YOU have blocked them, not if they blocked you.
 *
 * @route GET /api/blocks/check/:identityId
 *
 * @param identityId (string, required): The identity ID to check
 *
 * @returns 200 OK with blocked status
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/blocks/check/:identityId', async (ctx) => {
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
});

export const blockRoutes = router;
