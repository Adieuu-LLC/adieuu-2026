/**
 * @module services/call.service.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockCheckRateLimit = mock(() =>
  Promise.resolve({ allowed: true, remaining: 4, resetAt: 9999999999, limit: 5 }),
);
const mockGetCallInitiateConfig = mock(() =>
  Promise.resolve({ limit: 5, windowSeconds: 300 }),
);
const mockMintJitsiToken = mock(() => 'jwt-token');
const mockGenerateJitsiRoomName = mock(() => 'room-abc');
const mockPublishToParticipants = mock(() => Promise.resolve());
const mockPublishConversationEvent = mock(() => Promise.resolve());
const mockCreateNotification = mock(() => Promise.resolve());

const mockCallRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findActiveForConversation: mock(() => Promise.resolve(null)) as AnyMock,
  createCall: mock(() => Promise.resolve(null)) as AnyMock,
  addParticipant: mock(() => Promise.resolve(null)) as AnyMock,
  updateParticipantLeft: mock(() => Promise.resolve(null)) as AnyMock,
  updateParticipantMediaState: mock(() => Promise.resolve(null)) as AnyMock,
  updateStatus: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockConversationRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockIdentityRepo = {
  findById: mock(() => Promise.resolve({ ident: 'alice' })) as AnyMock,
};

const mockConfig = {
  jitsi: { enabled: false },
  rateLimit: { enabled: true },
};

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
  getCallInitiateConfig: mockGetCallInitiateConfig,
}));

mock.module('./jitsi-auth.service', () => ({
  mintJitsiToken: mockMintJitsiToken,
  generateJitsiRoomName: mockGenerateJitsiRoomName,
}));

mock.module('../repositories/call.repository', () => ({
  getCallRepository: () => mockCallRepo,
}));

mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => mockConversationRepo,
}));

mock.module('../repositories/identity.repository', () => ({
  getIdentityRepository: () => mockIdentityRepo,
}));

mock.module('./conversation/redis-events', () => ({
  publishToParticipants: mockPublishToParticipants,
  publishConversationEvent: mockPublishConversationEvent,
}));

mock.module('./notification.service', () => ({
  createNotification: mockCreateNotification,
}));

mock.module('../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import { initiateCall, joinCall, endCall } from './call.service';

const identityA = new ObjectId('64a1b2c3d4e5f60718293a4b');
const identityB = new ObjectId('64a1b2c3d4e5f60718293a4c');
const convId = new ObjectId('507f1f77bcf86cd799439011');
const callId = new ObjectId('507f1f77bcf86cd799439012');
const now = new Date('2026-05-29T12:00:00.000Z');

function makeConversation(participants: ObjectId[] = [identityA, identityB]) {
  return {
    _id: convId,
    participants,
    audioCallsDisabled: false,
    videoCallsDisabled: false,
    screenshareDisabled: false,
  };
}

function makeCall(overrides: Record<string, unknown> = {}) {
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

describe('call.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConfig.jitsi.enabled = false;
    mockCheckRateLimit.mockClear();
    mockGetCallInitiateConfig.mockClear();
    mockMintJitsiToken.mockClear();
    mockCallRepo.findById.mockClear();
    mockCallRepo.createCall.mockClear();
    mockConversationRepo.findById.mockClear();
    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({ allowed: true, remaining: 4, resetAt: 9999999999, limit: 5 }),
    );
    mockMintJitsiToken.mockImplementation(() => 'jwt-token');
  });

  test('initiateCall returns RATE_LIMITED when checkRateLimit denies', async () => {
    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({ allowed: false, remaining: 0, resetAt: 2000000000, limit: 5 }),
    );
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('RATE_LIMITED');
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(mockCallRepo.createCall).not.toHaveBeenCalled();
  });

  test('joinCall returns CALL_NOT_FOUND when conversation id mismatches', async () => {
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(makeCall()));
    const otherConv = '507f1f77bcf86cd799439099';
    const r = await joinCall(otherConv, callId.toHexString(), identityB.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('CALL_NOT_FOUND');
    expect(mockCallRepo.addParticipant).not.toHaveBeenCalled();
  });

  test('endCall returns NOT_IN_CALL when requester is not an active participant', async () => {
    mockCallRepo.findById.mockImplementation(() =>
      Promise.resolve(
        makeCall({
          participants: [
            {
              identityId: identityA,
              joinedAt: now,
              mediaState: { audio: true, video: false, screenshare: false },
            },
          ],
        }),
      ),
    );
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    const r = await endCall(convId.toHexString(), callId.toHexString(), identityB.toHexString());
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_IN_CALL');
    expect(mockCallRepo.updateStatus).not.toHaveBeenCalled();
  });

  test('initiateCall returns JITSI_UNAVAILABLE when mint fails and jitsi enabled', async () => {
    mockConfig.jitsi.enabled = true;
    mockMintJitsiToken.mockImplementation(() => {
      throw new Error('mint failed');
    });
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('JITSI_UNAVAILABLE');
    expect(mockCallRepo.createCall).not.toHaveBeenCalled();
  });

  test('endCall succeeds for active participant', async () => {
    const activeCall = makeCall();
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(activeCall));
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.updateStatus.mockImplementation(() =>
      Promise.resolve({ ...activeCall, status: 'ended', endedAt: now }),
    );
    const r = await endCall(convId.toHexString(), callId.toHexString(), identityA.toHexString());
    expect(r.success).toBe(true);
    expect(mockCallRepo.updateStatus).toHaveBeenCalled();
  });
});
