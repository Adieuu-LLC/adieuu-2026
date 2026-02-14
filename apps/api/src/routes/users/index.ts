/**
 * User routes
 * /api/users/*
 */

import { Router } from '../../router';
import { success, errors } from '../../utils/response';
import { getUserById } from './controller';
import { z } from '@chadder/shared/schemas';

const router = new Router();

// GET /users/:id
router.get('/users/:id', async (ctx) => {
  const { id } = ctx.params;

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
