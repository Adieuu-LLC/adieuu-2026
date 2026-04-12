import { describe, expect, test } from 'bun:test';
import type { ChatIncomingMessage } from '@adieuu/shared';
import {
  handleConversationSocketMessage,
  type ConversationSocketHandlerContext,
} from './conversationSocketHandlers';

function createContext() {
  const notifications: Array<{ title: string; body: string }> = [];
  let conversations = [{ id: 'conv-1', unreadCount: 0, lastMessageAt: '' }];
  let activeConversationId: string | null = 'conv-1';
  let invites: Array<{ id: string }> = [];
  let messagesState: Record<string, { messages: Array<{ id: string; fromIdentityId: string }>; olderCursor: string | null; loading: boolean }> = {
    'conv-1': { messages: [{ id: 'm-1', fromIdentityId: 'me-1' }], olderCursor: null, loading: false },
  };

  const ctx: ConversationSocketHandlerContext = {
    setConversations: (updater) => {
      conversations = updater(conversations as never) as never;
    },
    setMessagesState: (updater) => {
      messagesState = updater(messagesState as never) as never;
    },
    setActiveConversationId: (updater) => {
      activeConversationId = updater(activeConversationId);
    },
    setInvites: (updater) => {
      invites = updater(invites as never) as never;
    },
    activeConversationId,
    isAtBottom: false,
    hasFocus: false,
    identityId: 'me-1',
    messagesState,
    participantProfiles: {
      'sender-1': { id: 'sender-1', username: 'sender' } as never,
    },
    decryptGroupName: () => 'group',
    fetchConversations: () => undefined,
    fetchMessages: () => undefined,
    fireNotification: (title, body) => notifications.push({ title, body }),
    navigate: () => undefined,
    resolveParticipants: async () => ({}),
    t: (_key, options) => String(options?.defaultValue ?? _key),
    runReactionNotifOnce: (_reactionId, fn) => fn(),
    loadReactionNotificationsEnabled: () => true,
    openInvites: () => undefined,
    refreshParticipantProfile: () => undefined,
  };

  return {
    ctx,
    get conversations() {
      return conversations;
    },
    get activeConversationId() {
      return activeConversationId;
    },
    get messagesState() {
      return messagesState;
    },
    get notifications() {
      return notifications;
    },
  };
}

describe('conversationSocketHandlers', () => {
  test('handles conversation_message by incrementing unread and notifying', () => {
    const h = createContext();
    const msg = {
      type: 'conversation_message',
      data: {
        conversationId: 'conv-1',
        messageId: 'm-2',
        fromIdentityId: 'sender-1',
        createdAt: new Date().toISOString(),
      },
    } as ChatIncomingMessage;
    handleConversationSocketMessage(msg, h.ctx);
    expect(h.conversations[0]?.unreadCount).toBe(1);
    expect(h.notifications.length).toBe(1);
  });

  test('handles conversation_message_deleted by marking message deleted', () => {
    const h = createContext();
    const msg = {
      type: 'conversation_message_deleted',
      data: { conversationId: 'conv-1', messageId: 'm-1' },
    } as ChatIncomingMessage;
    handleConversationSocketMessage(msg, h.ctx);
    expect(h.messagesState['conv-1']?.messages[0]?.deleted).toBe(true);
  });

  test('handles group_terminated by removing conversation and clearing active', () => {
    const h = createContext();
    const msg = {
      type: 'group_terminated',
      data: {
        conversationId: 'conv-1',
        terminatedBy: { id: 'admin-1', username: 'admin' },
      },
    } as ChatIncomingMessage;
    handleConversationSocketMessage(msg, h.ctx);
    expect(h.conversations).toHaveLength(0);
    expect(h.activeConversationId).toBeNull();
  });
});
