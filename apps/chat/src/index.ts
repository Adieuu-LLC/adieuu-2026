/**
 * Adieuu Chat Service
 *
 * WebSocket server for real-time E2E encrypted messaging.
 * Built with uWebSockets.js for high performance.
 *
 * Features:
 * - Cookie and token-based authentication via identity sessions
 * - Redis pub/sub for cross-instance message routing
 * - Presence tracking (online/offline, last seen)
 * - Health check endpoint
 */

import uWS from 'uWebSockets.js';
import { config, validateProductionConfig } from './config';
import { initializeDatabases, closeDatabases, checkRedisHealth, checkMongoHealth } from './db';
import { extractSessionId, validateSession } from './auth';
import {
  registerConnection,
  unregisterConnection,
  updateHeartbeat,
  getConnectionCount,
  initializeMessageHandler,
} from './connections';
import logger from './utils/logger';
import type { WsUserData, WsIncomingMessage, WsPongMessage, WsErrorMessage } from './types';

validateProductionConfig();

/**
 * Serializes an outgoing message
 */
function serialize<T>(message: T): string {
  return JSON.stringify(message);
}

/**
 * Parses an incoming WebSocket message
 */
function parseMessage(data: ArrayBuffer): WsIncomingMessage | null {
  try {
    const text = Buffer.from(data).toString('utf-8');
    return JSON.parse(text) as WsIncomingMessage;
  } catch {
    return null;
  }
}

/**
 * Creates the uWebSockets.js application
 */
function createApp(): uWS.TemplatedApp {
  const app = uWS.App();

  app.ws<WsUserData>('/ws/chat', {
    idleTimeout: config.webSocket.idleTimeout,
    maxPayloadLength: config.webSocket.maxPayloadLength,
    compression: config.webSocket.compression ? uWS.SHARED_COMPRESSOR : uWS.DISABLED,

    upgrade: async (res, req, context) => {
      const aborted = { value: false };
      res.onAborted(() => {
        aborted.value = true;
        logger.debug('WebSocket upgrade aborted by client');
      });

      const cookieHeader = req.getHeader('cookie');
      const url = req.getUrl();
      const query = req.getQuery();
      const secWebSocketKey = req.getHeader('sec-websocket-key');
      const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
      const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');

      const sessionId = extractSessionId(cookieHeader, query);

      if (!sessionId) {
        logger.warn('WebSocket upgrade rejected: missing session', {
          hasQuery: !!query,
          hasCookie: !!cookieHeader,
        });
        if (!aborted.value) {
          res.writeStatus('401 Unauthorized').end('Missing session');
        }
        return;
      }

      const session = await validateSession(sessionId);

      if (aborted.value) {
        logger.debug('WebSocket upgrade aborted during session validation');
        return;
      }

      if (!session) {
        logger.warn('WebSocket upgrade rejected: invalid session', {
          sessionIdPrefix: sessionId.substring(0, 8) + '...',
        });
        res.writeStatus('401 Unauthorized').end('Invalid session');
        return;
      }

      logger.debug('WebSocket upgrade accepted', {
        identityId: session.identityId.substring(0, 8) + '...',
      });

      const userData: WsUserData = {
        identityId: session.identityId,
        sessionId,
        connectedAt: Date.now(),
      };

      res.upgrade(
        userData,
        secWebSocketKey,
        secWebSocketProtocol,
        secWebSocketExtensions,
        context
      );
    },

    open: async (ws) => {
      const userData = ws.getUserData();
      logger.info('WebSocket connection opened', {
        identityId: userData.identityId.substring(0, 8) + '...',
      });
      await registerConnection(userData.identityId, ws);
    },

    message: async (ws, data, isBinary) => {
      const userData = ws.getUserData();
      const message = parseMessage(data);

      if (!message) {
        const errorResponse: WsErrorMessage = {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'Failed to parse message',
        };
        ws.send(serialize(errorResponse));
        return;
      }

      switch (message.type) {
        case 'ping': {
          const pongResponse: WsPongMessage = { type: 'pong' };
          ws.send(serialize(pongResponse));
          await updateHeartbeat(userData.identityId);
          break;
        }

        case 'typing':
        case 'message': {
          logger.debug('Message received (handler not implemented)', {
            type: message.type,
            identityId: userData.identityId.substring(0, 8) + '...',
          });
          break;
        }

        default: {
          const errorResponse: WsErrorMessage = {
            type: 'error',
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${(message as { type: string }).type}`,
          };
          ws.send(serialize(errorResponse));
        }
      }
    },

    close: async (ws, code, message) => {
      const userData = ws.getUserData();
      const reason = message ? Buffer.from(message).toString('utf-8') : '';
      logger.info('WebSocket connection closed', {
        identityId: userData.identityId.substring(0, 8) + '...',
        code,
        reason: reason || undefined,
        connectedForMs: Date.now() - userData.connectedAt,
      });
      await unregisterConnection(userData.identityId);
    },
  });

  app.get('/health', async (res, req) => {
    res.onAborted(() => {});

    const [redisHealth, mongoHealth] = await Promise.all([
      checkRedisHealth(),
      checkMongoHealth(),
    ]);

    const allHealthy = redisHealth.status === 'up' && mongoHealth.status === 'up';

    const response = {
      status: allHealthy ? 'healthy' : 'degraded',
      connections: getConnectionCount(),
      services: {
        redis: redisHealth,
        mongo: mongoHealth,
      },
    };

    res
      .writeStatus(allHealthy ? '200 OK' : '503 Service Unavailable')
      .writeHeader('Content-Type', 'application/json')
      .end(JSON.stringify(response));
  });

  app.get('/ready', (res, req) => {
    res.onAborted(() => {});
    res
      .writeStatus('200 OK')
      .writeHeader('Content-Type', 'application/json')
      .end(JSON.stringify({ status: 'ready' }));
  });

  app.any('/*', (res, req) => {
    res.onAborted(() => {});
    res.writeStatus('404 Not Found').end('Not found');
  });

  return app;
}

/**
 * Starts the chat server
 */
async function start(): Promise<void> {
  await initializeDatabases();
  initializeMessageHandler();

  const app = createApp();

  app.listen(config.host, config.port, (listenSocket) => {
    if (listenSocket) {
      logger.info('Chat server started', {
        host: config.host,
        port: config.port,
        idleTimeoutSec: config.webSocket.idleTimeout,
        maxPayloadBytes: config.webSocket.maxPayloadLength,
        compression: config.webSocket.compression,
      });
    } else {
      logger.error('Failed to start chat server', {
        host: config.host,
        port: config.port,
      });
      process.exit(1);
    }
  });

  setInterval(() => {
    const count = getConnectionCount();
    if (count > 0) {
      logger.debug('Active connections', { count });
    }
  }, 60000);

  const shutdown = async () => {
    logger.info('Shutting down gracefully');
    await closeDatabases();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  logger.error('Failed to start chat server', { error });
  process.exit(1);
});
