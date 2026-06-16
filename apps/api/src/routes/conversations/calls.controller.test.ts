/**
 * @module routes/conversations/calls.controller.test
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RouteContext } from '../../router/types';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const VALID_CONV = '507f1f77bcf86cd799439011';
const VALID_CALL = '507f1f77bcf86cd799439012';
const INVALID_HEX_24 = 'gggggggggggggggggggggggg';

const mockInitiateCall = mock(() =>
  Promise.resolve({ success: true, call: { id: VALID_CALL }, livekitToken: 'tok' }),
);
const mockJoinCall = mock(() =>
  Promise.resolve({ success: true, call: { id: VALID_CALL }, livekitToken: 'tok' }),
);
const mockLeaveCall = mock(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
const mockEndCall = mock(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
const mockForceEndCall = mock(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
const mockGetActiveCall = mock(() => Promise.resolve({ success: true, call: null }));
const mockUpdateMediaState = mock(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
const mockUpdateCallSettings = mock(() =>
  Promise.resolve({ success: true, conversation: { id: VALID_CONV } }),
);
const mockEscalateCallInitiateThrottle = mock(() => Promise.resolve());

let initiateCallCtrl: typeof import('./calls.controller').initiateCallCtrl;
let joinCallCtrl: typeof import('./calls.controller').joinCallCtrl;
let leaveCallCtrl: typeof import('./calls.controller').leaveCallCtrl;
let endCallCtrl: typeof import('./calls.controller').endCallCtrl;
let forceEndCallCtrl: typeof import('./calls.controller').forceEndCallCtrl;
let getActiveCallCtrl: typeof import('./calls.controller').getActiveCallCtrl;
let updateMediaStateCtrl: typeof import('./calls.controller').updateMediaStateCtrl;
let updateCallSettingsCtrl: typeof import('./calls.controller').updateCallSettingsCtrl;

const MEDIA = { audio: true, video: false, screenshare: false };

function baseCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  const url = new URL('http://localhost/test');
  return {
    request: new Request(url.href),
    url,
    params: {},
    query: new URLSearchParams(),
    requestId: 'rid',
    locale: 'en',
    errors: {} as RouteContext['errors'],
    identitySession: null,
    ...overrides,
  } as RouteContext;
}

function authedCtx(overrides: Partial<RouteContext> = {}): RouteContext {
  return baseCtx({
    identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
    ...overrides,
  });
}

describe('calls.controller', () => {
  beforeAll(async () => {
    mock.module('../../services/call.service', () => ({
      initiateCall: mockInitiateCall,
      joinCall: mockJoinCall,
      leaveCall: mockLeaveCall,
      endCall: mockEndCall,
      forceEndCall: mockForceEndCall,
      getActiveCall: mockGetActiveCall,
      updateMediaState: mockUpdateMediaState,
    }));

    mock.module('../../services/conversation/group-settings', () => ({
      updateCallSettings: mockUpdateCallSettings,
    }));

    mock.module('../../services/rate-limit.service', () => ({
      escalateCallInitiateThrottle: mockEscalateCallInitiateThrottle,
    }));

    ({
      initiateCallCtrl,
      joinCallCtrl,
      leaveCallCtrl,
      endCallCtrl,
      forceEndCallCtrl,
      getActiveCallCtrl,
      updateMediaStateCtrl,
      updateCallSettingsCtrl,
    } = await import('./calls.controller'));
  });

  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockInitiateCall.mockClear();
    mockJoinCall.mockClear();
    mockLeaveCall.mockClear();
    mockEndCall.mockClear();
    mockForceEndCall.mockClear();
    mockGetActiveCall.mockClear();
    mockUpdateMediaState.mockClear();
    mockUpdateCallSettings.mockClear();
    mockEscalateCallInitiateThrottle.mockClear();
    mockInitiateCall.mockImplementation(() =>
      Promise.resolve({ success: true, call: { id: VALID_CALL }, livekitToken: 'tok' }),
    );
    mockJoinCall.mockImplementation(() =>
      Promise.resolve({ success: true, call: { id: VALID_CALL }, livekitToken: 'tok' }),
    );
    mockLeaveCall.mockImplementation(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
    mockEndCall.mockImplementation(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
    mockForceEndCall.mockImplementation(() => Promise.resolve({ success: true, call: { id: VALID_CALL } }));
    mockGetActiveCall.mockImplementation(() => Promise.resolve({ success: true, call: null }));
    mockUpdateMediaState.mockImplementation(() =>
      Promise.resolve({ success: true, call: { id: VALID_CALL } }),
    );
    mockUpdateCallSettings.mockImplementation(() =>
      Promise.resolve({ success: true, conversation: { id: VALID_CONV } }),
    );
  });

  test('initiateCallCtrl unauthorized without session', async () => {
    const r = await initiateCallCtrl(baseCtx({ params: { id: VALID_CONV }, body: { media: MEDIA } }));
    expect(r).toEqual({ kind: 'unauthorized' });
    expect(mockInitiateCall).not.toHaveBeenCalled();
  });

  test('initiateCallCtrl bad_request on invalid conversation id hex', async () => {
    const r = await initiateCallCtrl(
      authedCtx({ params: { id: INVALID_HEX_24 }, body: { media: MEDIA } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid conversation ID.' });
    expect(mockInitiateCall).not.toHaveBeenCalled();
  });

  test('initiateCallCtrl validation_failed on bad body', async () => {
    const r = await initiateCallCtrl(authedCtx({ params: { id: VALID_CONV }, body: {} }));
    expect(r.kind).toBe('validation_failed');
    expect(mockInitiateCall).not.toHaveBeenCalled();
  });

  test('initiateCallCtrl rate_limited escalates throttle', async () => {
    mockInitiateCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Too many',
        errorCode: 'RATE_LIMITED',
        retryAfter: 42,
      } as never),
    );
    const r = await initiateCallCtrl(authedCtx({ params: { id: VALID_CONV }, body: { media: MEDIA } }));
    expect(r).toEqual({ kind: 'rate_limited', retryAfter: 42 });
    expect(mockEscalateCallInitiateThrottle).toHaveBeenCalledWith(
      ROUTE_TEST_IDENTITY_ID.toHexString(),
    );
  });

  test('initiateCallCtrl maps LIVEKIT_UNAVAILABLE to 503 named_error', async () => {
    mockInitiateCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Unavailable',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      } as never),
    );
    const r = await initiateCallCtrl(authedCtx({ params: { id: VALID_CONV }, body: { media: MEDIA } }));
    expect(r.kind).toBe('named_error');
    if (r.kind === 'named_error') {
      expect(r.code).toBe('LIVEKIT_UNAVAILABLE');
      expect(r.status).toBe(503);
    }
  });

  test('initiateCallCtrl success', async () => {
    const r = await initiateCallCtrl(authedCtx({ params: { id: VALID_CONV }, body: { media: MEDIA } }));
    expect(r.kind).toBe('ok');
    expect(mockInitiateCall).toHaveBeenCalledWith(
      VALID_CONV,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      MEDIA,
      { subscriptions: undefined, entitlements: undefined },
      undefined,
    );
  });

  test('joinCallCtrl passes conversation and call ids to service', async () => {
    const r = await joinCallCtrl(
      authedCtx({
        params: { id: VALID_CONV, callId: VALID_CALL },
        body: { media: MEDIA },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockJoinCall).toHaveBeenCalledWith(
      VALID_CONV,
      VALID_CALL,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      MEDIA,
      { subscriptions: undefined, entitlements: undefined },
    );
  });

  test('endCallCtrl forbidden on NOT_IN_CALL', async () => {
    mockEndCall.mockImplementation(() =>
      Promise.resolve({ success: false, error: 'Not in call', errorCode: 'NOT_IN_CALL' } as never),
    );
    const r = await endCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: VALID_CALL } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'Not in call' });
  });

  test('leaveCallCtrl bad_request on invalid call id', async () => {
    const r = await leaveCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: INVALID_HEX_24 } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid call ID.' });
    expect(mockLeaveCall).not.toHaveBeenCalled();
  });

  test('updateMediaStateCtrl passes conversation id to service', async () => {
    const r = await updateMediaStateCtrl(
      authedCtx({
        params: { id: VALID_CONV, callId: VALID_CALL },
        body: { media: MEDIA },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockUpdateMediaState).toHaveBeenCalledWith(
      VALID_CONV,
      VALID_CALL,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      MEDIA,
    );
  });

  test('initiateCallCtrl maps CALL_ALREADY_ACTIVE to 409 named_error', async () => {
    mockInitiateCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Already active',
        errorCode: 'CALL_ALREADY_ACTIVE',
      } as never),
    );
    const r = await initiateCallCtrl(authedCtx({ params: { id: VALID_CONV }, body: { media: MEDIA } }));
    expect(r.kind).toBe('named_error');
    if (r.kind === 'named_error') {
      expect(r.code).toBe('CALL_ALREADY_ACTIVE');
      expect(r.status).toBe(409);
    }
  });

  test('joinCallCtrl maps LIVEKIT_UNAVAILABLE to 503 named_error', async () => {
    mockJoinCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Unavailable',
        errorCode: 'LIVEKIT_UNAVAILABLE',
      } as never),
    );
    const r = await joinCallCtrl(
      authedCtx({
        params: { id: VALID_CONV, callId: VALID_CALL },
        body: { media: MEDIA },
      }),
    );
    expect(r.kind).toBe('named_error');
    if (r.kind === 'named_error') {
      expect(r.code).toBe('LIVEKIT_UNAVAILABLE');
      expect(r.status).toBe(503);
    }
  });

  test('updateCallSettingsCtrl unauthorized without session', async () => {
    const r = await updateCallSettingsCtrl(
      baseCtx({
        params: { id: VALID_CONV },
        body: { audioCallsDisabled: true },
      }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();
  });

  test('updateCallSettingsCtrl validation_failed on empty body', async () => {
    const r = await updateCallSettingsCtrl(
      authedCtx({ params: { id: VALID_CONV }, body: {} }),
    );
    expect(r.kind).toBe('validation_failed');
    expect(mockUpdateCallSettings).not.toHaveBeenCalled();
  });

  test('updateCallSettingsCtrl forbidden on NOT_ADMIN', async () => {
    mockUpdateCallSettings.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Only group admins can change call settings',
        errorCode: 'NOT_ADMIN',
      } as never),
    );
    const r = await updateCallSettingsCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { videoCallsDisabled: true },
      }),
    );
    expect(r).toEqual({
      kind: 'forbidden',
      message: 'Only group admins can change call settings',
    });
  });

  test('updateCallSettingsCtrl success', async () => {
    const r = await updateCallSettingsCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { screenshareDisabled: true },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockUpdateCallSettings).toHaveBeenCalledWith(
      VALID_CONV,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      { screenshareDisabled: true },
    );
  });

  test('getActiveCallCtrl success', async () => {
    const r = await getActiveCallCtrl(authedCtx({ params: { id: VALID_CONV } }));
    expect(r.kind).toBe('ok');
    expect(mockGetActiveCall).toHaveBeenCalledWith(
      VALID_CONV,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
    );
  });

  // ---------- force-end tests ----------

  test('forceEndCallCtrl unauthorized without session', async () => {
    const r = await forceEndCallCtrl(
      baseCtx({ params: { id: VALID_CONV, callId: VALID_CALL } }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
    expect(mockForceEndCall).not.toHaveBeenCalled();
  });

  test('forceEndCallCtrl bad_request on invalid conversation id', async () => {
    const r = await forceEndCallCtrl(
      authedCtx({ params: { id: INVALID_HEX_24, callId: VALID_CALL } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid conversation ID.' });
    expect(mockForceEndCall).not.toHaveBeenCalled();
  });

  test('forceEndCallCtrl bad_request on invalid call id', async () => {
    const r = await forceEndCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: INVALID_HEX_24 } }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid call ID.' });
    expect(mockForceEndCall).not.toHaveBeenCalled();
  });

  test('forceEndCallCtrl success', async () => {
    const r = await forceEndCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: VALID_CALL } }),
    );
    expect(r.kind).toBe('ok');
    expect(mockForceEndCall).toHaveBeenCalledWith(
      VALID_CONV,
      VALID_CALL,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
    );
  });

  test('forceEndCallCtrl not_found on CALL_NOT_FOUND', async () => {
    mockForceEndCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Call not found',
        errorCode: 'CALL_NOT_FOUND',
      } as never),
    );
    const r = await forceEndCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: VALID_CALL } }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Call not found' });
  });

  test('forceEndCallCtrl forbidden on NOT_PARTICIPANT', async () => {
    mockForceEndCall.mockImplementation(() =>
      Promise.resolve({
        success: false,
        error: 'Not a participant',
        errorCode: 'NOT_PARTICIPANT',
      } as never),
    );
    const r = await forceEndCallCtrl(
      authedCtx({ params: { id: VALID_CONV, callId: VALID_CALL } }),
    );
    expect(r).toEqual({ kind: 'forbidden', message: 'Not a participant' });
  });

  // ---------- E2EE wrappedE2EEKeys tests ----------

  test('initiateCallCtrl passes wrappedE2EEKeys to service', async () => {
    const wrappedKeys = [
      {
        recipientIdentityId: 'abc123',
        ephemeralPublicKey: 'AAAA',
        kemCiphertext: 'BBBB',
        wrappedKey: 'CCCC',
        wrappingNonce: 'DDDD',
      },
    ];
    const r = await initiateCallCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { media: MEDIA, wrappedE2EEKeys: wrappedKeys },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockInitiateCall).toHaveBeenCalledWith(
      VALID_CONV,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      MEDIA,
      { subscriptions: undefined, entitlements: undefined },
      wrappedKeys,
    );
  });

  test('initiateCallCtrl accepts call without wrappedE2EEKeys', async () => {
    const r = await initiateCallCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { media: MEDIA },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockInitiateCall).toHaveBeenCalledWith(
      VALID_CONV,
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      MEDIA,
      { subscriptions: undefined, entitlements: undefined },
      undefined,
    );
  });

  test('initiateCallCtrl rejects malformed wrappedE2EEKeys', async () => {
    const badKeys = [
      {
        recipientIdentityId: '',
        ephemeralPublicKey: 'A',
        kemCiphertext: 'B',
        wrappedKey: 'C',
        wrappingNonce: 'D',
      },
    ];
    const r = await initiateCallCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { media: MEDIA, wrappedE2EEKeys: badKeys },
      }),
    );
    expect(r.kind).toBe('validation_failed');
    expect(mockInitiateCall).not.toHaveBeenCalled();
  });

  test('initiateCallCtrl rejects wrappedE2EEKeys with missing fields', async () => {
    const incompleteKeys = [
      {
        recipientIdentityId: 'abc123',
        ephemeralPublicKey: 'AAAA',
      },
    ];
    const r = await initiateCallCtrl(
      authedCtx({
        params: { id: VALID_CONV },
        body: { media: MEDIA, wrappedE2EEKeys: incompleteKeys },
      }),
    );
    expect(r.kind).toBe('validation_failed');
    expect(mockInitiateCall).not.toHaveBeenCalled();
  });
});
