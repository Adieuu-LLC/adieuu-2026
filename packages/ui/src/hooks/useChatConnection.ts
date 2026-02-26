/**
 * Hook for managing WebSocket chat connection.
 *
 * Automatically connects when logged in and disconnects on logout.
 * Handles reconnection with exponential backoff.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ChatClient,
  type ChatConnectionState,
  type ChatIncomingMessage,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

export interface UseChatConnectionOptions {
  /** Whether to auto-connect when logged in (default: true) */
  autoConnect?: boolean;
  /** Heartbeat interval in ms (default: 15000) */
  heartbeatInterval?: number;
}

export interface UseChatConnectionResult {
  /** Current connection state */
  connectionState: ChatConnectionState;
  /** Whether connected */
  isConnected: boolean;
  /** Connect to chat server */
  connect: () => void;
  /** Disconnect from chat server */
  disconnect: () => void;
  /** Subscribe to incoming messages */
  onMessage: (handler: (message: ChatIncomingMessage) => void) => () => void;
  /** Send typing indicator */
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

/**
 * Hook for managing WebSocket chat connection.
 *
 * @example
 * ```tsx
 * function ChatProvider() {
 *   const { connectionState, isConnected, onMessage } = useChatConnection();
 *
 *   useEffect(() => {
 *     return onMessage((msg) => {
 *       if (msg.type === 'typing') {
 *         console.log('User typing:', msg.from);
 *       }
 *     });
 *   }, [onMessage]);
 *
 *   return <div>Status: {connectionState}</div>;
 * }
 * ```
 */
export function useChatConnection({
  autoConnect = true,
  heartbeatInterval = 15000,
}: UseChatConnectionOptions = {}): UseChatConnectionResult {
  const { chatWsUrl } = useAppConfig();
  const { status, identity } = useIdentity();

  const [connectionState, setConnectionState] = useState<ChatConnectionState>('disconnected');
  const clientRef = useRef<ChatClient | null>(null);
  const handlersRef = useRef<Set<(message: ChatIncomingMessage) => void>>(new Set());

  const isLoggedIn = status === 'logged_in' && identity !== null;

  // Create chat client
  useEffect(() => {
    if (!chatWsUrl) return;

    const client = new ChatClient(
      {
        wsUrl: chatWsUrl,
        heartbeatInterval,
      },
      {
        onStateChange: (state) => {
          setConnectionState(state);
        },
        onMessage: (message) => {
          handlersRef.current.forEach((handler) => handler(message));
        },
        onError: (error) => {
          console.error('[ChatConnection] Error:', error.message);
        },
      }
    );

    clientRef.current = client;

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [chatWsUrl, heartbeatInterval]);

  // Auto-connect when logged in
  useEffect(() => {
    if (!autoConnect) return;

    if (isLoggedIn && clientRef.current) {
      clientRef.current.connect();
    } else if (!isLoggedIn && clientRef.current) {
      clientRef.current.disconnect();
    }
  }, [autoConnect, isLoggedIn]);

  const connect = useCallback(() => {
    clientRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
  }, []);

  const onMessage = useCallback(
    (handler: (message: ChatIncomingMessage) => void) => {
      handlersRef.current.add(handler);
      return () => {
        handlersRef.current.delete(handler);
      };
    },
    []
  );

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    clientRef.current?.sendTyping(conversationId, isTyping);
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    connect,
    disconnect,
    onMessage,
    sendTyping,
  };
}
