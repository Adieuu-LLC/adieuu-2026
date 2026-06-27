import { describe, expect, test } from 'bun:test';
import type { ChatIncomingMessage } from '@adieuu/shared';
import {
  applyCallSocketMessage,
  isIdentityInCall,
  parseRetryAfterSeconds,
  type CallHookState,
} from './callStateUpdates';
import type { PublicCall } from '../services/callService';

const CONV = '507f1f77bcf86cd799439011';
const CALL = '507f1f77bcf86cd799439012';
const ID_A = '64a1b2c3d4e5f60718293a4b';
const ID_B = '64a1b2c3d4e5f60718293a4c';

function baseCall(overrides: Partial<PublicCall> = {}): PublicCall {
  return {
    id: CALL,
    conversationId: CONV,
    initiatorIdentityId: ID_A,
    status: 'active',
    allowedMedia: { audio: true, video: false, screenshare: false },
    participants: [
      {
        identityId: ID_A,
        joinedAt: '2026-05-29T12:00:00.000Z',
        mediaState: { audio: true, video: false, screenshare: false },
      },
    ],
    roomName: 'room-abc',
    createdAt: '2026-05-29T12:00:00.000Z',
    updatedAt: '2026-05-29T12:00:00.000Z',
    ...overrides,
  };
}

function emptyState(): CallHookState {
  return { activeCall: null, loading: true };
}

describe('applyCallSocketMessage', () => {
  test('call_initiated ignores other conversations', () => {
    const msg = {
      type: 'call_initiated',
      data: {
        call: {
          id: CALL,
          conversationId: 'other-conv',
          initiatorIdentityId: ID_A,
          status: 'ringing',
          allowedMedia: { audio: true, video: false, screenshare: false },
          roomName: 'room',
          createdAt: '2026-05-29T12:00:00.000Z',
        },
      },
    } as ChatIncomingMessage;

    expect(applyCallSocketMessage(emptyState(), msg, CONV)).toBeNull();
  });

  test('call_initiated preserves participants for same call id', () => {
    const prev: CallHookState = {
      activeCall: baseCall(),
      loading: false,
    };
    const msg = {
      type: 'call_initiated',
      data: {
        call: {
          id: CALL,
          conversationId: CONV,
          initiatorIdentityId: ID_A,
          status: 'ringing',
          allowedMedia: { audio: true, video: false, screenshare: false },
          roomName: 'room',
          createdAt: '2026-05-29T12:00:00.000Z',
        },
      },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(prev, msg, CONV);
    expect(next?.activeCall?.participants).toHaveLength(1);
    expect(next?.activeCall?.participants[0]?.identityId).toBe(ID_A);
  });

  test('call_initiated starts with empty participants for new call without payload participants', () => {
    const msg = {
      type: 'call_initiated',
      data: {
        call: {
          id: CALL,
          conversationId: CONV,
          initiatorIdentityId: ID_A,
          status: 'ringing',
          allowedMedia: { audio: true, video: false, screenshare: false },
          roomName: 'room',
          createdAt: '2026-05-29T12:00:00.000Z',
        },
      },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(emptyState(), msg, CONV);
    expect(next?.activeCall?.participants).toEqual([]);
    expect(next?.loading).toBe(false);
  });

  test('call_initiated uses participants from event payload', () => {
    const participants = [
      {
        identityId: ID_A,
        joinedAt: '2026-05-29T12:00:00.000Z',
        mediaState: { audio: true, video: false, screenshare: false },
      },
    ];
    const msg = {
      type: 'call_initiated',
      data: {
        call: {
          id: CALL,
          conversationId: CONV,
          initiatorIdentityId: ID_A,
          status: 'active',
          allowedMedia: { audio: true, video: false, screenshare: false },
          participants,
          roomName: 'room',
          createdAt: '2026-05-29T12:00:00.000Z',
        },
      },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(emptyState(), msg, CONV);
    expect(next?.activeCall?.participants).toHaveLength(1);
    expect(next?.activeCall?.participants[0]?.identityId).toBe(ID_A);
    expect(next?.activeCall?.participants[0]?.mediaState).toEqual({
      audio: true,
      video: false,
      screenshare: false,
    });
  });

  test('call_participant_joined appends participant', () => {
    const prev: CallHookState = { activeCall: baseCall(), loading: false };
    const msg = {
      type: 'call_participant_joined',
      data: {
        callId: CALL,
        identityId: ID_B,
        mediaState: { audio: true, video: false, screenshare: false },
      },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(prev, msg, CONV);
    expect(next?.activeCall?.participants).toHaveLength(2);
    expect(next?.activeCall?.participants[1]?.identityId).toBe(ID_B);
  });

  test('call_participant_joined ignores duplicate active participant', () => {
    const prev: CallHookState = { activeCall: baseCall(), loading: false };
    const msg = {
      type: 'call_participant_joined',
      data: {
        callId: CALL,
        identityId: ID_A,
        mediaState: { audio: true, video: false, screenshare: false },
      },
    } as ChatIncomingMessage;

    expect(applyCallSocketMessage(prev, msg, CONV)).toBeNull();
  });

  test('call_participant_left marks participant left', () => {
    const prev: CallHookState = { activeCall: baseCall(), loading: false };
    const msg = {
      type: 'call_participant_left',
      data: { callId: CALL, identityId: ID_A },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(prev, msg, CONV);
    expect(next?.activeCall?.participants[0]?.leftAt).toBeDefined();
  });

  test('call_ended clears active call', () => {
    const prev: CallHookState = { activeCall: baseCall(), loading: false };
    const msg = {
      type: 'call_ended',
      data: { callId: CALL, endedBy: ID_A },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(prev, msg, CONV);
    expect(next).toEqual({ activeCall: null, loading: false });
  });

  test('call_media_state_changed updates active participant media', () => {
    const prev: CallHookState = { activeCall: baseCall(), loading: false };
    const msg = {
      type: 'call_media_state_changed',
      data: {
        callId: CALL,
        identityId: ID_A,
        mediaState: { audio: false, video: true, screenshare: false },
      },
    } as ChatIncomingMessage;

    const next = applyCallSocketMessage(prev, msg, CONV);
    expect(next?.activeCall?.participants[0]?.mediaState).toEqual({
      audio: false,
      video: true,
      screenshare: false,
    });
  });
});

describe('isIdentityInCall', () => {
  test('returns true for active participant', () => {
    expect(isIdentityInCall(baseCall(), ID_A)).toBe(true);
  });

  test('returns false when participant has left', () => {
    const call = baseCall({
      participants: [
        {
          identityId: ID_A,
          joinedAt: '2026-05-29T12:00:00.000Z',
          leftAt: '2026-05-29T12:05:00.000Z',
          mediaState: { audio: true, video: false, screenshare: false },
        },
      ],
    });
    expect(isIdentityInCall(call, ID_A)).toBe(false);
  });
});

describe('parseRetryAfterSeconds', () => {
  test('parses numeric string retryAfter', () => {
    expect(parseRetryAfterSeconds({ retryAfter: '42' })).toBe(42);
  });

  test('returns undefined for invalid retryAfter', () => {
    expect(parseRetryAfterSeconds({ retryAfter: 'nope' })).toBeUndefined();
  });
});
