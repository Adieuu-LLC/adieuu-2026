/**
 * Chadder API Server
 * Built with Bun.serve()
 */

import { Router } from './router';
import { securityHeaders, requestId, cors } from './middleware';
import { registerRoutes } from './routes';
import { initializeDatabases, closeDatabases } from './db';
import { config, validateProductionConfig } from './config';

// Validate production configuration
validateProductionConfig();

// Create router
const app = new Router();

// Register middleware
app.use(requestId());
app.use(securityHeaders());
app.use(cors());

// Register routes
registerRoutes(app);

/**
 * Start the server
 */
async function start(): Promise<void> {
  // Initialize database connections
  await initializeDatabases();

  // Start HTTP server
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: app.handler(),
  });

  console.log(`Server running at http://${server.hostname}:${server.port}`);

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await closeDatabases();
    server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
