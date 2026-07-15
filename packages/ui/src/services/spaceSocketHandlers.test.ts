import { describe, expect, it, mock } from 'bun:test';
import type { PublicSpace, PublicSpaceMessage, ChatIncomingMessage } from '@adieuu/shared';
import { handleSpaceSocketMessage, type SpaceSocketHandlerContext } from './spaceSocketHandlers';

function makeSpace(overrides: Partial<PublicSpace> = {}): PublicSpace {
  return {
    id: 'space-1',
    slug: 'test-space',
    name: 'Test Space',
    visibility: 'public',
    createdBy: 'id-owner',
    ownerIdentityId: 'id-owner',
    allowFreeMembers: true,
    memberCount: 5,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMessage(overrides: Partial<PublicSpaceMessage> = {}): PublicSpaceMessage {
  return {
    id: 'msg-1',
    spaceId: 'space-1',
    channelId: 'ch-1',
    fromIdentityId: 'id-sender',
    content: 'hello',
    clientMessageId: 'client-msg-1',
    createdAt: '2024-01-01T00:00:01.000Z',
    ...overrides,
  };
}

function createContext(overrides: Partial<SpaceSocketHandlerContext> = {}): SpaceSocketHandlerContext {
  return {
    setSpaces: mock(() => {}),
    setMessagesByChannel: mock(() => {}),
    activeSpaceId: null,
    activeChannelId: null,
    identityId: 'my-identity',
    fetchChannelMessages: mock(() => {}),
    refreshSpaces: mock(() => {}),
    ...overrides,
  };
}

describe('handleSpaceSocketMessage', () => {
  describe('space_created', () => {
    it('prepends the new space to the list', () => {
      const ctx = createContext();
      const space = makeSpace({ id: 'space-new', name: 'New Space' });

      handleSpaceSocketMessage(
        { type: 'space_created', data: { space } } as ChatIncomingMessage,
        ctx,
      );

      expect(ctx.setSpaces).toHaveBeenCalledTimes(1);
      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace()]);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('space-new');
    });

    it('does not duplicate an existing space', () => {
      const ctx = createContext();
      const space = makeSpace({ id: 'space-1' });

      handleSpaceSocketMessage(
        { type: 'space_created', data: { space } } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace()]);
      expect(result).toHaveLength(1);
    });
  });

  describe('space_updated', () => {
    it('replaces the matching space', () => {
      const ctx = createContext();
      const updated = makeSpace({ id: 'space-1', name: 'Renamed' });

      handleSpaceSocketMessage(
        { type: 'space_updated', data: { space: updated } } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace()]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Renamed');
    });
  });

  describe('space_message', () => {
    it('fetches channel messages when viewing the active channel', () => {
      const ctx = createContext({ activeSpaceId: 'space-1', activeChannelId: 'ch-1' });
      const msg = makeMessage();

      handleSpaceSocketMessage(
        { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
        ctx,
      );

      expect(ctx.fetchChannelMessages).toHaveBeenCalledWith('space-1', 'ch-1');
    });

    it('does not fetch messages when viewing a different channel', () => {
      const ctx = createContext({ activeSpaceId: 'space-1', activeChannelId: 'ch-other' });
      const msg = makeMessage();

      handleSpaceSocketMessage(
        { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
        ctx,
      );

      expect(ctx.fetchChannelMessages).not.toHaveBeenCalled();
    });

    it('does not fetch messages when no space is active', () => {
      const ctx = createContext({ activeSpaceId: null, activeChannelId: null });
      const msg = makeMessage();

      handleSpaceSocketMessage(
        { type: 'space_message', data: { message: msg } } as ChatIncomingMessage,
        ctx,
      );

      expect(ctx.fetchChannelMessages).not.toHaveBeenCalled();
    });
  });

  describe('space_member_joined', () => {
    it('increments the member count', () => {
      const ctx = createContext();

      handleSpaceSocketMessage(
        {
          type: 'space_member_joined',
          data: {
            spaceId: 'space-1',
            member: { id: 'm-1', spaceId: 'space-1', identityId: 'id-new', roleIds: [], status: 'active', joinedAt: '' },
          },
        } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace({ memberCount: 5 })]);
      expect(result[0].memberCount).toBe(6);
    });
  });

  describe('space_member_left', () => {
    it('decrements the member count for another user leaving', () => {
      const ctx = createContext({ identityId: 'my-identity' });

      handleSpaceSocketMessage(
        {
          type: 'space_member_left',
          data: { spaceId: 'space-1', identityId: 'id-other' },
        } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace({ memberCount: 5 })]);
      expect(result[0].memberCount).toBe(4);
    });

    it('removes the space when the current user leaves', () => {
      const ctx = createContext({ identityId: 'my-identity' });

      handleSpaceSocketMessage(
        {
          type: 'space_member_left',
          data: { spaceId: 'space-1', identityId: 'my-identity' },
        } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace({ id: 'space-1' }), makeSpace({ id: 'space-2' })]);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('space-2');
    });

    it('does not go below 0 members', () => {
      const ctx = createContext({ identityId: 'my-identity' });

      handleSpaceSocketMessage(
        {
          type: 'space_member_left',
          data: { spaceId: 'space-1', identityId: 'id-other' },
        } as ChatIncomingMessage,
        ctx,
      );

      const updater = (ctx.setSpaces as ReturnType<typeof mock>).mock.calls[0][0];
      const result = updater([makeSpace({ memberCount: 0 })]);
      expect(result[0].memberCount).toBe(0);
    });
  });

  describe('invite events', () => {
    it('acknowledges space_invite_received without error', () => {
      const ctx = createContext();
      handleSpaceSocketMessage(
        {
          type: 'space_invite_received',
          data: {
            invite: {
              id: 'inv-1', spaceId: 'space-1', invitedIdentityId: 'my-identity',
              invitedByIdentityId: 'id-other', status: 'pending', memberCount: 1, createdAt: '',
            },
          },
        } as ChatIncomingMessage,
        ctx,
      );
      expect(ctx.setSpaces).not.toHaveBeenCalled();
    });

    it('acknowledges space_invite_accepted without error', () => {
      const ctx = createContext();
      handleSpaceSocketMessage(
        {
          type: 'space_invite_accepted',
          data: { spaceId: 'space-1', identityId: 'id-other' },
        } as ChatIncomingMessage,
        ctx,
      );
      expect(ctx.setSpaces).not.toHaveBeenCalled();
    });

    it('acknowledges space_invite_revoked without error', () => {
      const ctx = createContext();
      handleSpaceSocketMessage(
        {
          type: 'space_invite_revoked',
          data: { inviteId: 'inv-1', spaceId: 'space-1' },
        } as ChatIncomingMessage,
        ctx,
      );
      expect(ctx.setSpaces).not.toHaveBeenCalled();
    });
  });
});
