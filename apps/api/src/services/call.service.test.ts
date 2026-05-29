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
  jitsi: {
    enabled: false,
    baseUrl: 'https://jitsi.test.example',
    jwtIssuer: 'adieuu-test',
    jwtSecret: 'test-jitsi-secret-key',
    jwtExpirationSec: 300,
  },
  rateLimit: { enabled: true },
};

mock.module('../config', () => ({
  config: mockConfig,
}));

mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
  getCallInitiateConfig: mockGetCallInitiateConfig,
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

import { initiateCall, joinCall, endCall, leaveCall, getActiveCall, updateMediaState } from './call.service';

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
    mockCreateNotification.mockClear();
    mockPublishToParticipants.mockClear();
    mockCallRepo.findById.mockClear();
    mockCallRepo.createCall.mockClear();
    mockCallRepo.addParticipant.mockClear();
    mockCallRepo.findActiveForConversation.mockClear();
    mockConversationRepo.findById.mockClear();
    mockCheckRateLimit.mockImplementation(() =>
      Promise.resolve({ allowed: true, remaining: 4, resetAt: 9999999999, limit: 5 }),
    );
    mockCreateNotification.mockImplementation(() => Promise.resolve());
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
    mockConfig.jitsi.baseUrl = 'not-a-valid-url';
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
    mockConfig.jitsi.baseUrl = 'https://jitsi.test.example';
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

  test('initiateCall succeeds and returns jitsiToken when enabled', async () => {
    mockConfig.jitsi.enabled = true;
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.createCall.mockImplementation(() => Promise.resolve(makeCall({ status: 'ringing', participants: [] })));
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(true);
    expect(r.jitsiToken?.split('.')).toHaveLength(3);
    expect(mockCreateNotification).toHaveBeenCalled();
  });

  test('initiateCall succeeds without jitsiToken when Jitsi disabled', async () => {
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.createCall.mockImplementation(() => Promise.resolve(makeCall({ status: 'ringing', participants: [] })));
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(true);
    expect(r.jitsiToken).toBeUndefined();
  });

  test('initiateCall returns NOT_PARTICIPANT for non-member', async () => {
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation([identityB])),
    );
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_PARTICIPANT');
  });

  test('initiateCall returns MEDIA_DISABLED when admin toggles block all media', async () => {
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve({
        ...makeConversation(),
        audioCallsDisabled: true,
        videoCallsDisabled: true,
        screenshareDisabled: true,
      }),
    );
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: true,
      screenshare: true,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('MEDIA_DISABLED');
  });

  test('initiateCall succeeds when notification fan-out fails', async () => {
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.createCall.mockImplementation(() => Promise.resolve(makeCall({ status: 'ringing', participants: [] })));
    mockCreateNotification.mockImplementation(() => Promise.reject(new Error('notify failed')));
    const r = await initiateCall(convId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(true);
    expect(r.call?.id).toBe(callId.toHexString());
  });

  test('joinCall returns ALREADY_IN_CALL for active participant', async () => {
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(makeCall()));
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    const r = await joinCall(convId.toHexString(), callId.toHexString(), identityA.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('ALREADY_IN_CALL');
    expect(mockCallRepo.addParticipant).not.toHaveBeenCalled();
  });

  test('joinCall succeeds and returns jitsiToken when enabled', async () => {
    mockConfig.jitsi.enabled = true;
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
    mockCallRepo.addParticipant.mockImplementation(() =>
      Promise.resolve(
        makeCall({
          participants: [
            {
              identityId: identityA,
              joinedAt: now,
              mediaState: { audio: true, video: false, screenshare: false },
            },
            {
              identityId: identityB,
              joinedAt: now,
              mediaState: { audio: true, video: false, screenshare: false },
            },
          ],
        }),
      ),
    );
    const r = await joinCall(convId.toHexString(), callId.toHexString(), identityB.toHexString(), {
      audio: true,
      video: false,
      screenshare: false,
    });
    expect(r.success).toBe(true);
    expect(r.jitsiToken?.split('.')).toHaveLength(3);
    expect(mockCallRepo.addParticipant).toHaveBeenCalled();
  });

  test('leaveCall ends call when last participant leaves', async () => {
    const soloCall = makeCall({
      participants: [
        {
          identityId: identityA,
          joinedAt: now,
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
    });
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(soloCall));
    mockCallRepo.updateParticipantLeft.mockImplementation(() =>
      Promise.resolve({
        ...soloCall,
        participants: [
          {
            identityId: identityA,
            joinedAt: now,
            leftAt: now,
            mediaState: { audio: true, video: false, screenshare: false },
          },
        ],
      }),
    );
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.updateStatus.mockImplementation(() =>
      Promise.resolve({ ...soloCall, status: 'ended', endedAt: now }),
    );
    const r = await leaveCall(convId.toHexString(), callId.toHexString(), identityA.toHexString());
    expect(r.success).toBe(true);
    expect(mockCallRepo.updateStatus).toHaveBeenCalledWith(
      callId,
      'ended',
      expect.objectContaining({ endedAt: expect.any(Date) }),
    );
  });

  test('getActiveCall returns active call for participant', async () => {
    const activeCall = makeCall();
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.findActiveForConversation.mockImplementation(() => Promise.resolve(activeCall));
    const r = await getActiveCall(convId.toHexString(), identityA.toHexString());
    expect(r.success).toBe(true);
    expect(r.call?.id).toBe(callId.toHexString());
  });

  test('updateMediaState returns NOT_IN_CALL when participant not active', async () => {
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(makeCall()));
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve(makeConversation()),
    );
    mockCallRepo.updateParticipantMediaState.mockImplementation(() => Promise.resolve(null));
    const r = await updateMediaState(
      convId.toHexString(),
      callId.toHexString(),
      identityB.toHexString(),
      { audio: false, video: false, screenshare: false },
    );
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe('NOT_IN_CALL');
  });

  test('updateMediaState enforces conversation media toggles', async () => {
    const activeCall = makeCall({
      participants: [
        {
          identityId: identityB,
          joinedAt: now,
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
    });
    mockCallRepo.findById.mockImplementation(() => Promise.resolve(activeCall));
    mockConversationRepo.findById.mockImplementation(() =>
      Promise.resolve({
        ...makeConversation(),
        videoCallsDisabled: true,
      }),
    );
    mockCallRepo.updateParticipantMediaState.mockImplementation((_id, _identity, media) =>
      Promise.resolve({
        ...activeCall,
        participants: [
          {
            identityId: identityB,
            joinedAt: now,
            mediaState: media,
          },
        ],
      }),
    );

    const r = await updateMediaState(
      convId.toHexString(),
      callId.toHexString(),
      identityB.toHexString(),
      { audio: true, video: true, screenshare: false },
    );

    expect(r.success).toBe(true);
    expect(mockCallRepo.updateParticipantMediaState).toHaveBeenCalledWith(
      callId,
      identityB,
      { audio: true, video: false, screenshare: false },
    );
    expect(r.call?.participants[0]?.mediaState.video).toBe(false);
  });
});
