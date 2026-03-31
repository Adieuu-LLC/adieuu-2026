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
import { initializeDatabases, closeDatabases, checkRedisHealth, checkMongoHealth, getSubscriber } from './db';
import { extractSessionId, validateSession } from './auth';
import {
  registerConnection,
  unregisterConnection,
  updateHeartbeat,
  getConnectionCount,
  getIdentityCount,
  getSubscriptionCount,
  initializeMessageHandler,
} from './connections';
import logger from './utils/logger';
import type { WsUserData, WsIncomingMessage, WsPongMessage, WsErrorMessage } from './types';

validateProductionConfig();

/**
 * Human-readable labels for common WebSocket close codes.
 */
const CLOSE_CODE_LABELS: Record<number, string> = {
  1000: 'Normal',
  1001: 'GoingAway',
  1002: 'ProtocolError',
  1003: 'UnsupportedData',
  1005: 'NoStatusReceived',
  1006: 'AbnormalClosure',
  1007: 'InvalidPayload',
  1008: 'PolicyViolation',
  1009: 'MessageTooBig',
  1010: 'MandatoryExtension',
  1011: 'InternalError',
  1012: 'ServiceRestart',
  1013: 'TryAgainLater',
  1014: 'BadGateway',
  1015: 'TLSHandshake',
};

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

      const upgradeStart = performance.now();
      const session = await validateSession(sessionId);
      const validateMs = Math.round(performance.now() - upgradeStart);

      if (aborted.value) {
        logger.warn('WebSocket upgrade aborted during session validation', { validateMs });
        return;
      }

      if (!session) {
        logger.warn('WebSocket upgrade rejected: invalid session', {
          sessionIdPrefix: sessionId.substring(0, 8) + '...',
          validateMs,
        });
        res.cork(() => {
          res.writeStatus('401 Unauthorized').end('Invalid session');
        });
        return;
      }

      logger.info('WebSocket upgrade accepted', {
        identityId: session.identityId.substring(0, 8) + '...',
        validateMs,
      });

      const userData: WsUserData = {
        identityId: session.identityId,
        sessionId,
        connectedAt: Date.now(),
      };

      res.cork(() => {
        res.upgrade(
          userData,
          secWebSocketKey,
          secWebSocketProtocol,
          secWebSocketExtensions,
          context
        );
      });
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
        const result = ws.send(serialize(errorResponse));
        logger.warn('Received unparseable message', {
          identityId: userData.identityId.substring(0, 8) + '...',
          errorSendResult: result,
        });
        return;
      }

      switch (message.type) {
        case 'ping': {
          const pongResponse: WsPongMessage = { type: 'pong' };
          const result = ws.send(serialize(pongResponse));
          if (result !== 1) {
            logger.warn('Pong send failed', {
              identityId: userData.identityId.substring(0, 8) + '...',
              sendResult: result,
            });
          }
          await updateHeartbeat(userData.identityId);
          break;
        }

        default: {
          logger.warn('Unknown message type received', {
            identityId: userData.identityId.substring(0, 8) + '...',
            type: (message as { type: string }).type,
          });
          const errorResponse: WsErrorMessage = {
            type: 'error',
            code: 'UNKNOWN_MESSAGE_TYPE',
            message: `Unknown message type: ${(message as { type: string }).type}`,
          };
          ws.send(serialize(errorResponse));
        }
      }
    },

    drain: (ws) => {
      const userData = ws.getUserData();
      logger.info('WebSocket backpressure drained', {
        identityId: userData.identityId.substring(0, 8) + '...',
        bufferedAmount: ws.getBufferedAmount(),
      });
    },

    close: async (ws, code, message) => {
      const userData = ws.getUserData();
      const reason = message ? Buffer.from(message).toString('utf-8') : '';
      const codeLabel = CLOSE_CODE_LABELS[code] ?? 'Unknown';
      logger.info('WebSocket connection closed', {
        identityId: userData.identityId.substring(0, 8) + '...',
        code,
        codeLabel,
        reason: reason || undefined,
        connectedForMs: Date.now() - userData.connectedAt,
      });
      await unregisterConnection(userData.identityId, ws);
    },
  });

  app.get('/health', async (res, req) => {
    let aborted = false;
    res.onAborted(() => { aborted = true; });

    const [redisHealth, mongoHealth] = await Promise.all([
      checkRedisHealth(),
      checkMongoHealth(),
    ]);

    if (aborted) return;

    const allHealthy = redisHealth.status === 'up' && mongoHealth.status === 'up';

    const response = {
      status: allHealthy ? 'healthy' : 'degraded',
      connections: getConnectionCount(),
      services: {
        redis: redisHealth,
        mongo: mongoHealth,
      },
    };

    res.cork(() => {
      res
        .writeStatus(allHealthy ? '200 OK' : '503 Service Unavailable')
        .writeHeader('Content-Type', 'application/json')
        .end(JSON.stringify(response));
    });
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
    const socketCount = getConnectionCount();
    const identityCount = getIdentityCount();
    const subscriptionCount = getSubscriptionCount();
    const sub = getSubscriber();
    logger.info('Chat service telemetry', {
      sockets: socketCount,
      identities: identityCount,
      subscriptions: subscriptionCount,
      drift: subscriptionCount - identityCount,
      subscriberStatus: sub.status,
    });
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
