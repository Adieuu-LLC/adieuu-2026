/**
 * Chat Service Type Definitions
 */

import type uWS from 'uWebSockets.js';

/**
 * User data attached to each WebSocket connection
 */
export interface WsUserData {
  identityId: string;
  sessionId: string;
  deviceId?: string;
  connectedAt: number;
  /**
   * Space ids the identity was an active member of at WS upgrade. The
   * connection subscribes to each `space:{spaceId}` channel so Space broadcasts
   * are delivered. Resolved once at upgrade (membership changes take effect on
   * the next reconnect).
   */
  spaceIds?: string[];
}

/**
 * WebSocket with typed user data
 */
export type TypedWebSocket = uWS.WebSocket<WsUserData>;

/**
 * Message types for WebSocket communication
 */
export type WsMessageType =
  | 'ping'
  | 'pong'
  | 'presence'
  | 'ack'
  | 'error';

/**
 * Base structure for all WebSocket messages
 */
export interface WsMessageBase {
  type: WsMessageType;
  id?: string;
}

/**
 * Ping message for keep-alive
 */
export interface WsPingMessage extends WsMessageBase {
  type: 'ping';
}

/**
 * Pong response
 */
export interface WsPongMessage extends WsMessageBase {
  type: 'pong';
}

/**
 * Error message
 */
export interface WsErrorMessage extends WsMessageBase {
  type: 'error';
  code: string;
  message: string;
}

/**
 * Acknowledgment message
 */
export interface WsAckMessage extends WsMessageBase {
  type: 'ack';
  id: string;
}

/**
 * Union of all incoming message types
 */
export type WsIncomingMessage =
  | WsPingMessage;

/**
 * Union of all outgoing message types
 */
export type WsOutgoingMessage =
  | WsPongMessage
  | WsErrorMessage
  | WsAckMessage;

/**
 * Redis pub/sub channel names
 */
export const RedisChannels = {
  identity: (identityId: string) => `identity:${identityId}`,
  /**
   * Space broadcast channel. MUST stay in sync with `RedisKeys.spaceChannel`
   * in `apps/api/src/db/redis.ts` (the API publishes here).
   */
  space: (spaceId: string) => `space:${spaceId}`,
} as const;

/**
 * Redis key generators for chat service
 */
export const ChatRedisKeys = {
  online: (identityId: string) => `chat:online:${identityId}`,
  lastSeen: (identityId: string) => `chat:lastseen:${identityId}`,
} as const;

/**
 * Session data from cache/database
 */
export interface SessionData {
  identityId: string;
  expiresAt: number;
  lastActivityAt: number;
}
