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
import { notificationRoutes } from './notifications';
import { adminRoutes } from './admin';
import { themeRoutes } from './themes';
import { releaseRoutes } from './releases';
import { uploadRoutes } from './uploads';
import { e2eUploadRoutes } from './uploads/e2e';
import { friendRoutes } from './friends';
import { conversationRoutes } from './conversations';
import { moderationRoutes } from './moderation';
import { reportRoutes } from './reports';
import { klipyRoutes } from './klipy';
import { achievementRoutes } from './achievements';
import { blockRoutes } from './blocks';
import { stripeWebhookRoutes } from './webhooks/stripe';
import { subscriptionRoutes } from './account/subscription';
import { geoRoutes } from './geo';
import { ageVerificationRoutes } from './age-verification';
import { customEmojiRoutes } from './custom-emojis';

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
 * - `/api/notifications` - Notification management endpoints
 * - `/api/admin/platform-settings` - Platform configuration (session + admin list)
 * - `/api/conversations` - DM and group conversation messaging
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

  // Notification routes at /api
  app.merge(notificationRoutes, '/api');

  // Platform admin (session + admin list)
  app.merge(adminRoutes, '/api');

  // Community themes (public browse + identity-auth upload)
  app.merge(themeRoutes, '/api');

  // Release manifests (desktop update mirror, served via CloudFront ALB origin)
  app.merge(releaseRoutes, '/api');

  // Media uploads (presigned S3 URLs, processing status, Lambda callbacks)
  app.merge(uploadRoutes, '/api');

  // E2E media uploads (conversation attachments with dual-upload moderation)
  app.merge(e2eUploadRoutes, '/api');

  // Friends and friend requests
  app.merge(friendRoutes, '/api');

  // DM and group conversations
  app.merge(conversationRoutes, '/api');

  // Platform moderation (reports, actions, enforcement)
  app.merge(moderationRoutes, '/api');

  // User-facing report submission (manual message + profile reports)
  app.merge(reportRoutes, '/api');

  // Klipy GIF/sticker proxy (search, trending, share trigger)
  app.merge(klipyRoutes, '/api');

  // Achievements (definitions, own, stats)
  app.merge(achievementRoutes, '/api');

  // Identity blocking (block, unblock, list, check)
  app.merge(blockRoutes, '/api');

  // Account subscription management (checkout, portal, status)
  app.merge(subscriptionRoutes, '/api');

  // Jurisdiction / regulatory reference (account session)
  app.merge(geoRoutes, '/api');

  // Age verification (account session)
  app.merge(ageVerificationRoutes, '/api');

  // Custom emojis (CRUD for user-uploaded emojis)
  app.merge(customEmojiRoutes, '/api');

  // Stripe webhook (subscription events)
  app.merge(stripeWebhookRoutes, '/api');
}
