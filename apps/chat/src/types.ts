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
  | 'message'
  | 'typing'
  | 'presence'
  | 'ack'
  | 'error'
  | 'dm:new'
  | 'dm:deleted'
  | 'dm:read'
  | 'dm:typing'
  | 'dm:reaction:new'
  | 'dm:reaction:removed';

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
 * Typing indicator message
 */
export interface WsTypingMessage extends WsMessageBase {
  type: 'typing';
  payload: {
    conversationId: string;
    isTyping: boolean;
  };
}

/**
 * New DM message event (from API via Redis)
 */
export interface WsDmNewMessage extends WsMessageBase {
  type: 'dm:new';
  payload: {
    message: {
      id: string;
      conversationId: string;
      toIdentityId: string;
      encryptedSenderId: string;
      ciphertext: string;
      nonce: string;
      wrappedKeys: Array<{
        identityId: string;
        deviceId?: string;
        ephemeralPublicKey: string;
        kemCiphertext: string;
        wrappedSessionKey: string;
        wrappingNonce: string;
      }>;
      signature: string;
      cryptoProfile: 'default' | 'cnsa2';
      clientMessageId: string;
      createdAt: string;
      expiresAt?: string;
      replyToId?: string;
      threadRootId?: string;
    };
  };
}

/**
 * DM read state update event (from API via Redis)
 */
export interface WsDmReadMessage extends WsMessageBase {
  type: 'dm:read';
  payload: {
    conversationId: string;
    identityId: string;
    encryptedLastReadId: string;
  };
}

/**
 * DM typing indicator event (from API via Redis)
 */
export interface WsDmTypingMessage extends WsMessageBase {
  type: 'dm:typing';
  payload: {
    conversationId: string;
    identityId: string;
    isTyping: boolean;
  };
}

/**
 * DM message deleted event (from API via Redis)
 */
export interface WsDmDeletedMessage extends WsMessageBase {
  type: 'dm:deleted';
  payload: {
    messageId: string;
    conversationId: string;
    reason: 'deleted_for_everyone' | 'deleted_for_self' | 'expired';
  };
}

/**
 * Encrypted message payload
 */
export interface WsEncryptedMessage extends WsMessageBase {
  type: 'message';
  payload: {
    conversationId: string;
    toIdentityId: string;
    ciphertext: string;
    nonce: string;
    wrappedKeys: Array<{
      identityId: string;
      ephemeralPublicKey: string;
      kemCiphertext: string;
      wrappedSessionKey: string;
    }>;
    signature: string;
    clientMessageId: string;
  };
}

/**
 * Union of all incoming message types
 */
export type WsIncomingMessage =
  | WsPingMessage
  | WsTypingMessage
  | WsEncryptedMessage;

/**
 * Union of all outgoing message types
 */
export type WsOutgoingMessage =
  | WsPongMessage
  | WsErrorMessage
  | WsAckMessage
  | WsTypingMessage
  | WsEncryptedMessage
  | WsDmNewMessage
  | WsDmDeletedMessage
  | WsDmReadMessage
  | WsDmTypingMessage;

/**
 * Redis pub/sub channel names
 */
export const RedisChannels = {
  identity: (identityId: string) => `identity:${identityId}`,
  pushQueue: 'push:queue',
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
