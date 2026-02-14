/**
 * Health controller
 * Business logic for health check endpoints
 */

import { checkMongoHealth, checkRedisHealth } from '../../db';

export interface HealthCheck {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

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
 * Determine overall health status based on individual checks
 */
function determineOverallStatus(checks: HealthStatus['checks']): HealthStatus['status'] {
  const allUp = Object.values(checks).every((check) => check.status === 'up');
  const allDown = Object.values(checks).every((check) => check.status === 'down');

  if (allUp) return 'healthy';
  if (allDown) return 'unhealthy';
  return 'degraded';
}

/**
 * Get the current health status of the API
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
 * Simple liveness check (just confirms the server is running)
 */
export function getLivenessStatus(): { alive: true } {
  return { alive: true };
}
