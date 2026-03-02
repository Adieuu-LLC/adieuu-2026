/**
 * Context-based WebSocket chat connection.
 *
 * Provides a single shared ChatClient instance to all consumers,
 * preventing multiple WebSocket connections per identity.
 * Automatically connects when logged in and disconnects on logout.
 */

import { useState, useCallback, useEffect, useRef, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  ChatClient,
  type ChatConnectionState,
  type ChatIncomingMessage,
} from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';

// ============================================================================
// Types
// ============================================================================

export interface ChatConnectionContextValue {
  /** Current connection state */
  connectionState: ChatConnectionState;
  /** Whether connected */
  isConnected: boolean;
  /** Connect to chat server */
  connect: () => void;
  /** Disconnect from chat server */
  disconnect: () => void;
  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage: (handler: (message: ChatIncomingMessage) => void) => () => void;
  /** Subscribe to reconnection events. Returns an unsubscribe function. */
  onReconnect: (handler: () => void) => () => void;
  /** Send typing indicator */
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

export interface ChatConnectionProviderProps {
  children: ReactNode;
  /** Whether to auto-connect when logged in (default: true) */
  autoConnect?: boolean;
  /** Heartbeat interval in ms (default: 15000) */
  heartbeatInterval?: number;
}

// ============================================================================
// Context
// ============================================================================

const ChatConnectionContext = createContext<ChatConnectionContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the shared chat connection.
 * Must be used within a ChatConnectionProvider.
 */
export function useChatConnection(): ChatConnectionContextValue {
  const context = useContext(ChatConnectionContext);
  if (!context) {
    throw new Error('useChatConnection must be used within a ChatConnectionProvider');
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

/**
 * Provides a single shared WebSocket connection to the chat server.
 * Must be nested inside IdentityProvider (needs identity state for auto-connect).
 */
export function ChatConnectionProvider({
  children,
  autoConnect = true,
  heartbeatInterval = 15000,
}: ChatConnectionProviderProps) {
  const { chatWsUrl } = useAppConfig();
  const { status, identity } = useIdentity();

  const [connectionState, setConnectionState] = useState<ChatConnectionState>('disconnected');
  const clientRef = useRef<ChatClient | null>(null);
  const messageHandlersRef = useRef<Set<(message: ChatIncomingMessage) => void>>(new Set());
  const reconnectHandlersRef = useRef<Set<() => void>>(new Set());
  const prevStateRef = useRef<ChatConnectionState>('disconnected');
  const hasConnectedRef = useRef(false);

  const isLoggedIn = status === 'logged_in' && identity !== null;

  // Fire reconnect handlers when connection recovers after a drop
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = connectionState;

    if (connectionState !== 'connected') return;
    if (!hasConnectedRef.current) {
      hasConnectedRef.current = true;
      return;
    }

    if (prev === 'reconnecting' || prev === 'connecting') {
      reconnectHandlersRef.current.forEach((handler) => handler());
    }
  }, [connectionState]);

  // Create chat client (single instance for the lifetime of this provider)
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
          messageHandlersRef.current.forEach((handler) => handler(message));
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
      messageHandlersRef.current.add(handler);
      return () => {
        messageHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const onReconnect = useCallback(
    (handler: () => void) => {
      reconnectHandlersRef.current.add(handler);
      return () => {
        reconnectHandlersRef.current.delete(handler);
      };
    },
    []
  );

  const sendTyping = useCallback((conversationId: string, isTyping: boolean) => {
    clientRef.current?.sendTyping(conversationId, isTyping);
  }, []);

  const value = useMemo<ChatConnectionContextValue>(
    () => ({
      connectionState,
      isConnected: connectionState === 'connected',
      connect,
      disconnect,
      onMessage,
      onReconnect,
      sendTyping,
    }),
    [connectionState, connect, disconnect, onMessage, onReconnect, sendTyping]
  );

  return (
    <ChatConnectionContext.Provider value={value}>
      {children}
    </ChatConnectionContext.Provider>
  );
}
