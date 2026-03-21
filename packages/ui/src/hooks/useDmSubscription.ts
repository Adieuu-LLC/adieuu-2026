/**
 * Hook for subscribing to real-time DM events.
 *
 * Listens for new messages, read state updates, and typing indicators
 * via the WebSocket connection.
 */

import { useEffect, useCallback } from 'react';
import type { ChatIncomingMessage, DmMessage, DmReaction } from '@adieuu/shared';
import { useChatConnection } from './useChatConnection';

/**
 * DM event types from the chat server.
 */
export type DmEventType =
  | 'dm:new'
  | 'dm:read'
  | 'dm:typing'
  | 'dm:deleted'
  | 'dm:reaction:new'
  | 'dm:reaction:removed';

/**
 * Deletion reason for dm:deleted events.
 */
export type DmDeletionReason = 'sender' | 'expired';

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

/**
 * Message deleted event.
 */
export interface DmDeletedEvent {
  type: 'dm:deleted';
  payload: {
    messageId: string;
    conversationId: string;
    reason: DmDeletionReason;
  };
}

/**
 * Another participant (or your other device) added a reaction — payload matches API `DmReaction`.
 */
export interface DmReactionNewEvent {
  type: 'dm:reaction:new';
  payload: {
    reaction: DmReaction;
  };
}

export interface DmReactionRemovedEvent {
  type: 'dm:reaction:removed';
  payload: {
    reactionId: string;
    messageId: string;
    conversationId: string;
  };
}

export type DmEvent =
  | DmNewMessageEvent
  | DmReadStateEvent
  | DmTypingEvent
  | DmDeletedEvent
  | DmReactionNewEvent
  | DmReactionRemovedEvent;

export interface UseDmSubscriptionOptions {
  /** Conversation ID to filter events (optional) */
  conversationId?: string;
  /** Callback for new messages */
  onNewMessage?: (event: DmNewMessageEvent) => void;
  /** Callback for read state updates */
  onReadStateUpdate?: (event: DmReadStateEvent) => void;
  /** Callback for typing indicators */
  onTyping?: (event: DmTypingEvent) => void;
  /** Callback for message deletions */
  onDeleted?: (event: DmDeletedEvent) => void;
  /** Callback when a reaction is added to a message in this conversation */
  onReactionNew?: (event: DmReactionNewEvent) => void;
  /** Callback when a reaction is removed */
  onReactionRemoved?: (event: DmReactionRemovedEvent) => void;
  /** Callback when the WebSocket reconnects after a drop (for refetching missed messages) */
  onReconnect?: () => void;
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
  switch (event.type) {
    case 'dm:new':
      return event.payload.message.conversationId;
    case 'dm:deleted':
    case 'dm:read':
    case 'dm:typing':
      return event.payload.conversationId;
    case 'dm:reaction:new':
      return event.payload.reaction.conversationId;
    case 'dm:reaction:removed':
      return event.payload.conversationId;
    default:
      return undefined;
  }
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
  onDeleted,
  onReactionNew,
  onReactionRemoved,
  onReconnect,
}: UseDmSubscriptionOptions = {}): UseDmSubscriptionResult {
  const { isConnected, onMessage, onReconnect: onReconnectHandler, sendTyping } = useChatConnection();

  useEffect(() => {
    if (
      !onNewMessage &&
      !onReadStateUpdate &&
      !onTyping &&
      !onDeleted &&
      !onReactionNew &&
      !onReactionRemoved
    ) {
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
        case 'dm:deleted':
          onDeleted?.(event);
          break;
        case 'dm:reaction:new':
          onReactionNew?.(event);
          break;
        case 'dm:reaction:removed':
          onReactionRemoved?.(event);
          break;
      }
    });
  }, [
    conversationId,
    onMessage,
    onNewMessage,
    onReadStateUpdate,
    onTyping,
    onDeleted,
    onReactionNew,
    onReactionRemoved,
  ]);

  useEffect(() => {
    if (!onReconnect) return;
    return onReconnectHandler(onReconnect);
  }, [onReconnectHandler, onReconnect]);

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
