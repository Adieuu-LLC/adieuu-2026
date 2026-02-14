/**
 * User routes module.
 *
 * Provides endpoints for user management including retrieval, creation,
 * and profile updates. User data is returned in a sanitized format to
 * protect sensitive information.
 *
 * @module routes/users
 *
 * @remarks
 * All user identifiers are expected to be UUIDs. Invalid formats will
 * result in a 400 Bad Request response.
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { getUserById } from './controller';
import { z } from '@chadder/shared/schemas';

const router = new Router();

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
 *
 * @example
 * ```json
 * // GET /api/users/550e8400-e29b-41d4-a716-446655440000
 * // Response
 * {
 *   "success": true,
 *   "data": {
 *     "id": "550e8400-e29b-41d4-a716-446655440000",
 *     "email": "user@example.com",
 *     "name": "Example User",
 *     "createdAt": "2026-01-01T00:00:00.000Z",
 *     "updatedAt": "2026-02-14T12:00:00.000Z"
 *   }
 * }
 * ```
 */
router.get('/users/:id', async (ctx) => {
  const id = ctx.params.id;

  if (!id) {
    return errors.badRequest('User ID is required');
  }

  // Validate UUID format
  const parseResult = z.string().uuid().safeParse(id);
  if (!parseResult.success) {
    return errors.badRequest('Invalid user ID format');
  }

  const result = await getUserById(id);

  if (!result.success) {
    return errors.notFound(result.error);
  }

  return success(result.user);
});

export const userRoutes = router;
