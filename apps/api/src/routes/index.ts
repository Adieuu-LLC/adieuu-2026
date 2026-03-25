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
import { friendsRoutes } from './friends';
import { notificationRoutes } from './notifications';
import { dmRoutes } from './dm';
import { adminRoutes } from './admin';
import { themeRoutes } from './themes';

/**
 * Registers all application routes with the main router.
 *
 * This function aggregates all route modules and mounts them under the `/api` prefix.
 * Route modules include:
 * - `/api/health` - Health check and liveness endpoints
 * - `/api/auth` - Authentication endpoints (OTP request, verification)
 * - `/api/users` - User management endpoints
 * - `/api/mfa` - Multi-factor authentication endpoints
 * - `/api/identity` - Anonymous identity management and blocklist endpoints
 * - `/api/friends` - Friend requests and friendships endpoints
 * - `/api/notifications` - Notification management endpoints
 * - `/api/dm` - Direct message conversations and encrypted messages
 * - `/api/admin/platform-settings` - Platform configuration (session + admin list)
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

  // Identity routes at /api (includes blocklist)
  app.merge(identityRoutes, '/api');

  // Friend routes at /api
  app.merge(friendsRoutes, '/api');

  // Notification routes at /api
  app.merge(notificationRoutes, '/api');

  // DM routes at /api
  app.merge(dmRoutes, '/api');

  // Platform admin (session + admin list)
  app.merge(adminRoutes, '/api');

  // Community themes (public browse + identity-auth upload)
  app.merge(themeRoutes, '/api');
}
