/**
 * Unit tests for the Space channels + messaging service (mocked repositories).
 *
 * @module services/space/channels.test
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
};

const roleRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
};

const channelRepo = {
  findBySpace: mock(async (_s: ObjectId) => [] as any[]) as AnyMock,
  findByIdInSpace: mock(async (_s: ObjectId, _c: ObjectId) => null as any) as AnyMock,
};

const messageRepo = {
  createMessage: mock(async (input: any) => ({ ...input, _id: new ObjectId(), createdAt: new Date() })) as AnyMock,
  findByClientMessageId: mock(async (_c: ObjectId, _id: string) => null as any) as AnyMock,
  findByChannel: mock(async (_c: ObjectId, _l?: number, _cur?: ObjectId, _d?: string) => [] as any[]) as AnyMock,
  findByIdInChannel: mock(async (_c: ObjectId, _m: ObjectId) => null as any) as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../../repositories/space.repository', () => ({ getSpaceRepository: () => spaceRepo }));
mock.module('../../repositories/space-member.repository', () => ({ getSpaceMemberRepository: () => memberRepo }));
mock.module('../../repositories/space-role.repository', () => ({ getSpaceRoleRepository: () => roleRepo }));
mock.module('../../repositories/space-channel.repository', () => ({ getSpaceChannelRepository: () => channelRepo }));
mock.module('../../repositories/space-message.repository', () => ({ getSpaceMessageRepository: () => messageRepo }));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity: mock(async () => {}),
}));

const createNotificationMock = mock(async () => ({ success: true })) as AnyMock;
mock.module('../notification.service', () => ({
  createNotification: createNotificationMock,
}));

import { listSpaceChannels, sendSpaceMessage, getSpaceMessages } from './channels';

const OWNER = new ObjectId();

function makeSpaceDoc(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(), slug: 'a-space', name: 'A Space', visibility: 'public',
    createdBy: OWNER, ownerIdentityId: OWNER, allowFreeMembers: false, memberCount: 1,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

function makeChannelDoc(spaceId: ObjectId, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: new ObjectId(), spaceId, type: 'text', name: 'general', position: 0,
    createdAt: now, updatedAt: now, ...overrides,
  };
}

/** Marks the actor as an active member holding `permissions`. */
function grantPermissions(spaceId: ObjectId, actorId: ObjectId, permissions: string[]) {
  const roleId = new ObjectId();
  memberRepo.findMember.mockImplementation(async (_s: ObjectId, id: ObjectId) =>
    id.equals(actorId)
      ? { _id: new ObjectId(), spaceId, identityId: actorId, roleIds: [roleId], status: 'active', joinedAt: new Date() }
      : null,
  );
  roleRepo.findBySpace.mockResolvedValue([{ _id: roleId, spaceId, permissions }]);
}

const CIPHER_CHECK = { knownValue: 'kv', encryptedKnownValue: 'ct', nonce: 'n' };

describe('space/channels', () => {
  afterAll(() => mock.restore());

  beforeEach(() => {
    for (const repo of [spaceRepo, memberRepo, roleRepo, channelRepo, messageRepo]) {
      for (const fn of Object.values(repo)) (fn as AnyMock).mockClear();
    }
    spaceRepo.findById.mockResolvedValue(null);
    memberRepo.findMember.mockResolvedValue(null);
    roleRepo.findBySpace.mockResolvedValue([]);
    channelRepo.findBySpace.mockResolvedValue([]);
    channelRepo.findByIdInSpace.mockResolvedValue(null);
    messageRepo.findByClientMessageId.mockResolvedValue(null);
    messageRepo.findByChannel.mockResolvedValue([]);
    messageRepo.findByIdInChannel.mockResolvedValue(null);
    publishSpaceEvent.mockClear();
    createNotificationMock.mockClear();
  });

  describe('listSpaceChannels', () => {
    test('lets anyone list a public space', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      channelRepo.findBySpace.mockResolvedValue([makeChannelDoc(space._id)]);
      const r = await listSpaceChannels(space._id, new ObjectId());
      expect(r.success).toBe(true);
      expect(r.channels).toHaveLength(1);
      expect(memberRepo.findMember).not.toHaveBeenCalled();
    });

    test('requires membership for a listed space', async () => {
      const space = makeSpaceDoc({ visibility: 'listed' });
      spaceRepo.findById.mockResolvedValue(space);
      const r = await listSpaceChannels(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('hides a hidden space from non-members', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      const r = await listSpaceChannels(space._id, new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });
  });

  describe('sendSpaceMessage', () => {
    test('rejects empty content', async () => {
      const r = await sendSpaceMessage(new ObjectId(), new ObjectId(), new ObjectId(), { content: '   ', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
    });

    test('rejects over-long content', async () => {
      const r = await sendSpaceMessage(new ObjectId(), new ObjectId(), new ObjectId(), { content: 'x'.repeat(4001), clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'INVALID_CONTENT' });
    });

    test('rejects a non-member sender', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      memberRepo.findMember.mockResolvedValue(null);
      const r = await sendSpaceMessage(space._id, new ObjectId(), new ObjectId(), { content: 'hi', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'NOT_MEMBER' });
    });

    test('rejects a sender without post permission', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['read']);
      const r = await sendSpaceMessage(space._id, new ObjectId(), sender, { content: 'hi', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'FORBIDDEN' });
    });

    test('returns CHANNEL_NOT_FOUND for an unknown channel', async () => {
      const space = makeSpaceDoc();
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['post']);
      channelRepo.findByIdInSpace.mockResolvedValue(null);
      const r = await sendSpaceMessage(space._id, new ObjectId(), sender, { content: 'hi', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
    });

    test('rejects sending to an E2EE space (space cipher challenge)', async () => {
      const space = makeSpaceDoc({ visibility: 'listed', cipherCheck: CIPHER_CHECK });
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['post']);
      channelRepo.findByIdInSpace.mockResolvedValue(makeChannelDoc(space._id));
      const r = await sendSpaceMessage(space._id, new ObjectId(), sender, { content: 'hi', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'ENCRYPTION_NOT_SUPPORTED' });
      expect(messageRepo.createMessage).not.toHaveBeenCalled();
    });

    test('rejects sending to an E2EE channel (channel cipher challenge)', async () => {
      const space = makeSpaceDoc({ visibility: 'listed' });
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['post']);
      channelRepo.findByIdInSpace.mockResolvedValue(makeChannelDoc(space._id, { cipherCheck: CIPHER_CHECK }));
      const r = await sendSpaceMessage(space._id, new ObjectId(), sender, { content: 'hi', clientMessageId: 'c1' });
      expect(r).toMatchObject({ success: false, errorCode: 'ENCRYPTION_NOT_SUPPORTED' });
    });

    test('sends a plaintext message to a non-encrypted channel', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['post']);
      const channel = makeChannelDoc(space._id);
      channelRepo.findByIdInSpace.mockResolvedValue(channel);
      const r = await sendSpaceMessage(space._id, channel._id, sender, { content: '  hi there  ', clientMessageId: 'c1' });
      expect(r.success).toBe(true);
      expect(r.message?.content).toBe('hi there'); // trimmed
      const [input] = messageRepo.createMessage.mock.calls[0]!;
      expect(input).toMatchObject({ content: 'hi there', clientMessageId: 'c1' });
      // Fans the new message out on the Space channel.
      expect(publishSpaceEvent).toHaveBeenCalledTimes(1);
      const [chanSpaceId, event] = publishSpaceEvent.mock.calls[0]!;
      expect(chanSpaceId).toBe(space._id.toHexString());
      expect(event.type).toBe('space_message');
    });

    test('is idempotent on clientMessageId', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const sender = new ObjectId();
      grantPermissions(space._id, sender, ['post']);
      const channel = makeChannelDoc(space._id);
      channelRepo.findByIdInSpace.mockResolvedValue(channel);
      messageRepo.findByClientMessageId.mockResolvedValue({
        _id: new ObjectId(), spaceId: space._id, channelId: channel._id, fromIdentityId: sender,
        content: 'hi', clientMessageId: 'c1', createdAt: new Date(),
      });
      const r = await sendSpaceMessage(space._id, channel._id, sender, { content: 'hi', clientMessageId: 'c1' });
      expect(r.success).toBe(true);
      expect(messageRepo.createMessage).not.toHaveBeenCalled();
      // No fan-out for an idempotent replay.
      expect(publishSpaceEvent).not.toHaveBeenCalled();
    });
  });

  describe('getSpaceMessages', () => {
    test('lets anyone read a public space channel', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const channel = makeChannelDoc(space._id);
      channelRepo.findByIdInSpace.mockResolvedValue(channel);
      messageRepo.findByChannel.mockResolvedValue([
        { _id: new ObjectId(), spaceId: space._id, channelId: channel._id, fromIdentityId: OWNER, content: 'hi', clientMessageId: 'c1', createdAt: new Date() },
      ]);
      const r = await getSpaceMessages(space._id, channel._id, new ObjectId());
      expect(r.success).toBe(true);
      expect(r.messages).toHaveLength(1);
    });

    test('requires membership for a hidden space', async () => {
      const space = makeSpaceDoc({ visibility: 'hidden' });
      spaceRepo.findById.mockResolvedValue(space);
      const r = await getSpaceMessages(space._id, new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'SPACE_NOT_FOUND' });
    });

    test('returns CHANNEL_NOT_FOUND for an unknown channel', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      channelRepo.findByIdInSpace.mockResolvedValue(null);
      const r = await getSpaceMessages(space._id, new ObjectId(), new ObjectId());
      expect(r).toMatchObject({ success: false, errorCode: 'CHANNEL_NOT_FOUND' });
    });

    test('paginates with a cursor', async () => {
      const space = makeSpaceDoc({ visibility: 'public' });
      spaceRepo.findById.mockResolvedValue(space);
      const channel = makeChannelDoc(space._id);
      channelRepo.findByIdInSpace.mockResolvedValue(channel);
      const docs = Array.from({ length: 3 }, () => ({
        _id: new ObjectId(), spaceId: space._id, channelId: channel._id, fromIdentityId: OWNER, content: 'm', clientMessageId: crypto.randomUUID(), createdAt: new Date(),
      }));
      messageRepo.findByChannel.mockResolvedValue(docs);
      const r = await getSpaceMessages(space._id, channel._id, new ObjectId(), 2);
      expect(r.messages).toHaveLength(2);
      expect(r.cursor).toBe(docs[1]!._id.toHexString());
    });
  });
});
