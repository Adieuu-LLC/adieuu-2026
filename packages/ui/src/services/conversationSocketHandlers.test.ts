import { describe, expect, test } from 'bun:test';
import type { ChatIncomingMessage } from '@adieuu/shared';
import {
  handleConversationSocketMessage,
  type ConversationSocketHandlerContext,
} from './conversationSocketHandlers';
import {
  getActiveSupportTicketId,
  onSupportTicketUpdated,
  setActiveSupportTicketId,
} from './supportTicketEvents';

function createContext() {
  const notifications: Array<{ title: string; body: string }> = [];
  let conversations = [{ id: 'conv-1', unreadCount: 0, hasUnread: false, lastMessageAt: '' }];
  let activeConversationId: string | null = 'conv-1';
  let invites: Array<{ id: string }> = [];
  let messagesState: Record<string, { messages: Array<{ id: string; fromIdentityId: string }>; olderCursor: string | null; loading: boolean; showManualLoadOlder?: boolean; showManualLoadNewer?: boolean }> = {
    'conv-1': {
      messages: [{ id: 'm-1', fromIdentityId: 'me-1' }],
      olderCursor: null,
      loading: false,
      showManualLoadOlder: false,
      showManualLoadNewer: false,
    },
  };

  const refreshCalls: Array<{ c: string; m: string }> = [];
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
    refreshMessageInConversation: (c, m) => {
      refreshCalls.push({ c, m });
    },
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
    refreshCalls,
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

  test('handles conversation_message_edited by refreshing that message in the active thread', () => {
    const h = createContext();
    const msg = {
      type: 'conversation_message_edited',
      data: {
        conversationId: 'conv-1',
        messageId: 'm-1',
        fromIdentityId: 'sender-1',
        lastEditedAt: new Date().toISOString(),
        revisionCount: 1,
      },
    } as ChatIncomingMessage;
    handleConversationSocketMessage(msg, h.ctx);
    expect(h.refreshCalls).toEqual([{ c: 'conv-1', m: 'm-1' }]);
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

  test('emits support ticket update and shows notification when not viewing ticket', () => {
    const h = createContext();
    const updates: string[] = [];
    const unsubscribe = onSupportTicketUpdated((event) => {
      updates.push(event.ticketId);
    });
    setActiveSupportTicketId(null);

    const msg = {
      type: 'notification_created',
      data: {
        notification: {
          type: 'support_ticket_reply',
          data: { ticketId: 'TKT-001', title: 'Help me' },
        },
      },
    } as ChatIncomingMessage;

    handleConversationSocketMessage(msg, h.ctx);

    expect(updates).toEqual(['TKT-001']);
    expect(h.notifications.length).toBe(1);
    unsubscribe();
  });

  test('emits support ticket update without notification when viewing ticket', () => {
    const h = createContext();
    const updates: string[] = [];
    const unsubscribe = onSupportTicketUpdated((event) => {
      updates.push(event.ticketId);
    });
    setActiveSupportTicketId('TKT-001');

    const msg = {
      type: 'notification_created',
      data: {
        notification: {
          type: 'support_ticket_user_reply',
          data: { ticketId: 'TKT-001', ticketObjectId: 'abc123', title: 'Help me' },
        },
      },
    } as ChatIncomingMessage;

    handleConversationSocketMessage(msg, h.ctx);

    expect(updates).toEqual(['TKT-001']);
    expect(h.notifications.length).toBe(0);
    expect(getActiveSupportTicketId()).toBe('TKT-001');
    unsubscribe();
    setActiveSupportTicketId(null);
  });

  test('routes staff support notifications to moderation ticket detail', () => {
    const h = createContext();
    let navigatedTo = '';
    h.ctx.navigate = (path) => {
      navigatedTo = path;
    };
    let notificationOnClick: (() => void) | undefined;
    h.ctx.fireNotification = (_title, _body, options) => {
      notificationOnClick = options?.onClick;
    };
    setActiveSupportTicketId(null);

    const msg = {
      type: 'notification_created',
      data: {
        notification: {
          type: 'support_ticket_assigned',
          data: { ticketId: 'TKT-001', ticketObjectId: 'mongo-id-1', title: 'Help me' },
        },
      },
    } as ChatIncomingMessage;

    handleConversationSocketMessage(msg, h.ctx);

    expect(notificationOnClick).toBeDefined();
    notificationOnClick?.();
    expect(navigatedTo).toBe('/moderation/tickets/mongo-id-1');
    setActiveSupportTicketId(null);
  });
});
