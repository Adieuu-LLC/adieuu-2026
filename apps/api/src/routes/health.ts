/**
 * Health check routes
 */

import { Router } from '../router';
import { success } from '../utils/response';

const router = new Router();

// GET /health
router.get('/health', () => {
  return success({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.0',
  });
});

export const healthRoutes = router;
