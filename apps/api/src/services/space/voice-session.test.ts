/**
 * Voice-channel session lifecycle tests (lazy LiveKit + 60s empty grace).
 */

import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

type AnyMock = ReturnType<typeof mock> & { mock: { calls: unknown[][]; clear: () => void } };

const spaceId = new ObjectId();
const channelId = new ObjectId();
const user1 = new ObjectId();
const user2 = new ObjectId();

const findByIdInSpace = mock(async () => ({
  _id: channelId,
  spaceId,
  type: 'voice',
  allowedRoleIds: [],
})) as AnyMock;

const findActiveForChannel = mock(async () => null) as AnyMock;
const createSession = mock(async (input: Record<string, unknown>) => ({
  _id: new ObjectId(),
  spaceId: input.spaceId,
  channelId: input.channelId,
  status: input.status ?? 'waiting',
  participants: input.participants ?? [],
  createdAt: new Date(),
  updatedAt: new Date(),
})) as AnyMock;
const addParticipant = mock(async () => null) as AnyMock;
const activateWithRoom = mock(async () => null) as AnyMock;
const updateParticipantLeft = mock(async () => null) as AnyMock;
const markEmpty = mock(async () => null) as AnyMock;
const endWaitingSession = mock(async () => null) as AnyMock;
const clearRoomAndEnd = mock(async () => null) as AnyMock;
const clearEmpty = mock(async () => null) as AnyMock;
const findAllNonEnded = mock(async () => []) as AnyMock;

mock.module('../../repositories/space-channel.repository', () => ({
  getSpaceChannelRepository: () => ({ findByIdInSpace }),
}));

mock.module('../../repositories/space-voice-session.repository', () => ({
  getSpaceVoiceSessionRepository: () => ({
    findActiveForChannel,
    createSession,
    addParticipant,
    activateWithRoom,
    updateParticipantLeft,
    markEmpty,
    endWaitingSession,
    clearRoomAndEnd,
    clearEmpty,
    findAllNonEnded,
    findActiveForSpace: mock(async () => []),
    updateParticipantMediaState: mock(async () => null),
  }),
}));

mock.module('../../repositories/space-role.repository', () => ({
  getSpaceRoleRepository: () => ({
    findBySpace: mock(async () => [
      {
        _id: new ObjectId(),
        isDefaultMember: true,
        systemKey: 'member',
      },
    ]),
  }),
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findById: mock(async () => ({ displayName: 'User', username: 'user' })),
  }),
}));

const publishSpaceEvent = mock(async () => {}) as AnyMock;
const publishSpaceEventToIdentity = mock(async () => {}) as AnyMock;
mock.module('./redis-events', () => ({
  publishSpaceEvent,
  publishSpaceEventToIdentity,
}));

mock.module('./permissions', () => ({
  resolveMemberPermissions: mock(async () => ({
    isMember: true,
    roleIds: [new ObjectId()],
    permissions: new Set([
      'connect',
      'speak',
      'video',
      'stream',
      'viewChannels',
    ]),
  })),
  memberHasPermission: (_perms: unknown, p: string) =>
    ['connect', 'speak', 'video', 'stream', 'viewChannels'].includes(p),
}));

mock.module('./channel-access', () => ({
  canViewSpaceChannel: () => true,
  findEveryoneRole: (roles: { isDefaultMember?: boolean }[]) =>
    roles.find((r) => r.isDefaultMember),
}));

const mintLiveKitToken = mock(async () => 'token') as AnyMock;
const generateRoomName = mock(() => 'room-abc') as AnyMock;
mock.module('../livekit-auth.service', () => ({
  mintLiveKitToken,
  generateRoomName,
}));

const livekitDeleteRoom = mock(async () => {}) as AnyMock;
mock.module('../livekit-room.service', () => ({
  deleteRoom: livekitDeleteRoom,
}));

mock.module('../../config', () => ({
  config: {
    livekit: { enabled: true, url: 'wss://livekit.test' },
  },
}));

const loggerStub = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
mock.module('../../utils/adieuuLogger', () => ({
  default: loggerStub,
  adieuuLogger: loggerStub,
}));

const {
  joinVoiceChannel,
  leaveVoiceChannel,
  reapEmptyVoiceSessions,
} = await import('./voice-session');

const access = { subscriptions: ['access'] as const, entitlements: [] as const };

describe('voice-session', () => {
  beforeEach(() => {
    findByIdInSpace.mockClear();
    findActiveForChannel.mockClear();
    createSession.mockClear();
    addParticipant.mockClear();
    activateWithRoom.mockClear();
    updateParticipantLeft.mockClear();
    markEmpty.mockClear();
    endWaitingSession.mockClear();
    clearRoomAndEnd.mockClear();
    findAllNonEnded.mockClear();
    publishSpaceEvent.mockClear();
    publishSpaceEventToIdentity.mockClear();
    mintLiveKitToken.mockClear();
    livekitDeleteRoom.mockClear();

    findActiveForChannel.mockResolvedValue(null);
    findByIdInSpace.mockResolvedValue({
      _id: channelId,
      spaceId,
      type: 'voice',
      allowedRoleIds: [],
    });
  });

  test('first joiner gets presence only (no LiveKit token)', async () => {
    const result = await joinVoiceChannel(
      spaceId.toHexString(),
      channelId.toHexString(),
      user1.toHexString(),
      access,
    );
    expect(result.success).toBe(true);
    expect(result.livekitToken).toBeUndefined();
    expect(createSession).toHaveBeenCalled();
    expect(activateWithRoom).not.toHaveBeenCalled();
  });

  test('second joiner activates room and notifies waiter', async () => {
    const sessionId = new ObjectId();
    const waiting = {
      _id: sessionId,
      spaceId,
      channelId,
      status: 'waiting' as const,
      participants: [
        {
          identityId: user1,
          joinedAt: new Date(),
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    findActiveForChannel.mockResolvedValue(waiting);

    const afterAdd = {
      ...waiting,
      participants: [
        ...waiting.participants,
        {
          identityId: user2,
          joinedAt: new Date(),
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
    };
    addParticipant.mockResolvedValue(afterAdd);

    const active = {
      ...afterAdd,
      status: 'active' as const,
      roomName: 'room-abc',
      startedAt: new Date(),
    };
    activateWithRoom.mockResolvedValue(active);

    const result = await joinVoiceChannel(
      spaceId.toHexString(),
      channelId.toHexString(),
      user2.toHexString(),
      access,
    );

    expect(result.success).toBe(true);
    expect(result.livekitToken).toBe('token');
    expect(activateWithRoom).toHaveBeenCalled();
    expect(publishSpaceEventToIdentity).toHaveBeenCalled();
    const notifyType = (publishSpaceEventToIdentity.mock.calls[0] as unknown[])?.[1] as {
      type: string;
    };
    expect(notifyType.type).toBe('voice_channel_call_started');
  });

  test('leave to empty with room sets emptyAt (no immediate delete)', async () => {
    const sessionId = new ObjectId();
    const session = {
      _id: sessionId,
      spaceId,
      channelId,
      status: 'active' as const,
      roomName: 'room-abc',
      participants: [
        {
          identityId: user1,
          joinedAt: new Date(),
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    findActiveForChannel.mockResolvedValue(session);
    const afterLeave = {
      ...session,
      participants: [{ ...session.participants[0]!, leftAt: new Date() }],
    };
    updateParticipantLeft.mockResolvedValue(afterLeave);
    const emptied = { ...afterLeave, emptyAt: new Date() };
    markEmpty.mockResolvedValue(emptied);

    const result = await leaveVoiceChannel(
      spaceId.toHexString(),
      channelId.toHexString(),
      user1.toHexString(),
    );
    expect(result.success).toBe(true);
    expect(markEmpty).toHaveBeenCalled();
    expect(livekitDeleteRoom).not.toHaveBeenCalled();
  });

  test('reaper tears down rooms empty longer than 60s', async () => {
    const sessionId = new ObjectId();
    const emptyAt = new Date(Date.now() - 61_000);
    findAllNonEnded.mockResolvedValue([
      {
        _id: sessionId,
        spaceId,
        channelId,
        status: 'active',
        roomName: 'room-old',
        emptyAt,
        participants: [
          {
            identityId: user1,
            joinedAt: new Date(),
            leftAt: new Date(),
            mediaState: { audio: true, video: false, screenshare: false },
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    clearRoomAndEnd.mockResolvedValue({
      _id: sessionId,
      spaceId,
      channelId,
      status: 'ended',
      participants: [],
      endedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await reapEmptyVoiceSessions();
    expect(clearRoomAndEnd).toHaveBeenCalled();
    expect(livekitDeleteRoom).toHaveBeenCalledWith('room-old');
  });

  test('rejects non-voice channels', async () => {
    findByIdInSpace.mockResolvedValue({
      _id: channelId,
      spaceId,
      type: 'text',
      allowedRoleIds: [],
    });
    const result = await joinVoiceChannel(
      spaceId.toHexString(),
      channelId.toHexString(),
      user1.toHexString(),
      access,
    );
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_VOICE_CHANNEL');
  });
});
