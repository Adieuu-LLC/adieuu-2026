/**
 * @module routes/conversations/reactions.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RouteContext } from '../../router/types';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const VALID_CONV = '507f1f77bcf86cd799439011';
const VALID_MSG = '507f1f77bcf86cd799439012';

const mockAddReaction = mock(() =>
  Promise.resolve({ success: true, reaction: { id: VALID_MSG } }),
);
const mockRemoveReaction = mock(() => Promise.resolve({ success: true }));
const mockGetReactionsForMessages = mock(() =>
  Promise.resolve({ success: true, reactions: [] }),
);

mock.module('../../services/reaction.service', () => ({
  addReaction: mockAddReaction,
  removeReaction: mockRemoveReaction,
  getReactionsForMessages: mockGetReactionsForMessages,
}));

import {
  addReactionCtrl,
  removeReactionCtrl,
  batchReactionsCtrl,
} from './reactions.controller';

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

describe('reactions.controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockAddReaction.mockClear();
    mockRemoveReaction.mockClear();
    mockGetReactionsForMessages.mockClear();
    mockAddReaction.mockImplementation(() =>
      Promise.resolve({ success: true, reaction: { id: VALID_MSG } }),
    );
    mockRemoveReaction.mockImplementation(() => Promise.resolve({ success: true }));
    mockGetReactionsForMessages.mockImplementation(() =>
      Promise.resolve({ success: true, reactions: [] }),
    );
  });

  test('addReactionCtrl unauthorized without session', async () => {
    const r = await addReactionCtrl(baseCtx({ params: { id: VALID_CONV, messageId: VALID_MSG } }));
    expect(r).toEqual({ kind: 'unauthorized' });
    expect(mockAddReaction).not.toHaveBeenCalled();
  });

  test('addReactionCtrl validation_failed on bad body', async () => {
    const r = await addReactionCtrl(
      baseCtx({
        identitySession: {
          identity: { _id: ROUTE_TEST_IDENTITY_ID },
        } as never,
        params: { id: VALID_CONV, messageId: VALID_MSG },
        body: {},
      }),
    );
    expect(r.kind).toBe('validation_failed');
    expect(mockAddReaction).not.toHaveBeenCalled();
  });

  test('addReactionCtrl success', async () => {
    const r = await addReactionCtrl(
      baseCtx({
        identitySession: {
          identity: { _id: ROUTE_TEST_IDENTITY_ID },
        } as never,
        params: { id: VALID_CONV, messageId: VALID_MSG },
        body: {
          ciphertext: 'x',
          nonce: 'n',
          wrappedKeys: [
            {
              identityId: VALID_CONV,
              ephemeralPublicKey: 'k',
              kemCiphertext: 'c',
              wrappedSessionKey: 'w',
              wrappingNonce: 'wn',
              preKeyType: 'static',
            },
          ],
          signature: 's',
          cryptoProfile: 'default',
          clientReactionId: '550e8400-e29b-41d4-a716-446655440000',
        },
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockAddReaction).toHaveBeenCalled();
  });

  test('removeReactionCtrl bad_request on invalid reaction id', async () => {
    const r = await removeReactionCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV, reactionId: 'bogus' },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid reaction ID.' });
  });

  test('batchReactionsCtrl bad_request when messageIds missing', async () => {
    const r = await batchReactionsCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        query: new URLSearchParams(),
      }),
    );
    expect(r.kind).toBe('bad_request');
    if (r.kind === 'bad_request') expect(r.message).toContain('messageIds');
  });

  test('batchReactionsCtrl calls service with sanitized ids', async () => {
    const r = await batchReactionsCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        query: new URLSearchParams({ messageIds: `${VALID_MSG},${VALID_MSG}` }),
      }),
    );
    expect(r.kind).toBe('ok');
    const hex = ROUTE_TEST_IDENTITY_ID.toHexString();
    expect(mockGetReactionsForMessages).toHaveBeenCalledWith(hex, VALID_CONV, [
      VALID_MSG,
      VALID_MSG,
    ]);
  });
});
