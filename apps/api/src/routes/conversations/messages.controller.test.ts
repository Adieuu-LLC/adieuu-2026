/**
 * @module routes/conversations/messages.controller.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { RouteContext } from '../../router/types';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const VALID_CONV = '507f1f77bcf86cd799439011';
const VALID_MSG = '507f1f77bcf86cd799439012';

const mockSendMessage = mock(() => Promise.resolve({ success: true, message: { id: VALID_MSG } }));
const mockEditMessage = mock(() => Promise.resolve({ success: true, message: { id: VALID_MSG } }));
const mockGetMessage = mock(() => Promise.resolve({ success: true, message: { id: VALID_MSG } }));
const mockGetMessages = mock(() =>
  Promise.resolve({
    messages: [],
    cursor: null,
    pageOldestId: null,
    pageNewestId: null,
    hasNewerPages: false,
  }),
);
const mockGetMessagesAround = mock(() =>
  Promise.resolve({
    messages: [],
    cursor: null,
    pageOldestId: null,
    pageNewestId: null,
    hasNewerPages: false,
  }),
);
const mockDeleteMessageForSelf = mock(() => Promise.resolve({ success: true }));
const mockDeleteMessageForEveryone = mock(() => Promise.resolve({ success: true }));
const mockListPinnedMessagesPage = mock(() =>
  Promise.resolve({ success: true, messages: [], nextCursor: null }),
);

mock.module('../../services/conversation.service', () => ({
  sendMessage: mockSendMessage,
  editMessage: mockEditMessage,
  getMessage: mockGetMessage,
  getMessages: mockGetMessages,
  getMessagesAround: mockGetMessagesAround,
  deleteMessageForSelf: mockDeleteMessageForSelf,
  deleteMessageForEveryone: mockDeleteMessageForEveryone,
  listPinnedMessagesPage: mockListPinnedMessagesPage,
}));

import {
  listPinnedMessagesCtrl,
  sendMessageCtrl,
  listMessagesCtrl,
  getOneMessageCtrl,
  editMessageCtrl,
  deleteMessageForSelfCtrl,
  messagesAroundCtrl,
} from './messages.controller';

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

const minSendBody = {
  ciphertext: 'x',
  nonce: 'n',
  wrappedKeys: [
    {
      identityId: VALID_CONV,
      ephemeralPublicKey: 'k',
      kemCiphertext: 'c',
      wrappedSessionKey: 'w',
      wrappingNonce: 'wn',
      preKeyType: 'static' as const,
    },
  ],
  signature: 's',
  cryptoProfile: 'default' as const,
  clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
};

describe('messages.controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockEditMessage.mockClear();
    mockGetMessage.mockClear();
    mockGetMessages.mockClear();
    mockGetMessagesAround.mockClear();
    mockDeleteMessageForSelf.mockClear();
    mockDeleteMessageForEveryone.mockClear();
    mockListPinnedMessagesPage.mockClear();
    mockSendMessage.mockImplementation(() =>
      Promise.resolve({ success: true, message: { id: VALID_MSG } }),
    );
    mockEditMessage.mockImplementation(() =>
      Promise.resolve({ success: true, message: { id: VALID_MSG } }),
    );
    mockGetMessage.mockImplementation(() =>
      Promise.resolve({ success: true, message: { id: VALID_MSG } }),
    );
    mockGetMessages.mockImplementation(() =>
      Promise.resolve({
        messages: [],
        cursor: null,
        pageOldestId: null,
        pageNewestId: null,
        hasNewerPages: false,
      }),
    );
    mockGetMessagesAround.mockImplementation(() =>
      Promise.resolve({
        messages: [],
        cursor: null,
        pageOldestId: null,
        pageNewestId: null,
        hasNewerPages: false,
      }),
    );
    mockDeleteMessageForSelf.mockImplementation(() => Promise.resolve({ success: true }));
    mockDeleteMessageForEveryone.mockImplementation(() => Promise.resolve({ success: true }));
    mockListPinnedMessagesPage.mockImplementation(() =>
      Promise.resolve({ success: true, messages: [], nextCursor: null }),
    );
  });

  test('listPinnedMessagesCtrl rejects invalid cursor', async () => {
    const r = await listPinnedMessagesCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        query: new URLSearchParams({ cursor: 'not-valid-object-id-here!!!' }),
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid cursor.' });
    expect(mockListPinnedMessagesPage).not.toHaveBeenCalled();
  });

  test('listPinnedMessagesCtrl success', async () => {
    const r = await listPinnedMessagesCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        query: new URLSearchParams(),
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockListPinnedMessagesPage).toHaveBeenCalled();
  });

  test('sendMessageCtrl bad_request when wrappedKeys identityId invalid after sanitize pattern', async () => {
    const r = await sendMessageCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        body: {
          ...minSendBody,
          wrappedKeys: [
            {
              ...minSendBody.wrappedKeys[0],
              identityId: 'zzzzzzzzzzzzzzzzzzzzzzzz',
            },
          ],
        },
      }),
    );
    expect(r).toEqual({ kind: 'bad_request', message: 'Invalid message payload.' });
  });

  test('sendMessageCtrl success', async () => {
    const r = await sendMessageCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
        body: minSendBody,
      }),
    );
    expect(r.kind).toBe('ok');
    expect(mockSendMessage).toHaveBeenCalled();
  });

  test('listMessagesCtrl maps not_found', async () => {
    mockGetMessages.mockImplementationOnce(() =>
      Promise.resolve({
        errorCode: 'CONVERSATION_NOT_FOUND' as const,
        error: 'missing',
      } as never),
    );
    const r = await listMessagesCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV },
      }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Conversation not found.' });
  });

  test('messagesAroundCtrl unauthorized', async () => {
    const r = await messagesAroundCtrl(
      baseCtx({
        params: { id: VALID_CONV, messageId: VALID_MSG },
      }),
    );
    expect(r).toEqual({ kind: 'unauthorized' });
  });

  test('getOneMessageCtrl success', async () => {
    const r = await getOneMessageCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV, messageId: VALID_MSG },
        query: new URLSearchParams(),
      }),
    );
    expect(r.kind).toBe('ok');
  });

  test('editMessageCtrl MAX_EDITS_REACHED', async () => {
    mockEditMessage.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'MAX_EDITS_REACHED' as const,
        error: 'max',
      } as never),
    );
    const r = await editMessageCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV, messageId: VALID_MSG },
        body: {
          ciphertext: 'x',
          nonce: 'n',
          wrappedKeys: minSendBody.wrappedKeys,
          signature: 's',
          cryptoProfile: 'default',
          clientEditId: '550e8400-e29b-41d4-a716-446655440001',
        },
      }),
    );
    expect(r).toEqual({
      kind: 'named_error',
      code: 'MAX_EDITS_REACHED',
      message: "You can't edit this message anymore.",
      status: 400,
    });
  });

  test('deleteMessageForSelfCtrl not_found', async () => {
    mockDeleteMessageForSelf.mockImplementationOnce(() =>
      Promise.resolve({
        success: false,
        errorCode: 'MESSAGE_NOT_FOUND' as const,
      }),
    );
    const r = await deleteMessageForSelfCtrl(
      baseCtx({
        identitySession: { identity: { _id: ROUTE_TEST_IDENTITY_ID } } as never,
        params: { id: VALID_CONV, messageId: VALID_MSG },
      }),
    );
    expect(r).toEqual({ kind: 'not_found', message: 'Message not found.' });
  });
});
