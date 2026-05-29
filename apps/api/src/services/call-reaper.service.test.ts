import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockPublishConversationEvent = mock(() => Promise.resolve());

const mockCallRepo = {
  findAllActive: mock(() => Promise.resolve([])) as AnyMock,
  updateStatus: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockConversationRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockConfig = {
  callReaper: {
    intervalSec: 60,
    emptyTimeoutSec: 120,
    maxCallDurationSec: 24 * 60 * 60,
  },
};

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('../repositories/call.repository', () => ({
  getCallRepository: () => mockCallRepo,
}));

mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => mockConversationRepo,
}));

mock.module('./conversation/redis-events', () => ({
  publishConversationEvent: mockPublishConversationEvent,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { reapStaleCalls } from './call-reaper.service';

const identityA = new ObjectId('64a1b2c3d4e5f60718293a4b');
const identityB = new ObjectId('64a1b2c3d4e5f60718293a4c');
const convId = new ObjectId('507f1f77bcf86cd799439011');
const callId = new ObjectId('507f1f77bcf86cd799439012');

function makeCall(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    _id: callId,
    conversationId: convId,
    initiatorIdentityId: identityA,
    status: 'active',
    allowedMedia: { audio: true, video: false, screenshare: false },
    participants: [
      {
        identityId: identityA,
        joinedAt: now,
        mediaState: { audio: true, video: false, screenshare: false },
      },
    ],
    jitsiRoomName: 'room-abc',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('call-reaper.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockCallRepo.findAllActive.mockClear();
    mockCallRepo.updateStatus.mockClear();
    mockConversationRepo.findById.mockClear();
    mockPublishConversationEvent.mockClear();
    mockConfig.callReaper.emptyTimeoutSec = 120;
    mockConfig.callReaper.maxCallDurationSec = 24 * 60 * 60;
  });

  test('reaps calls with no active participants and old updatedAt', async () => {
    const oldDate = new Date(Date.now() - 200_000);
    const call = makeCall({
      participants: [
        { identityId: identityA, joinedAt: oldDate, leftAt: oldDate, mediaState: { audio: true, video: false, screenshare: false } },
      ],
      updatedAt: oldDate,
      createdAt: oldDate,
    });

    mockCallRepo.findAllActive.mockImplementation(() => Promise.resolve([call]));
    mockCallRepo.updateStatus.mockImplementation(() =>
      Promise.resolve({ ...call, status: 'ended', endedAt: new Date() }),
    );
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve({ _id: convId, participants: [identityA, identityB] }),
    );

    await reapStaleCalls();

    expect(mockCallRepo.updateStatus).toHaveBeenCalledWith(
      callId,
      'ended',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
    expect(mockPublishConversationEvent).toHaveBeenCalled();
  });

  test('does not reap calls within the timeout window', async () => {
    const recentDate = new Date();
    const call = makeCall({
      participants: [
        { identityId: identityA, joinedAt: recentDate, leftAt: recentDate, mediaState: { audio: true, video: false, screenshare: false } },
      ],
      updatedAt: recentDate,
      createdAt: recentDate,
    });

    mockCallRepo.findAllActive.mockImplementation(() => Promise.resolve([call]));

    await reapStaleCalls();

    expect(mockCallRepo.updateStatus).not.toHaveBeenCalled();
  });

  test('reaps calls older than the hard ceiling regardless of participants', async () => {
    const veryOldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const call = makeCall({
      participants: [
        { identityId: identityA, joinedAt: veryOldDate, mediaState: { audio: true, video: false, screenshare: false } },
      ],
      updatedAt: new Date(),
      createdAt: veryOldDate,
    });

    mockCallRepo.findAllActive.mockImplementation(() => Promise.resolve([call]));
    mockCallRepo.updateStatus.mockImplementation(() =>
      Promise.resolve({ ...call, status: 'ended', endedAt: new Date() }),
    );
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve({ _id: convId, participants: [identityA, identityB] }),
    );

    await reapStaleCalls();

    expect(mockCallRepo.updateStatus).toHaveBeenCalledWith(
      callId,
      'ended',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
  });

  test('publishes call_ended event to all conversation participants', async () => {
    const oldDate = new Date(Date.now() - 200_000);
    const call = makeCall({
      participants: [],
      updatedAt: oldDate,
      createdAt: oldDate,
    });

    mockCallRepo.findAllActive.mockImplementation(() => Promise.resolve([call]));
    mockCallRepo.updateStatus.mockImplementation(() =>
      Promise.resolve({ ...call, status: 'ended', endedAt: new Date() }),
    );
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve({ _id: convId, participants: [identityA, identityB] }),
    );

    await reapStaleCalls();

    expect(mockPublishConversationEvent).toHaveBeenCalledTimes(2);
    expect(mockPublishConversationEvent).toHaveBeenCalledWith(
      identityA.toHexString(),
      expect.objectContaining({ type: 'call_ended' }),
    );
    expect(mockPublishConversationEvent).toHaveBeenCalledWith(
      identityB.toHexString(),
      expect.objectContaining({ type: 'call_ended' }),
    );
  });

  test('ignores already-ended calls (findAllActive returns none)', async () => {
    mockCallRepo.findAllActive.mockImplementation(() => Promise.resolve([]));

    await reapStaleCalls();

    expect(mockCallRepo.updateStatus).not.toHaveBeenCalled();
    expect(mockPublishConversationEvent).not.toHaveBeenCalled();
  });
});
