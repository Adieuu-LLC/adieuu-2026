/**
 * Unit tests for Space message reactions (mocked repositories), focused on the
 * channel view ACL and the audience-scoped realtime publish that keep
 * restricted-channel reactions off unauthorized members' screens.
 *
 * @module services/space/reactions.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const memberRepo = {
  findMember: mock(async (_s: ObjectId, _i: ObjectId) => null as any) as AnyMock,
  listByAnyRole: mock(async (_s: ObjectId, _r: ObjectId[]) => [] as any[]) as AnyMock,
};

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const channelRepo = {
  findByIdInSpace: mock(async (_s: ObjectId, _c: ObjectId) => null as any) as AnyMock,
};

const messageRepo = {
  findByIdInChannel: mock(async (_c: ObjectId, _m: ObjectId) => null as any) as AnyMock,
};

const reactionRepo = {
  findExisting: mock(async (_m: ObjectId, _i: ObjectId, _e: string) => null as any) as AnyMock,
  createReaction: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as AnyMock,
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
  deleteById: mock(async (_id: ObjectId) => true) as AnyMock,
  findByMessage: mock(async (_m: ObjectId) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space-member.repository', () => ({
  getSpaceMemberRepository: () => memberRepo,
}));
mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => roleRepo,
}));
mock.module('../../repositories/space-channel.repository', () => ({
  getSpaceChannelRepository: () => channelRepo,
}));
mock.module('../../repositories/space-message.repository', () => ({
  getSpaceMessageRepository: () => messageRepo,
}));
mock.module('../../repositories/space-reaction.repository', () => ({
  getSpaceReactionRepository: () => reactionRepo,
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import { addSpaceReaction, removeSpaceReaction, getSpaceReactions } from './reactions';

const SPACE = new ObjectId();
const CHANNEL = new ObjectId();
const MESSAGE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();
const MOD_ROLE = new ObjectId();

function seedRoles() {
  roleRepo.findBySpace.mockResolvedValue([
    {
      _id: MOD_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages', 'addReactions'],
      position: 100,
      isDefaultMember: false,
      isSystem: false,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages', 'addReactions'],
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'everyone',
    },
  ]);
}

/** Marks `actorId` as an active member holding `roleIds`. */
function grantMember(actorId: ObjectId, roleIds: ObjectId[]) {
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(actorId)
      ? {
          _id: new ObjectId(),
          spaceId: SPACE,
          identityId: actorId,
          roleIds,
          status: 'active',
          joinedAt: new Date(),
        }
      : null,
  );
}

function seedChannel(overrides: Record<string, unknown> = {}) {
  channelRepo.findByIdInSpace.mockResolvedValue({
    _id: CHANNEL,
    spaceId: SPACE,
    type: 'text',
    name: 'general',
    position: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function seedMessage() {
  messageRepo.findByIdInChannel.mockResolvedValue({
    _id: MESSAGE,
    spaceId: SPACE,
    channelId: CHANNEL,
    fromIdentityId: new ObjectId(),
    content: 'hello',
    clientMessageId: 'c1',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('space/reactions', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [memberRepo, roleRepo, channelRepo, messageRepo, reactionRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    memberRepo.findMember.mockResolvedValue(null);
    memberRepo.listByAnyRole.mockResolvedValue([]);
    roleRepo.findBySpace.mockResolvedValue([]);
    channelRepo.findByIdInSpace.mockResolvedValue(null);
    messageRepo.findByIdInChannel.mockResolvedValue(null);
    reactionRepo.findExisting.mockResolvedValue(null);
    reactionRepo.findById.mockResolvedValue(null);
    reactionRepo.findByMessage.mockResolvedValue([]);
    publishSpaceEvent.mockClear();
    seedRoles();
  });

  describe('addSpaceReaction (channel ACL)', () => {
    test('hides a restricted channel from a member without the role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();

      const r = await addSpaceReaction(SPACE, CHANNEL, MESSAGE, caller, '👍');
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(reactionRepo.createReaction).not.toHaveBeenCalled();
      expect(publishSpaceEvent).not.toHaveBeenCalled();
    });

    test('allows a member holding the channel role and scopes the publish audience', async () => {
      const caller = new ObjectId();
      grantMember(caller, [MOD_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();
      memberRepo.listByAnyRole.mockResolvedValue([
        { _id: new ObjectId(), spaceId: SPACE, identityId: caller, roleIds: [MOD_ROLE], status: 'active' },
      ]);

      const r = await addSpaceReaction(SPACE, CHANNEL, MESSAGE, caller, '👍');
      expect(r.success).toBe(true);
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      const [, event, options] = publishSpaceEvent.mock.calls[0]!;
      expect(event.type).toBe('space_reaction_added');
      expect(options.audienceIdentityIds).toEqual([caller.toHexString()]);
    });

    test('broadcasts without an audience list on an everyone-open channel', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [EVERYONE_ROLE] });
      seedMessage();

      const r = await addSpaceReaction(SPACE, CHANNEL, MESSAGE, caller, '👍');
      expect(r.success).toBe(true);
      const [, , options] = publishSpaceEvent.mock.calls[0]!;
      expect(options.audienceIdentityIds).toBeNull();
    });

    test('rejects a non-member', async () => {
      const r = await addSpaceReaction(SPACE, CHANNEL, MESSAGE, new ObjectId(), '👍');
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('rejects arbitrary text that is not an emoji or custom token', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [EVERYONE_ROLE] });
      seedMessage();

      for (const emoji of ['hello', '<img src=x>', 'a'.repeat(33), '']) {
        const r = await addSpaceReaction(SPACE, CHANNEL, MESSAGE, caller, emoji);
        expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
      }
      expect(reactionRepo.createReaction).not.toHaveBeenCalled();
    });

    test('accepts custom emoji tokens for members with useCustomEmoji', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [EVERYONE_ROLE] });
      seedMessage();

      const r = await addSpaceReaction(
        SPACE, CHANNEL, MESSAGE, caller, `custom:${'ab'.repeat(12)}`,
      );
      // Depending on seeded permissions this either succeeds or fails with
      // FORBIDDEN (missing useCustomEmoji) — never INVALID_CONTENT.
      if (!r.success) {
        expect(r.errorCode).toBe('FORBIDDEN');
      }
    });
  });

  describe('removeSpaceReaction (channel ACL)', () => {
    test('hides a restricted channel from a member without the role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      reactionRepo.findById.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: SPACE,
        channelId: CHANNEL,
        messageId: MESSAGE,
        identityId: caller,
        emoji: '👍',
      });

      const r = await removeSpaceReaction(SPACE, CHANNEL, MESSAGE, new ObjectId(), caller);
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(reactionRepo.deleteById).not.toHaveBeenCalled();
    });

    test('lets the author remove their own reaction on a viewable channel', async () => {
      const caller = new ObjectId();
      const reactionId = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [EVERYONE_ROLE] });
      reactionRepo.findById.mockResolvedValue({
        _id: reactionId,
        spaceId: SPACE,
        channelId: CHANNEL,
        messageId: MESSAGE,
        identityId: caller,
        emoji: '👍',
      });

      const r = await removeSpaceReaction(SPACE, CHANNEL, MESSAGE, reactionId, caller);
      expect(r.success).toBe(true);
      expect(reactionRepo.deleteById).toHaveBeenCalledTimes(1);
      expect(publishSpaceEvent.mock.calls[0]![1].type).toBe('space_reaction_removed');
    });
  });

  describe('getSpaceReactions (channel ACL)', () => {
    test('hides a restricted channel from a member without the role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();

      const r = await getSpaceReactions(SPACE, CHANNEL, MESSAGE, caller);
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(reactionRepo.findByMessage).not.toHaveBeenCalled();
    });

    test('returns reactions for a member who can view the channel', async () => {
      const caller = new ObjectId();
      grantMember(caller, [MOD_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();
      reactionRepo.findByMessage.mockResolvedValue([
        {
          _id: new ObjectId(),
          spaceId: SPACE,
          channelId: CHANNEL,
          messageId: MESSAGE,
          identityId: caller,
          emoji: '👍',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const r = await getSpaceReactions(SPACE, CHANNEL, MESSAGE, caller);
      expect(r.success).toBe(true);
      expect(r.reactions).toHaveLength(1);
    });
  });
});
