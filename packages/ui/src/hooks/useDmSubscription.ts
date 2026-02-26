/**
 * Hook for subscribing to real-time DM events.
 *
 * Listens for new messages, read state updates, and typing indicators
 * via the WebSocket connection.
 */

import { useEffect, useCallback } from 'react';
import type { ChatIncomingMessage, DmMessage } from '@adieuu/shared';
import { useChatConnection } from './useChatConnection';

/**
 * DM event types from the chat server.
 */
export type DmEventType = 'dm:new' | 'dm:read' | 'dm:typing';

/**
 * New DM message event.
 */
export interface DmNewMessageEvent {
  type: 'dm:new';
  payload: {
    message: DmMessage;
  };
}

/**
 * Read state update event.
 */
export interface DmReadStateEvent {
  type: 'dm:read';
  payload: {
    conversationId: string;
    identityId: string;
    encryptedLastReadId: string;
  };
}

/**
 * Typing indicator event.
 */
export interface DmTypingEvent {
  type: 'dm:typing';
  payload: {
    conversationId: string;
    identityId: string;
    isTyping: boolean;
  };
}

export type DmEvent = DmNewMessageEvent | DmReadStateEvent | DmTypingEvent;

export interface UseDmSubscriptionOptions {
  /** Conversation ID to filter events (optional) */
  conversationId?: string;
  /** Callback for new messages */
  onNewMessage?: (event: DmNewMessageEvent) => void;
  /** Callback for read state updates */
  onReadStateUpdate?: (event: DmReadStateEvent) => void;
  /** Callback for typing indicators */
  onTyping?: (event: DmTypingEvent) => void;
}

export interface UseDmSubscriptionResult {
  /** Whether connected to chat server */
  isConnected: boolean;
  /** Send typing indicator */
  sendTyping: (conversationId: string, isTyping: boolean) => void;
}

/**
 * Raw message structure from WebSocket (extends ChatIncomingMessage).
 * DM events have a type starting with 'dm:'.
 */
interface RawWsMessage {
  type: string;
  payload?: unknown;
}

/**
 * Check if a message is a DM event.
 */
function isDmEvent(msg: ChatIncomingMessage): boolean {
  const raw = msg as unknown as RawWsMessage;
  return typeof raw.type === 'string' && raw.type.startsWith('dm:');
}

/**
 * Get the conversation ID from a DM event payload.
 */
function getConversationId(event: DmEvent): string | undefined {
  if (event.type === 'dm:new') {
    return event.payload.message.conversationId;
  }
  return event.payload.conversationId;
}

/**
 * Hook for subscribing to real-time DM events.
 *
 * @example
 * ```tsx
 * function DmConversation({ conversationId }) {
 *   const { refetch } = useDmMessages(conversationId);
 *
 *   useDmSubscription({
 *     conversationId,
 *     onNewMessage: (event) => {
 *       // Refresh messages when a new one arrives
 *       refetch();
 *     },
 *     onTyping: (event) => {
 *       setIsOtherTyping(event.payload.isTyping);
 *     },
 *   });
 *
 *   return <MessageList />;
 * }
 * ```
 */
export function useDmSubscription({
  conversationId,
  onNewMessage,
  onReadStateUpdate,
  onTyping,
}: UseDmSubscriptionOptions = {}): UseDmSubscriptionResult {
  const { isConnected, onMessage, sendTyping } = useChatConnection();

  useEffect(() => {
    if (!onNewMessage && !onReadStateUpdate && !onTyping) {
      return;
    }

    return onMessage((msg) => {
      if (!isDmEvent(msg)) return;

      const raw = msg as unknown as RawWsMessage;
      const event = raw as unknown as DmEvent;

      // Filter by conversation if specified
      const eventConvId = getConversationId(event);
      if (conversationId && eventConvId && eventConvId !== conversationId) {
        return;
      }

      switch (event.type) {
        case 'dm:new':
          onNewMessage?.(event);
          break;
        case 'dm:read':
          onReadStateUpdate?.(event);
          break;
        case 'dm:typing':
          onTyping?.(event);
          break;
      }
    });
  }, [conversationId, onMessage, onNewMessage, onReadStateUpdate, onTyping]);

  const sendTypingIndicator = useCallback(
    (convId: string, isTyping: boolean) => {
      sendTyping(convId, isTyping);
    },
    [sendTyping]
  );

  return {
    isConnected,
    sendTyping: sendTypingIndicator,
  };
}
