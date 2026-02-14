/**
 * Health check routes
 * GET /api/health - Full health check with DB status
 * GET /api/health/live - Simple liveness check
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { getHealthStatus, getLivenessStatus } from './controller';

const router = new Router();

// GET /health - Full health check
router.get('/health', async () => {
  const status = await getHealthStatus();

  // Return 503 if unhealthy
  const httpStatus = status.status === 'unhealthy' ? 503 : 200;

  return success(status, undefined, httpStatus);
});

// GET /health/live - Simple liveness (for k8s probes)
router.get('/health/live', () => {
  return success(getLivenessStatus());
});

export const healthRoutes = router;
