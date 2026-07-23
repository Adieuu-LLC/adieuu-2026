/**
 * Unit tests for Space channel pins (mocked repositories), focused on the
 * channel view ACL and audience-scoped realtime publish.
 *
 * @module services/space/pins.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const spaceRepo = {
  findById: mock(async (_id: ObjectId) => null as any) as AnyMock,
};

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
  findByIds: mock(async (_ids: ObjectId[]) => [] as any[]) as AnyMock,
};

const pinRepo = {
  findPin: mock(async (_c: ObjectId, _m: ObjectId) => null as any) as AnyMock,
  createPin: mock(async (input: any) => ({
    ...input,
    _id: new ObjectId(),
    pinnedAt: new Date(),
  })) as AnyMock,
  removePin: mock(async (_c: ObjectId, _m: ObjectId) => true) as AnyMock,
  findByChannel: mock(async (_c: ObjectId, _l: number, _cur?: unknown) => [] as any[]) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space.repository', () => ({
  getSpaceRepository: () => spaceRepo,
}));
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
mock.module('../../repositories/space-pin.repository', () => ({
  getSpacePinRepository: () => pinRepo,
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

import { pinSpaceMessage, unpinSpaceMessage, getSpacePinnedMessages } from './pins';

const SPACE = new ObjectId();
const CHANNEL = new ObjectId();
const MESSAGE = new ObjectId();
const EVERYONE_ROLE = new ObjectId();
const MOD_ROLE = new ObjectId();
const OWNER = new ObjectId();

function makeSpaceDoc() {
  const now = new Date();
  return {
    _id: SPACE,
    slug: 'a-space',
    name: 'A Space',
    visibility: 'public',
    e2ee: false,
    encryptIdentity: false,
    cipherRequired: false,
    createdBy: OWNER,
    ownerIdentityId: OWNER,
    allowFreeMembers: false,
    memberCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function seedRoles() {
  roleRepo.findBySpace.mockResolvedValue([
    {
      _id: MOD_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages', 'pinMessages'],
      position: 100,
      isDefaultMember: false,
      isSystem: false,
    },
    {
      _id: EVERYONE_ROLE,
      spaceId: SPACE,
      permissions: ['viewChannels', 'sendMessages', 'pinMessages'],
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'everyone',
    },
  ]);
}

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

describe('space/pins', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [spaceRepo, memberRepo, roleRepo, channelRepo, messageRepo, pinRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(makeSpaceDoc());
    memberRepo.findMember.mockResolvedValue(null);
    memberRepo.listByAnyRole.mockResolvedValue([]);
    channelRepo.findByIdInSpace.mockResolvedValue(null);
    messageRepo.findByIdInChannel.mockResolvedValue(null);
    messageRepo.findByIds.mockResolvedValue([]);
    pinRepo.findPin.mockResolvedValue(null);
    pinRepo.findByChannel.mockResolvedValue([]);
    pinRepo.removePin.mockResolvedValue(true);
    publishSpaceEvent.mockClear();
    seedRoles();
  });

  describe('pinSpaceMessage (channel ACL)', () => {
    test('hides a restricted channel from a moderator without the channel role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();

      const r = await pinSpaceMessage(SPACE, CHANNEL, MESSAGE, caller);
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(pinRepo.createPin).not.toHaveBeenCalled();
      expect(publishSpaceEvent).not.toHaveBeenCalled();
    });

    test('pins and scopes the publish audience on a restricted channel', async () => {
      const caller = new ObjectId();
      grantMember(caller, [MOD_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });
      seedMessage();
      memberRepo.listByAnyRole.mockResolvedValue([
        { _id: new ObjectId(), spaceId: SPACE, identityId: caller, roleIds: [MOD_ROLE], status: 'active' },
      ]);

      const r = await pinSpaceMessage(SPACE, CHANNEL, MESSAGE, caller);
      expect(r.success).toBe(true);
      const [, event, options] = publishSpaceEvent.mock.calls[0]!;
      expect(event.type).toBe('space_pins_updated');
      expect(options.audienceIdentityIds).toEqual([caller.toHexString()]);
    });

    test('rejects without pinMessages permission', async () => {
      const caller = new ObjectId();
      const roleId = new ObjectId();
      memberRepo.findMember.mockResolvedValue({
        _id: new ObjectId(),
        spaceId: SPACE,
        identityId: caller,
        roleIds: [roleId],
        status: 'active',
        joinedAt: new Date(),
      });
      roleRepo.findBySpace.mockResolvedValue([
        { _id: roleId, spaceId: SPACE, permissions: ['viewChannels'], position: 1000, isDefaultMember: true },
      ]);
      seedChannel();

      const r = await pinSpaceMessage(SPACE, CHANNEL, MESSAGE, caller);
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });
  });

  describe('unpinSpaceMessage (channel ACL)', () => {
    test('hides a restricted channel from a moderator without the channel role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });

      const r = await unpinSpaceMessage(SPACE, CHANNEL, MESSAGE, caller);
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(pinRepo.removePin).not.toHaveBeenCalled();
    });

    test('unpins on a viewable channel and publishes', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [EVERYONE_ROLE] });

      const r = await unpinSpaceMessage(SPACE, CHANNEL, MESSAGE, caller);
      expect(r.success).toBe(true);
      expect(publishSpaceEvent.mock.calls[0]![1].data.action).toBe('unpinned');
    });
  });

  describe('getSpacePinnedMessages (channel ACL)', () => {
    test('hides a restricted channel from a member without the role', async () => {
      const caller = new ObjectId();
      grantMember(caller, [EVERYONE_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });

      const r = await getSpacePinnedMessages(SPACE, CHANNEL, caller);
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
      expect(pinRepo.findByChannel).not.toHaveBeenCalled();
    });

    test('returns pins for a member who can view the channel', async () => {
      const caller = new ObjectId();
      grantMember(caller, [MOD_ROLE]);
      seedChannel({ allowedRoleIds: [MOD_ROLE] });

      const r = await getSpacePinnedMessages(SPACE, CHANNEL, caller);
      expect(r.success).toBe(true);
      expect(pinRepo.findByChannel).toHaveBeenCalledTimes(1);
    });
  });
});
