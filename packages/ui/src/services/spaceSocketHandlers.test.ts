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

  const ctx: SpaceSocketHandlerContext = {
    setSpaces: () => {},
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
    reactionAddedCalls,
    reactionRemovedCalls,
    pinsUpdatedCalls,
    fetchCalls,
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

  test('space_message: does not increment unread for active channel from own user', () => {
    const h = createContext();
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
});
