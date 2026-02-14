/**
 * User routes
 */

import { Router } from '../router';
import { success, errors } from '../utils/response';
import { sanitizeString } from '../utils/sanitize';
import { z } from '@chadder/shared/schemas';

const router = new Router();

// GET /users/:id
router.get('/users/:id', (ctx) => {
  const { id } = ctx.params;

  // Validate UUID format
  const result = z.string().uuid().safeParse(id);
  if (!result.success) {
    return errors.badRequest('Invalid user ID format');
  }

  // TODO: Replace with actual database lookup
  const mockUser = {
    id,
    email: sanitizeString('user@example.com', 'email'),
    name: 'Example User',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return success(mockUser);
});

export const userRoutes = router;
