/**
 * Health controller module.
 *
 * Contains the business logic for health check endpoints, including
 * dependency health verification and status aggregation.
 *
 * @module routes/health/controller
 */

import { checkMongoHealth, checkRedisHealth } from '../../db';

/**
 * Represents the health status of an individual dependency.
 *
 * @interface HealthCheck
 * @property status - Whether the dependency is operational ('up') or not ('down')
 * @property latencyMs - Round-trip latency to the dependency in milliseconds (only present when 'up')
 * @property error - Error message describing the failure (only present when 'down')
 */
export interface HealthCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

/**
 * Represents the overall health status of the API.
 *
 * @interface HealthStatus
 * @property status - Aggregated health: 'healthy' (all up), 'degraded' (partial), or 'unhealthy' (all down)
 * @property timestamp - ISO 8601 timestamp when the health check was performed
 * @property version - The API version from package.json
 * @property checks - Individual health check results for each dependency
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    mongodb: HealthCheck;
    redis: HealthCheck;
  };
}

/**
 * Determines the overall health status based on individual dependency checks.
 *
 * Aggregates the status of all dependency health checks into a single
 * overall status value.
 *
 * @param checks - Object containing health check results for each dependency
 * @returns The aggregated health status
 *
 * @remarks
 * Status determination logic:
 * - `'healthy'`: All dependencies are up
 * - `'unhealthy'`: All dependencies are down
 * - `'degraded'`: Some dependencies are up, some are down
 *
 * @internal
 */
function determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
  const allUp = Object.values(checks).every((check) => check.status === 'up');
  const allDown = Object.values(checks).every((check) => check.status === 'down');

  if (allUp) return 'healthy';
  if (allDown) return 'unhealthy';
  return 'degraded';
}

/**
 * Retrieves the current health status of the API and all its dependencies.
 *
 * Performs parallel health checks on MongoDB and Redis, then aggregates
 * the results into a comprehensive health status object.
 *
 * @returns A promise resolving to the complete health status
 *
 * @example
 * ```typescript
 * const status = await getHealthStatus();
 *
 * if (status.status === 'unhealthy') {
 *   // All dependencies are down - trigger alerts
 * } else if (status.status === 'degraded') {
 *   // Partial outage - some functionality may be impacted
 * }
 * ```
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [mongoHealth, redisHealth] = await Promise.all([
    checkMongoHealth(),
    checkRedisHealth(),
  ]);

  const checks = {
    mongodb: mongoHealth,
    redis: redisHealth,
  };

  return {
    status: determineOverallStatus(checks),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.0.0',
    checks,
  };
}

/**
 * Returns a simple liveness status indicating the process is running.
 *
 * This is a synchronous, dependency-free check that simply confirms
 * the Node.js process is alive and able to handle requests.
 *
 * @returns An object with `alive: true`
 *
 * @remarks
 * This function is intentionally trivial. It should never fail if the
 * process is running. Use this for Kubernetes liveness probes.
 */
export function getLivenessStatus(): { alive: true } {
  return { alive: true };
}
