/**
 * Chadder API Server
 * Built with Bun.serve()
 */

import { Router } from './router';
import { securityHeaders, requestId, cors } from './middleware';
import { registerRoutes } from './routes';

// Create router
const app = new Router();

// Register middleware
app.use(requestId());
app.use(securityHeaders());
app.use(cors());

// Register routes
registerRoutes(app);

// Server configuration
const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST ?? '0.0.0.0';

// Start server
const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.handler(),
});

console.log(`Server running at http://${server.hostname}:${server.port}`);
