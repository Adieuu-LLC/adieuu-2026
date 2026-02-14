/**
 * Route aggregator
 */

import { Router } from '../router';
import { healthRoutes } from './health';
import { userRoutes } from './users';

export function registerRoutes(app: Router): void {
  // Health routes at /api
  app.merge(healthRoutes, '/api');

  // User routes at /api
  app.merge(userRoutes, '/api');
}
