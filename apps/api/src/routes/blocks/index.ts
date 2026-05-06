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
import {
  postBlockResult,
  deleteBlockResult,
  getBlockedListResult,
  checkBlockedResult,
  checkBlockedEitherResult,
} from './controller';

const router = new Router();

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await postBlockResult(identity._id, ctx.body);
  if (!result.ok) {
    if (result.kind === 'validation_failed') return ctx.errors.validationFailed();
    if (result.kind === 'not_found') return errors.notFound(result.message);
    return errors.badRequest(result.message);
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await deleteBlockResult(identity._id, ctx.params.identityId);
  if (!result.ok) {
    if (result.kind === 'not_found') return errors.notFound(result.message);
    return errors.badRequest(result.message);
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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await getBlockedListResult(identity._id, ctx.query);

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
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await checkBlockedResult(identity._id, ctx.params.identityId);
  if (!result.ok) return errors.badRequest(result.message);

  return success({
    blocked: result.blocked,
    blockedAt: result.blockedAt,
  });
});

/**
 * GET /blocks/check-either/:identityId - Bidirectional block check
 *
 * Checks if either the caller or the target has blocked the other.
 * Used by the conversation view to show a block banner to either party.
 *
 * @route GET /api/blocks/check-either/:identityId
 *
 * @param identityId (string, required): The other identity ID
 *
 * @returns 200 OK with { blockedByEither, blockedByYou }
 * @returns 401 Unauthorized if not authenticated
 */
router.get('/blocks/check-either/:identityId', async (ctx) => {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const result = await checkBlockedEitherResult(identity._id, ctx.params.identityId);
  if (!result.ok) return errors.badRequest(result.message);

  return success({
    blockedByEither: result.blockedByEither,
    blockedByYou: result.blockedByYou,
  });
});

export const blockRoutes = router;
