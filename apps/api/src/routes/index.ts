/**
 * Route aggregator module.
 *
 * This module serves as the central hub for registering all API route modules
 * with the main application router. Each route module is merged into the app
 * router under the `/api` prefix.
 *
 * @module routes
 */

import { Router } from '../router';
import { healthRoutes } from './health';
import { userRoutes } from './users';
import { authRoutes } from './auth';
import mfaRoutes from './mfa';
import { identityRoutes } from './identity';

/**
 * Registers all application routes with the main router.
 *
 * This function aggregates all route modules and mounts them under the `/api` prefix.
 * Route modules include:
 * - `/api/health` - Health check and liveness endpoints
 * - `/api/auth` - Authentication endpoints (OTP request, verification)
 * - `/api/users` - User management endpoints
 * - `/api/identity` - Anonymous identity management endpoints
 *
 * @param app - The main application router instance to register routes on
 *
 * @example
 * ```typescript
 * import { Router } from './router';
 * import { registerRoutes } from './routes';
 *
 * const app = new Router();
 * registerRoutes(app);
 * ```
 */
export function registerRoutes(app: Router): void {
  // Health routes at /api
  app.merge(healthRoutes, '/api');

  // Auth routes at /api
  app.merge(authRoutes, '/api');

  // User routes at /api
  app.merge(userRoutes, '/api');

  // MFA routes at /api
  app.merge(mfaRoutes, '/api');

  // Identity routes at /api
  app.merge(identityRoutes, '/api');
}
