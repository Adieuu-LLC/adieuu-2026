/**
 * Adieuu API Server
 * Built with Bun.serve()
 */

import { Router } from './router';
import { securityHeaders, requestId, cors, csrf, sessionCookieRenewal, requireActiveSubscription, enrichIdentitySession, globalRateLimit } from './middleware';
import { registerRoutes } from './routes';
import { initializeDatabases, closeDatabases } from './db';
import { config, validateProductionConfig } from './config';
import {
  ensureGeoLookupPlatformSettingExists,
  ensureAgeVerificationPlatformSettingsExist,
  ensureCsamHashServicesPlatformSettingExists,
  ensureNcmecCyberTiplinePlatformSettingExists,
  ensureSpaceCreationPlatformSettingExists,
} from './services/platform-settings.service';
import { elog } from './utils';
import { verifyStripeCredentials } from './services/billing/stripe.client';
import { logIntegrationEnvironments } from './services/integration-diagnostics.service';
import { startCallReaper, stopCallReaper } from './services/call-reaper.service';

// Validate production configuration
validateProductionConfig();

// Create router
const app = new Router({
  maxBodySize: config.maxRequestBodyBytes,
  anonymousMaxBodySize: config.anonymousMaxRequestBodyBytes,
});

// Register middleware
app.use(requestId());
app.use(securityHeaders());
app.use(cors());
app.use(csrf());
app.use(sessionCookieRenewal());
app.use(requireActiveSubscription());
app.use(enrichIdentitySession());
app.use(globalRateLimit());

// Register routes
registerRoutes(app);

/**
 * Start the server
 */
async function start(): Promise<void> {
  // Initialize database connections
  await initializeDatabases();

  if (config.stripe.enabled) {
    await verifyStripeCredentials();
  }

  try {
    await ensureGeoLookupPlatformSettingExists();
    await ensureAgeVerificationPlatformSettingsExist();
    await ensureCsamHashServicesPlatformSettingExists();
    await ensureNcmecCyberTiplinePlatformSettingExists();
    await ensureSpaceCreationPlatformSettingExists();
  } catch (error) {
    elog.warn('Could not ensure platform settings exist', { error });
    if (config.features.requireDatabase) {
      throw error;
    }
  }

  await logIntegrationEnvironments();

  const reaperHandle = startCallReaper();

  // Start HTTP server
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.handler(),
  });

  elog.info('Server started', { host: server.hostname, port: server.port });

  // Graceful shutdown handler
  const shutdown = async () => {
    elog.info('Shutting down gracefully');
    if (reaperHandle) stopCallReaper(reaperHandle);
    await closeDatabases();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  elog.error('Failed to start server', { error });
  process.exit(1);
});
