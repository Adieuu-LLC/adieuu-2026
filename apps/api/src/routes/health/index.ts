/**
 * Health check routes module.
 *
 * Provides endpoints for monitoring the API's health status. These endpoints
 * are designed for use with orchestration systems (Kubernetes, Docker Swarm)
 * and monitoring tools (Prometheus, Datadog).
 *
 * @module routes/health
 *
 * @remarks
 * Two types of health checks are provided:
 * - **Full health check** (`/health`): Checks all dependencies (MongoDB, Redis)
 *   and returns detailed status information
 * - **Liveness probe** (`/health/live`): Simple check that confirms the process
 *   is running (no dependency checks)
 */

import { Router } from '../../router';
import { success } from '../../utils/response';
import { getHealthStatus, getLivenessStatus } from './controller';

const router = new Router();

/**
 * GET /health - Full health check with dependency status.
 *
 * Performs comprehensive health checks on all system dependencies and returns
 * detailed status information including individual component health.
 *
 * @route GET /api/health
 *
 * @returns 200 OK with health status when healthy or degraded
 * @returns 503 Service Unavailable when unhealthy
 *
 * @example
 * ```json
 * // Response body
 * {
 *   "success": true,
 *   "data": {
 *     "status": "healthy",
 *     "timestamp": "2026-02-14T12:00:00.000Z",
 *     "version": "1.0.0",
 *     "checks": {
 *       "mongodb": { "status": "up", "latencyMs": 5 },
 *       "redis": { "status": "up", "latencyMs": 2 }
 *     }
 *   }
 * }
 * ```
 */
router.get('/health', async () => {
  const status = await getHealthStatus();

  // Return 503 if unhealthy
  const httpStatus = status.status === 'unhealthy' ? 503 : 200;

  return success(status, undefined, httpStatus);
});

/**
 * GET /health/live - Simple liveness probe.
 *
 * A lightweight endpoint that confirms the API process is running and
 * responsive. Does not check external dependencies, making it suitable
 * for Kubernetes liveness probes where you only want to restart crashed pods.
 *
 * @route GET /api/health/live
 *
 * @returns 200 OK with `{ alive: true }` if the process is running
 *
 * @remarks
 * Use this endpoint for Kubernetes `livenessProbe` configuration.
 * For readiness checks (should traffic be routed?), use `/health` instead.
 *
 * @example
 * ```yaml
 * # Kubernetes deployment configuration
 * livenessProbe:
 *   httpGet:
 *     path: /api/health/live
 *     port: 3000
 *   initialDelaySeconds: 3
 *   periodSeconds: 10
 * ```
 */
router.get('/health/live', () => {
  return success(getLivenessStatus());
});

export const healthRoutes = router;
