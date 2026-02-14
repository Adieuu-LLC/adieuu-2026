/**
 * Route aggregator
 * Registers all routes with the main router
 */

import { Router } from '../router';
import { healthRoutes } from './health';
import { userRoutes } from './users';
import { authRoutes } from './auth';

export function registerRoutes(app: Router): void {
  // Health routes at /api
  app.merge(healthRoutes, '/api');

  // Auth routes at /api
  app.merge(authRoutes, '/api');

  // User routes at /api
  app.merge(userRoutes, '/api');
}
