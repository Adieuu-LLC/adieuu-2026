/**
 * Shared ChatSocket provider.
 *
 * Manages a single WebSocket connection per identity session and exposes
 * a pub/sub interface so any number of feature hooks (friends, conversations,
 * spaces, etc.) can subscribe without competing for the connection.
 *
 * The chat server keeps one socket entry per identity -- last writer wins.
 * By centralising the connection here we guarantee every subscriber receives
 * every forwarded Redis event.
 *
 * @module hooks/useChatSocket
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from 'react';
import type { ReactNode } from 'react';
import {
  ChatClient,
  type ChatClientConfig,
  type ChatConnectionState,
  type ChatIncomingMessage,
} from '@adieuu/shared';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';

// ============================================================================
// Types
// ============================================================================

export type ChatMessageHandler = (message: ChatIncomingMessage) => void;
export type ChatStateHandler = (state: ChatConnectionState) => void;

export interface ChatSocketContextValue {
  /** Reactive connection state (for UI indicators). */
  connectionState: ChatConnectionState;

  /**
   * Subscribe to incoming WebSocket messages.
   * Returns an unsubscribe function -- call it in the effect cleanup.
   */
  subscribe: (handler: ChatMessageHandler) => () => void;

  /**
   * Subscribe to connection-state transitions.
   * The handler is called immediately with the current state on subscribe,
   * then again on every subsequent transition.
   * Returns an unsubscribe function.
   */
  onStateChange: (handler: ChatStateHandler) => () => void;
}

const ChatSocketContext = createContext<ChatSocketContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface ChatSocketProviderProps {
  children: ReactNode;
}

export function ChatSocketProvider({ children }: ChatSocketProviderProps) {
  const { status: identityStatus } = useIdentity();
  const { chatWsUrl } = useAppConfig();

  const isLoggedIn = identityStatus === 'logged_in';

  const [connectionState, setConnectionState] = useState<ChatConnectionState>('disconnected');
  const connectionStateRef = useRef<ChatConnectionState>('disconnected');

  const messageHandlers = useRef(new Set<ChatMessageHandler>());
  const stateHandlers = useRef(new Set<ChatStateHandler>());
  const clientRef = useRef<ChatClient | null>(null);

  const subscribe = useCallback((handler: ChatMessageHandler): (() => void) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  const onStateChange = useCallback((handler: ChatStateHandler): (() => void) => {
    stateHandlers.current.add(handler);
    handler(connectionStateRef.current);
    return () => {
      stateHandlers.current.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !chatWsUrl) {
      connectionStateRef.current = 'disconnected';
      setConnectionState('disconnected');
      return;
    }

    const config: ChatClientConfig = {
      wsUrl: chatWsUrl,
      heartbeatInterval: 30_000,
      connectTimeout: 10_000,
      pongTimeout: 10_000,
      maxReconnectAttempts: Infinity,
    };

    const client = new ChatClient(config, {
      onMessage: (message) => {
        for (const handler of messageHandlers.current) {
          try {
            handler(message);
          } catch (err) {
            console.error('[ChatSocket] Subscriber error:', err);
          }
        }
      },
      onStateChange: (state) => {
        connectionStateRef.current = state;
        setConnectionState(state);
        for (const handler of stateHandlers.current) {
          try {
            handler(state);
          } catch (err) {
            console.error('[ChatSocket] State subscriber error:', err);
          }
        }
      },
    });

    clientRef.current = client;
    client.connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && client.getState() !== 'connected') {
        client.forceReconnect();
      }
    };

    const handleOnline = () => {
      if (client.getState() !== 'connected') {
        client.forceReconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      client.disconnect();
      clientRef.current = null;
    };
  }, [isLoggedIn, chatWsUrl]);

  const value = useMemo<ChatSocketContextValue>(
    () => ({ connectionState, subscribe, onStateChange }),
    [connectionState, subscribe, onStateChange]
  );

  return (
    <ChatSocketContext.Provider value={value}>
      {children}
    </ChatSocketContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useChatSocket(): ChatSocketContextValue {
  const ctx = useContext(ChatSocketContext);
  if (!ctx) {
    throw new Error('useChatSocket must be used within a ChatSocketProvider');
  }
  return ctx;
}
