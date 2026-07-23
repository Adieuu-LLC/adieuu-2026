import { describe, expect, test } from 'bun:test';
import type { ChatIncomingMessage, PublicSpaceMessage } from '@adieuu/shared';
import {
  handleSpaceSocketMessage,
  type SpaceSocketHandlerContext,
  type SpaceChannelUnreadState,
} from './spaceSocketHandlers';

function makeMessage(
  overrides: Partial<PublicSpaceMessage> = {},
): PublicSpaceMessage {
  return {
    id: 'msg-1',
    spaceId: 'space-1',
    channelId: 'ch-1',
    fromIdentityId: 'user-1',
    content: 'hello',
    clientMessageId: 'client-1',
    deleted: false,
    revisionCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function createContext(
  overrides: Partial<SpaceSocketHandlerContext> = {},
) {
  let messagesByChannel: Record<
    string,
    { messages: PublicSpaceMessage[]; olderCursor: string | null; loading: boolean }
  > = {
    'ch-1': {
      messages: [makeMessage()],
      olderCursor: null,
      loading: false,
    },
  };

  let unreadByChannel: Record<string, SpaceChannelUnreadState> = {};
  let unreadBySpace: Record<string, number> = {};

  const reactionAddedCalls: Array<{
    id: string;
    messageId: string;
    channelId: string;
    fromIdentityId: string;
    emoji: string;
    createdAt: string;
  }> = [];
  const reactionRemovedCalls: Array<{ messageId: string; reactionId: string }> = [];
  const pinsUpdatedCalls: Array<{ messageId: string; action: 'pinned' | 'unpinned' }> = [];
  const fetchCalls: Array<{ spaceId: string; channelId: string }> = [];
  const notificationCalls: Array<{
    title: string;
    body: string;
    options: { isMention?: boolean; channelId: string; spaceId?: string; spaceSlug?: string; onClick?: () => void };
  }> = [];

  let spaces: Array<{ id: string }> = [{ id: 'space-1' }, { id: 'space-2' }];
  const deletedCalls: string[] = [];

  const ctx: SpaceSocketHandlerContext = {
    setSpaces: (updater) => {
      spaces = updater(spaces as never) as Array<{ id: string }>;
    },
    setMessagesByChannel: (updater) => {
      messagesByChannel = updater(messagesByChannel);
    },
    activeSpaceId: 'space-1',
    activeChannelId: 'ch-1',
    identityId: 'me-1',
    fetchChannelMessages: (spaceId, channelId) => {
      fetchCalls.push({ spaceId, channelId });
    },
    refreshSpaces: () => {},
    onSocketReactionAdded: (r) => reactionAddedCalls.push(r),
    onSocketReactionRemoved: (messageId, reactionId) =>
      reactionRemovedCalls.push({ messageId, reactionId }),
    onSocketPinsUpdated: (messageId, action) =>
      pinsUpdatedCalls.push({ messageId, action }),
    setUnreadByChannel: (updater) => {
      unreadByChannel = updater(unreadByChannel);
    },
    setUnreadBySpace: (updater) => {
      unreadBySpace = updater(unreadBySpace);
    },
    fireNotification: (title, body, options) => {
      notificationCalls.push({ title, body, options });
    },
    channelNames: { 'ch-1': 'general' },
    participantProfiles: {
      'user-2': { id: 'user-2', displayName: 'Alice', username: 'alice' } as never,
    },
    activeChannelMessages: messagesByChannel['ch-1']?.messages ?? [],
    onSpaceDeleted: (spaceId) => deletedCalls.push(spaceId),
    ...overrides,
  };

  return {
    ctx,
    get messagesByChannel() {
      return messagesByChannel;
    },
    get unreadByChannel() {
      return unreadByChannel;
    },
    get unreadBySpace() {
      return unreadBySpace;
    },
    get spaces() {
      return spaces;
    },
    deletedCalls,
    reactionAddedCalls,
    reactionRemovedCalls,
    pinsUpdatedCalls,
    fetchCalls,
    notificationCalls,
  };
}

describe('spaceSocketHandlers', () => {
  // -------------------------------------------------------------------------
  // space_message — merge-prepend dedup
  // -------------------------------------------------------------------------

  test('space_message: replaces existing message (dedup)', () => {
    const h = createContext();
    const updatedMsg = makeMessage({ content: 'updated hello' });
    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: { message: updatedMsg },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.messagesByChannel['ch-1']!.messages).toHaveLength(1);
    expect(h.messagesByChannel['ch-1']!.messages[0]!.content).toBe('updated hello');
  });

  test('space_message: prepends genuinely new message', () => {
    const h = createContext();
    const newMsg = makeMessage({ id: 'msg-2', content: 'world' });
    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: { message: newMsg },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.messagesByChannel['ch-1']!.messages).toHaveLength(2);
    expect(h.messagesByChannel['ch-1']!.messages[0]!.id).toBe('msg-2');
  });

  test('space_message: does not increment unread for own message on inactive channel', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({ id: 'msg-2', fromIdentityId: 'me-1' });
    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: { message: msg },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.unreadByChannel['ch-1']).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // space_message — different channel → unread
  // -------------------------------------------------------------------------

  test('space_deleted: removes space from list and notifies', () => {
    const h = createContext();
    h.ctx.setUnreadBySpace?.((prev) => ({ ...prev, 'space-1': 3, 'space-2': 1 }));
    handleSpaceSocketMessage(
      {
        type: 'space_deleted',
        data: { spaceId: 'space-1' },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.spaces.map((s) => s.id)).toEqual(['space-2']);
    expect(h.unreadBySpace['space-1']).toBeUndefined();
    expect(h.unreadBySpace['space-2']).toBe(1);
    expect(h.deletedCalls).toEqual(['space-1']);
  });

  test('space_channel_created: appends channel for the active Space', () => {
    let channels: Array<{ id: string; spaceId: string; position: number; name: string }> = [
      { id: 'ch-1', spaceId: 'space-1', position: 0, name: 'general' },
    ];
    const h = createContext({
      setChannels: (updater) => {
        channels = updater(channels as never) as typeof channels;
      },
    });
    handleSpaceSocketMessage(
      {
        type: 'space_channel_created',
        data: {
          channel: {
            id: 'ch-2',
            spaceId: 'space-1',
            type: 'text',
            name: 'lounge',
            position: 1,
            categoryId: null,
            allowedRoleIds: [],
            createdAt: '',
            updatedAt: '',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(channels.map((c) => c.id)).toEqual(['ch-1', 'ch-2']);
  });

  test('space_channel_updated: replaces channel for the active Space', () => {
    let channels: Array<{ id: string; spaceId: string; position: number; name: string }> = [
      { id: 'ch-1', spaceId: 'space-1', position: 0, name: 'general' },
    ];
    const h = createContext({
      setChannels: (updater) => {
        channels = updater(channels as never) as typeof channels;
      },
    });
    handleSpaceSocketMessage(
      {
        type: 'space_channel_updated',
        data: {
          channel: {
            id: 'ch-1',
            spaceId: 'space-1',
            type: 'text',
            name: 'renamed',
            position: 0,
            categoryId: null,
            allowedRoleIds: [],
            createdAt: '',
            updatedAt: '',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(channels).toEqual([
      { id: 'ch-1', spaceId: 'space-1', type: 'text', name: 'renamed', position: 0, categoryId: null, allowedRoleIds: [], createdAt: '', updatedAt: '' },
    ]);
  });

  test('space_category_created: appends category for the active Space', () => {
    let categories: Array<{ id: string; spaceId: string; position: number; name: string }> = [];
    const h = createContext({
      setCategories: (updater) => {
        categories = updater(categories as never) as typeof categories;
      },
    });
    handleSpaceSocketMessage(
      {
        type: 'space_category_created',
        data: {
          category: {
            id: 'cat-1',
            spaceId: 'space-1',
            name: 'Projects',
            position: 0,
            allowedRoleIds: [],
            createdAt: '',
            updatedAt: '',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(categories.map((c) => c.id)).toEqual(['cat-1']);
  });

  test('space_channel_layout_updated: replaces categories and channels', () => {
    let categories: Array<{ id: string }> = [{ id: 'old' }];
    let channels: Array<{ id: string }> = [{ id: 'old-ch' }];
    const h = createContext({
      setCategories: (updater) => {
        categories = updater(categories as never) as typeof categories;
      },
      setChannels: (updater) => {
        channels = updater(channels as never) as typeof channels;
      },
    });
    handleSpaceSocketMessage(
      {
        type: 'space_channel_layout_updated',
        data: {
          spaceId: 'space-1',
          categories: [
            {
              id: 'cat-1',
              spaceId: 'space-1',
              name: 'A',
              position: 0,
              allowedRoleIds: [],
              createdAt: '',
              updatedAt: '',
            },
          ],
          channels: [
            {
              id: 'ch-1',
              spaceId: 'space-1',
              type: 'text',
              name: 'general',
              position: 0,
              categoryId: null,
              allowedRoleIds: [],
              createdAt: '',
              updatedAt: '',
            },
          ],
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(categories.map((c) => c.id)).toEqual(['cat-1']);
    expect(channels.map((c) => c.id)).toEqual(['ch-1']);
  });

  test('space_message: increments unread for non-active channel', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({ id: 'msg-2', fromIdentityId: 'user-2' });
    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: { message: msg },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.unreadByChannel['ch-1']!.unread).toBe(1);
    expect(h.unreadByChannel['ch-1']!.mention).toBe(false);
    expect(h.unreadByChannel['ch-1']!.spaceId).toBe('space-1');
  });

  test('space_message: sets mention badge when user is mentioned', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({
      id: 'msg-3',
      fromIdentityId: 'user-2',
      mentionedIdentityIds: ['me-1'],
    });
    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: { message: msg },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.unreadByChannel['ch-1']!.mention).toBe(true);
  });

  // -------------------------------------------------------------------------
  // space_message_edited
  // -------------------------------------------------------------------------

  test('space_message_edited: updates message fields', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_message_edited',
        data: {
          channelId: 'ch-1',
          messageId: 'msg-1',
          fromIdentityId: 'user-1',
          lastEditedAt: '2026-07-15T00:00:00Z',
          revisionCount: 1,
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    const msg = h.messagesByChannel['ch-1']!.messages[0]!;
    expect(msg.revisionCount).toBe(1);
    expect(msg.lastEditedAt).toBe('2026-07-15T00:00:00Z');
  });

  test('space_message_edited: ignores unknown message', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_message_edited',
        data: {
          channelId: 'ch-1',
          messageId: 'unknown-msg',
          fromIdentityId: 'user-1',
          lastEditedAt: '2026-07-15T00:00:00Z',
          revisionCount: 1,
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.messagesByChannel['ch-1']!.messages).toHaveLength(1);
    expect(h.messagesByChannel['ch-1']!.messages[0]!.revisionCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // space_message_deleted
  // -------------------------------------------------------------------------

  test('space_message_deleted: marks message as deleted', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_message_deleted',
        data: {
          channelId: 'ch-1',
          messageId: 'msg-1',
          deletedBy: 'user-1',
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    const msg = h.messagesByChannel['ch-1']!.messages[0]!;
    expect(msg.deleted).toBe(true);
    expect(msg.content).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // space_reaction_added
  // -------------------------------------------------------------------------

  test('space_reaction_added: forwards to callback', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_reaction_added',
        data: {
          reaction: {
            id: 'r-1',
            spaceId: 'space-1',
            channelId: 'ch-1',
            messageId: 'msg-1',
            identityId: 'user-2',
            emoji: '👍',
            createdAt: '2026-07-15T00:00:00Z',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.reactionAddedCalls).toHaveLength(1);
    expect(h.reactionAddedCalls[0]!.emoji).toBe('👍');
    expect(h.reactionAddedCalls[0]!.fromIdentityId).toBe('user-2');
  });

  // -------------------------------------------------------------------------
  // space_reaction_removed
  // -------------------------------------------------------------------------

  test('space_reaction_removed: forwards to callback', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_reaction_removed',
        data: {
          reactionId: 'r-1',
          messageId: 'msg-1',
          channelId: 'ch-1',
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.reactionRemovedCalls).toHaveLength(1);
    expect(h.reactionRemovedCalls[0]).toEqual({
      messageId: 'msg-1',
      reactionId: 'r-1',
    });
  });

  // -------------------------------------------------------------------------
  // space_pins_updated
  // -------------------------------------------------------------------------

  test('space_pins_updated: forwards pinned event', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_pins_updated',
        data: {
          channelId: 'ch-1',
          messageId: 'msg-1',
          action: 'pinned',
          pinnedBy: 'user-1',
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.pinsUpdatedCalls).toHaveLength(1);
    expect(h.pinsUpdatedCalls[0]).toEqual({
      messageId: 'msg-1',
      action: 'pinned',
    });
  });

  test('space_pins_updated: forwards unpinned event', () => {
    const h = createContext();
    handleSpaceSocketMessage(
      {
        type: 'space_pins_updated',
        data: {
          channelId: 'ch-1',
          messageId: 'msg-1',
          action: 'unpinned',
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.pinsUpdatedCalls[0]!.action).toBe('unpinned');
  });

  // -------------------------------------------------------------------------
  // Unread accumulation
  // -------------------------------------------------------------------------

  test('unread count accumulates across multiple messages', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    for (let i = 0; i < 3; i++) {
      handleSpaceSocketMessage(
        {
          type: 'space_message',
          data: {
            message: makeMessage({
              id: `msg-new-${i}`,
              fromIdentityId: 'user-2',
            }),
          },
        } as ChatIncomingMessage,
        h.ctx,
      );
    }
    expect(h.unreadByChannel['ch-1']!.unread).toBe(3);
  });

  test('mention flag sticks once set', () => {
    const h = createContext({ activeChannelId: 'ch-other' });

    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: {
          message: makeMessage({
            id: 'msg-mention',
            fromIdentityId: 'user-2',
            mentionedIdentityIds: ['me-1'],
          }),
        },
      } as ChatIncomingMessage,
      h.ctx,
    );

    handleSpaceSocketMessage(
      {
        type: 'space_message',
        data: {
          message: makeMessage({
            id: 'msg-normal',
            fromIdentityId: 'user-2',
          }),
        },
      } as ChatIncomingMessage,
      h.ctx,
    );

    expect(h.unreadByChannel['ch-1']!.unread).toBe(2);
    expect(h.unreadByChannel['ch-1']!.mention).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Notifications — space_message
  // -------------------------------------------------------------------------

  test('space_message: fires notification with author name for message from known user', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({ id: 'msg-notif', fromIdentityId: 'user-2' });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(1);
    expect(h.notificationCalls[0]!.title).toBe('New message');
    expect(h.notificationCalls[0]!.body).toBe('Alice in #general');
    expect(h.notificationCalls[0]!.options.spaceId).toBe('space-1');
  });

  test('space_message: fires notification with fallback for unknown author', () => {
    const h = createContext({ activeChannelId: 'ch-other', participantProfiles: {} });
    const msg = makeMessage({ id: 'msg-notif', fromIdentityId: 'user-unknown' });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(1);
    expect(h.notificationCalls[0]!.body).toBe('New message in #general');
  });

  test('space_message: fires reply notification with author name', () => {
    const h = createContext();
    const msg = makeMessage({
      id: 'msg-reply',
      fromIdentityId: 'user-2',
      replyToMessageId: 'msg-1',
      replyToMessageAuthorId: 'me-1',
    });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(1);
    expect(h.notificationCalls[0]!.title).toBe('Reply');
    expect(h.notificationCalls[0]!.body).toBe('Alice replied to your message in #general');
    expect(h.notificationCalls[0]!.options.spaceId).toBe('space-1');
  });

  test('space_message: fires mention notification with author name', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({
      id: 'msg-mention-notif',
      fromIdentityId: 'user-2',
      mentionedIdentityIds: ['me-1'],
    });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(1);
    expect(h.notificationCalls[0]!.title).toBe('Mention');
    expect(h.notificationCalls[0]!.body).toBe('Alice mentioned you in #general');
    expect(h.notificationCalls[0]!.options.isMention).toBe(true);
    expect(h.notificationCalls[0]!.options.spaceId).toBe('space-1');
  });

  test('space_message: does NOT fire notification for own message', () => {
    const h = createContext();
    const msg = makeMessage({ id: 'msg-self', fromIdentityId: 'me-1' });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Notifications — space_reaction_added
  // -------------------------------------------------------------------------

  test('space_reaction_added: fires notification with author name when reaction is on own message', () => {
    const ownMsg = makeMessage({ id: 'msg-own', fromIdentityId: 'me-1' });
    const h = createContext({
      activeChannelMessages: [ownMsg],
    });
    handleSpaceSocketMessage(
      {
        type: 'space_reaction_added',
        data: {
          reaction: {
            id: 'r-2',
            spaceId: 'space-1',
            channelId: 'ch-1',
            messageId: 'msg-own',
            identityId: 'user-2',
            emoji: '🎉',
            createdAt: '2026-07-16T00:00:00Z',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(1);
    expect(h.notificationCalls[0]!.title).toBe('Reaction');
    expect(h.notificationCalls[0]!.body).toBe('Alice reacted 🎉 to your message in #general');
    expect(h.notificationCalls[0]!.options.spaceId).toBe('space-1');
  });

  test('space_reaction_added: does NOT fire notification for reaction on others message', () => {
    const otherMsg = makeMessage({ id: 'msg-other', fromIdentityId: 'user-3' });
    const h = createContext({
      activeChannelMessages: [otherMsg],
    });
    handleSpaceSocketMessage(
      {
        type: 'space_reaction_added',
        data: {
          reaction: {
            id: 'r-3',
            spaceId: 'space-1',
            channelId: 'ch-1',
            messageId: 'msg-other',
            identityId: 'user-2',
            emoji: '👍',
            createdAt: '2026-07-16T00:00:00Z',
          },
        },
      } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.notificationCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Space-level unread
  // -------------------------------------------------------------------------

  test('space_message: increments unreadBySpace for non-active channel', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    const msg = makeMessage({ id: 'msg-2', fromIdentityId: 'user-2' });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.unreadBySpace['space-1']).toBe(1);
  });

  test('space_message: accumulates unreadBySpace across multiple messages', () => {
    const h = createContext({ activeChannelId: 'ch-other' });
    for (let i = 0; i < 3; i++) {
      handleSpaceSocketMessage(
        {
          type: 'space_message',
          data: {
            message: makeMessage({
              id: `msg-space-${i}`,
              fromIdentityId: 'user-2',
            }),
          },
        } as ChatIncomingMessage,
        h.ctx,
      );
    }
    expect(h.unreadBySpace['space-1']).toBe(3);
  });

  test('space_message: does not increment unreadBySpace for active channel', () => {
    const h = createContext();
    const msg = makeMessage({ id: 'msg-active', fromIdentityId: 'user-2' });
    handleSpaceSocketMessage(
      { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
      h.ctx,
    );
    expect(h.unreadBySpace['space-1']).toBeUndefined();
  });
});
