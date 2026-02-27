import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';

mock.module('../../config', () => ({
  config: {
    env: 'test',
    cors: { origins: '*', credentials: false },
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
    security: {
      sessionSecret: 'test-secret',
      otpSecret: 'test-otp-secret',
    },
    cookie: {
      domain: '',
    },
  },
}));

mock.module('../../utils/crypto', () => ({
  generateSecureToken: mock(() => 'test-token'),
  hashIdentifier: mock((id: string) => `hashed:${id}`),
  hmacSign: mock((data: string) => `sig:${data}`),
  hmacVerify: mock(() => true),
}));

const mockIdentityId = new ObjectId();
const mockIdentity = {
  _id: mockIdentityId,
  ident: 'test-hash',
  hashVersion: 1,
  username: 'testuser',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
  signingPublicKey: 'test-signing-key-base64',
  preferredCryptoProfile: 'default' as const,
  devices: [{
    deviceId: 'device-1',
    name: 'Test Device',
    ecdhPublicKey: 'test-ecdh-key',
    kemPublicKey: 'test-kem-key',
    registeredAt: new Date(),
    lastActiveAt: new Date(),
  }],
};

const mockRecipientId = new ObjectId();
const mockRecipient = {
  _id: mockRecipientId,
  ident: 'recipient-hash',
  hashVersion: 1,
  username: 'recipient',
  displayName: 'Recipient User',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastActiveAt: new Date(),
  signingPublicKey: 'recipient-signing-key-base64',
  preferredCryptoProfile: 'default' as const,
  devices: [{
    deviceId: 'device-2',
    name: 'Recipient Device',
    ecdhPublicKey: 'recipient-ecdh-key',
    kemPublicKey: 'recipient-kem-key',
    registeredAt: new Date(),
    lastActiveAt: new Date(),
  }],
};

mock.module('../../services/identity.service', () => ({
  getIdentitySessionIdFromRequest: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_identity=')) {
      return 'test-identity-session';
    }
    return null;
  }),
  getIdentityFromSession: mock(() => Promise.resolve(mockIdentity)),
}));

const mockConversationId = new ObjectId();
const mockParticipantHash = 'b'.repeat(64);
const mockConversation = {
  _id: mockConversationId,
  conversationId: 'a'.repeat(64),
  activeCryptoProfile: 'default' as const,
  profileHistory: [{
    profile: 'default' as const,
    changedAt: new Date(),
    initiatedByHash: mockParticipantHash,
  }],
  readState: [{
    participantHash: mockParticipantHash,
    encryptedLastReadId: 'encrypted-read-state-base64',
    updatedAt: new Date(),
  }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFindByConversationId = mock(() => Promise.resolve(null));
const mockGetOrCreate = mock(() => Promise.resolve(mockConversation));
const mockUpdateCryptoProfile = mock(() => Promise.resolve(mockConversation));
const mockUpdateReadState = mock(() => Promise.resolve(mockConversation));

mock.module('../../repositories/dm-conversation.repository', () => ({
  getDmConversationRepository: () => ({
    findByConversationId: mockFindByConversationId,
    getOrCreate: mockGetOrCreate,
    updateCryptoProfile: mockUpdateCryptoProfile,
    updateReadState: mockUpdateReadState,
  }),
}));

const mockMessageId = new ObjectId();
const mockMessage = {
  _id: mockMessageId,
  conversationId: 'a'.repeat(64),
  toIdentityId: mockRecipientId,
  encryptedSenderId: 'encrypted-sender-id-base64',
  ciphertext: 'encrypted-content-base64',
  nonce: 'nonce-base64',
  wrappedKeys: [{
    identityId: mockRecipientId.toHexString(),
    ephemeralPublicKey: 'ephemeral-key',
    kemCiphertext: 'kem-ct',
    wrappedSessionKey: 'wrapped-key',
    wrappingNonce: 'wrap-nonce',
  }],
  signature: 'signature-base64',
  cryptoProfile: 'default' as const,
  clientMessageId: 'client-msg-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedForEveryone: false,
  deletedFor: [] as ObjectId[],
};

const mockFindByClientMessageId = mock(() => Promise.resolve(null));
const mockCreateMessage = mock(() => Promise.resolve(mockMessage));
const mockGetMessagesByConversation = mock(() => Promise.resolve({
  messages: [mockMessage],
  cursor: null,
  hasMore: false,
}));
const mockGetConversationIdsForIdentity = mock(() => Promise.resolve(['a'.repeat(64)]));
const mockGetLatestMessagePerConversation = mock(() => {
  const map = new Map<string, typeof mockMessage>();
  map.set('a'.repeat(64), mockMessage);
  return Promise.resolve(map);
});
const mockFindMessageById = mock(() => Promise.resolve(mockMessage as typeof mockMessage | null));
const mockDeleteForEveryone = mock(() => Promise.resolve(true));
const mockDeleteForSelf = mock(() => Promise.resolve(true));

mock.module('../../repositories/dm-message.repository', () => ({
  getDmMessageRepository: () => ({
    findByClientMessageId: mockFindByClientMessageId,
    createMessage: mockCreateMessage,
    getMessagesByConversation: mockGetMessagesByConversation,
    getConversationIdsForIdentity: mockGetConversationIdsForIdentity,
    getLatestMessagePerConversation: mockGetLatestMessagePerConversation,
    findById: mockFindMessageById,
    deleteForEveryone: mockDeleteForEveryone,
    deleteForSelf: mockDeleteForSelf,
  }),
}));

const mockFindById = mock((id: ObjectId) => {
  if (id.equals(mockRecipientId)) {
    return Promise.resolve(mockRecipient);
  }
  return Promise.resolve(null);
});

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findById: mockFindById,
  }),
}));

const mockVerifyDmMessageSignature = mock(() => true);

mock.module('../../utils/crypto', () => ({
  generateSecureToken: mock(() => 'test-token'),
  hashIdentifier: mock((id: string) => `hashed:${id}`),
  hmacSign: mock((data: string) => `sig:${data}`),
  hmacVerify: mock(() => true),
  verifyDmMessageSignature: mockVerifyDmMessageSignature,
}));

import {
  getOrCreateConversationCtrl,
  sendMessageCtrl,
  getMessagesCtrl,
  getConversationCtrl,
  getConversationsCtrl,
  updateReadStateCtrl,
  deleteMessageForEveryoneCtrl,
  deleteMessageForSelfCtrl,
} from './controller';
import { deriveConversationId } from '../../utils/conversation';

function createMockContext(options: {
  method?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string>;
  authenticated?: boolean;
}): Parameters<typeof getOrCreateConversationCtrl>[0] {
  const {
    method = 'GET',
    path = '/',
    body = {},
    params = {},
    query = {},
    authenticated = true,
  } = options;

  const headers = new Headers();
  if (authenticated) {
    headers.set('Cookie', 'adieuu_identity=test-session');
  }

  const request = new Request(`http://localhost${path}`, {
    method,
    headers,
  });

  const queryMap = new Map(Object.entries(query));

  return {
    request,
    body,
    params,
    query: {
      get: (key: string) => queryMap.get(key) ?? null,
      has: (key: string) => queryMap.has(key),
      getAll: (key: string) => queryMap.has(key) ? [queryMap.get(key)!] : [],
      forEach: (callback: (value: string, key: string) => void) => {
        queryMap.forEach((v, k) => callback(v, k));
      },
      entries: () => queryMap.entries(),
      keys: () => queryMap.keys(),
      values: () => queryMap.values(),
      [Symbol.iterator]: () => queryMap[Symbol.iterator](),
    },
    errors: {
      unauthorized: () => new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
      notFound: () => new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404 }),
      badRequest: () => new Response(JSON.stringify({ success: false, error: 'Bad request' }), { status: 400 }),
      validationFailed: () => new Response(JSON.stringify({ success: false, error: 'Validation failed' }), { status: 400 }),
    },
  } as Parameters<typeof getOrCreateConversationCtrl>[0];
}

describe('DM Controller', () => {
  beforeEach(() => {
    mockFindByConversationId.mockReset();
    mockGetOrCreate.mockReset();
    mockUpdateReadState.mockReset();
    mockFindByClientMessageId.mockReset();
    mockCreateMessage.mockReset();
    mockGetMessagesByConversation.mockReset();
    mockGetConversationIdsForIdentity.mockReset();
    mockGetLatestMessagePerConversation.mockReset();
    mockFindById.mockReset();

    mockFindByConversationId.mockImplementation(() => Promise.resolve(null));
    mockGetOrCreate.mockImplementation(() => Promise.resolve(mockConversation));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdateReadState.mockImplementation(() => Promise.resolve(mockConversation as any));
    mockFindByClientMessageId.mockImplementation(() => Promise.resolve(null));
    mockCreateMessage.mockImplementation(() => Promise.resolve(mockMessage));
    mockGetMessagesByConversation.mockImplementation(() => Promise.resolve({
      messages: [mockMessage],
      cursor: null,
      hasMore: false,
    }));
    mockGetConversationIdsForIdentity.mockImplementation(() => Promise.resolve(['a'.repeat(64)]));
    mockGetLatestMessagePerConversation.mockImplementation(() => {
      const map = new Map();
      map.set('a'.repeat(64), mockMessage);
      return Promise.resolve(map);
    });
    mockFindById.mockImplementation((id: ObjectId) => {
      if (id.equals(mockRecipientId)) {
        return Promise.resolve(mockRecipient);
      }
      return Promise.resolve(null);
    });
  });

  describe('getOrCreateConversationCtrl', () => {
    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/conversations',
        body: { toIdentityId: mockRecipientId.toHexString() },
        authenticated: false,
      });

      const response = await getOrCreateConversationCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid recipient ID', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/conversations',
        body: { toIdentityId: 'invalid' },
      });

      const response = await getOrCreateConversationCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 400 when trying to message self', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/conversations',
        body: { toIdentityId: mockIdentityId.toHexString() },
      });

      const response = await getOrCreateConversationCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 404 when recipient not found', async () => {
      const nonExistentId = new ObjectId();
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/conversations',
        body: { toIdentityId: nonExistentId.toHexString() },
      });

      const response = await getOrCreateConversationCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('creates conversation successfully', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/conversations',
        body: { toIdentityId: mockRecipientId.toHexString() },
      });

      const response = await getOrCreateConversationCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { conversation: unknown } };
      expect(json.success).toBe(true);
      expect(json.data.conversation).toBeDefined();
    });
  });

  describe('sendMessageCtrl', () => {
    const validConversationId = deriveConversationId(
      mockIdentityId.toHexString(),
      mockRecipientId.toHexString()
    );

    const validMessageBody = {
      conversationId: validConversationId,
      toIdentityId: mockRecipientId.toHexString(),
      encryptedSenderId: 'encrypted-sender-id-base64',
      ciphertext: 'encrypted-content',
      nonce: 'nonce-value',
      wrappedKeys: [{
        identityId: mockRecipientId.toHexString(),
        ephemeralPublicKey: 'ephemeral-key',
        kemCiphertext: 'kem-ct',
        wrappedSessionKey: 'wrapped-key',
        wrappingNonce: 'wrap-nonce',
      }],
      signature: 'signature-value',
      cryptoProfile: 'default',
      clientMessageId: 'client-msg-123',
    };

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages',
        body: validMessageBody,
        authenticated: false,
      });

      const response = await sendMessageCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid conversation ID', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages',
        body: {
          ...validMessageBody,
          conversationId: 'b'.repeat(64),
        },
      });

      const response = await sendMessageCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 404 when recipient not found', async () => {
      const nonExistentId = new ObjectId();
      const wrongConvId = deriveConversationId(
        mockIdentityId.toHexString(),
        nonExistentId.toHexString()
      );

      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages',
        body: {
          ...validMessageBody,
          conversationId: wrongConvId,
          toIdentityId: nonExistentId.toHexString(),
        },
      });

      const response = await sendMessageCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('creates message successfully', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages',
        body: validMessageBody,
      });

      const response = await sendMessageCtrl(ctx);
      expect(response.status).toBe(201);

      const json = await response.json() as { success: boolean; data: { message: unknown } };
      expect(json.success).toBe(true);
      expect(json.data.message).toBeDefined();
    });

    test('deduplicates message with same clientMessageId', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFindByClientMessageId.mockImplementation(() => Promise.resolve(mockMessage as any));

      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages',
        body: validMessageBody,
      });

      const response = await sendMessageCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; message: string };
      expect(json.success).toBe(true);
      expect(json.message).toContain('deduplicated');
    });
  });

  describe('getMessagesCtrl', () => {
    const validConversationId = 'a'.repeat(64);

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/messages`,
        params: { conversationId: validConversationId },
        authenticated: false,
      });

      const response = await getMessagesCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid conversation ID', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: '/dm/conversations/invalid/messages',
        params: { conversationId: 'invalid' },
      });

      const response = await getMessagesCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns messages successfully', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/messages`,
        params: { conversationId: validConversationId },
      });

      const response = await getMessagesCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { messages: unknown[]; hasMore: boolean } };
      expect(json.success).toBe(true);
      expect(json.data.messages).toBeInstanceOf(Array);
      expect(json.data.hasMore).toBe(false);
    });

    test('respects limit parameter', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/messages`,
        params: { conversationId: validConversationId },
        query: { limit: '10' },
      });

      const response = await getMessagesCtrl(ctx);
      expect(response.status).toBe(200);
    });

    test('respects pagination cursor', async () => {
      const cursorId = new ObjectId();
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/messages`,
        params: { conversationId: validConversationId },
        query: { cursor: cursorId.toHexString() },
      });

      const response = await getMessagesCtrl(ctx);
      expect(response.status).toBe(200);
    });
  });

  describe('getConversationCtrl', () => {
    const validConversationId = 'a'.repeat(64);

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}`,
        params: { conversationId: validConversationId },
        authenticated: false,
      });

      const response = await getConversationCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 404 when conversation not found', async () => {
      mockFindByConversationId.mockImplementation(() => Promise.resolve(null));

      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}`,
        params: { conversationId: validConversationId },
      });

      const response = await getConversationCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('returns conversation successfully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFindByConversationId.mockImplementation(() => Promise.resolve(mockConversation as any));

      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}`,
        params: { conversationId: validConversationId },
      });

      const response = await getConversationCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { conversation: unknown } };
      expect(json.success).toBe(true);
      expect(json.data.conversation).toBeDefined();
    });
  });

  describe('getConversationsCtrl', () => {
    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: '/dm/conversations',
        authenticated: false,
      });

      const response = await getConversationsCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns empty array when no conversations', async () => {
      mockGetConversationIdsForIdentity.mockImplementation(() => Promise.resolve([]));

      const ctx = createMockContext({
        method: 'GET',
        path: '/dm/conversations',
      });

      const response = await getConversationsCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { conversations: unknown[] } };
      expect(json.success).toBe(true);
      expect(json.data.conversations).toEqual([]);
    });

    test('returns conversations list successfully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFindByConversationId.mockImplementation(() => Promise.resolve(mockConversation as any));

      const ctx = createMockContext({
        method: 'GET',
        path: '/dm/conversations',
      });

      const response = await getConversationsCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { conversations: { conversationId: string; lastMessageAt: string | null }[] } };
      expect(json.success).toBe(true);
      expect(json.data.conversations).toBeInstanceOf(Array);
      expect(json.data.conversations.length).toBe(1);
      const firstConversation = json.data.conversations[0];
      expect(firstConversation).toBeDefined();
      expect(firstConversation!.conversationId).toBe('a'.repeat(64));
      expect(firstConversation!.lastMessageAt).toBeDefined();
    });
  });

  describe('updateReadStateCtrl', () => {
    const validConversationId = 'a'.repeat(64);

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'PUT',
        path: `/dm/conversations/${validConversationId}/read-state`,
        params: { conversationId: validConversationId },
        body: { encryptedLastReadId: 'encrypted-id-base64' },
        authenticated: false,
      });

      const response = await updateReadStateCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid conversation ID', async () => {
      const ctx = createMockContext({
        method: 'PUT',
        path: '/dm/conversations/invalid/read-state',
        params: { conversationId: 'invalid' },
        body: { encryptedLastReadId: 'encrypted-id-base64' },
      });

      const response = await updateReadStateCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 400 for missing encryptedLastReadId', async () => {
      const ctx = createMockContext({
        method: 'PUT',
        path: `/dm/conversations/${validConversationId}/read-state`,
        params: { conversationId: validConversationId },
        body: {},
      });

      const response = await updateReadStateCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 404 when conversation not found', async () => {
      mockFindByConversationId.mockImplementation(() => Promise.resolve(null));

      const ctx = createMockContext({
        method: 'PUT',
        path: `/dm/conversations/${validConversationId}/read-state`,
        params: { conversationId: validConversationId },
        body: { encryptedLastReadId: 'encrypted-id-base64' },
      });

      const response = await updateReadStateCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('updates read state successfully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockFindByConversationId.mockImplementation(() => Promise.resolve(mockConversation as any));

      const ctx = createMockContext({
        method: 'PUT',
        path: `/dm/conversations/${validConversationId}/read-state`,
        params: { conversationId: validConversationId },
        body: { encryptedLastReadId: 'new-encrypted-id-base64' },
      });

      const response = await updateReadStateCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { conversation: { readState: unknown[] } } };
      expect(json.success).toBe(true);
      expect(json.data.conversation).toBeDefined();
      expect(json.data.conversation.readState).toBeInstanceOf(Array);
    });
  });

  describe('deleteMessageForEveryoneCtrl', () => {
    beforeEach(() => {
      mockFindMessageById.mockReset();
      mockDeleteForEveryone.mockReset();
      mockVerifyDmMessageSignature.mockReset();
      mockFindMessageById.mockImplementation(() => Promise.resolve(mockMessage));
      mockDeleteForEveryone.mockImplementation(() => Promise.resolve(true));
      mockVerifyDmMessageSignature.mockImplementation(() => true);
    });

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/messages/${mockMessageId.toHexString()}`,
        params: { messageId: mockMessageId.toHexString() },
        authenticated: false,
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid message ID', async () => {
      const ctx = createMockContext({
        method: 'DELETE',
        path: '/dm/messages/invalid',
        params: { messageId: 'invalid' },
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 404 when message not found', async () => {
      mockFindMessageById.mockImplementation(() => Promise.resolve(null));

      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/messages/${mockMessageId.toHexString()}`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('returns 403 when signature verification fails (not sender)', async () => {
      mockVerifyDmMessageSignature.mockImplementation(() => false);

      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/messages/${mockMessageId.toHexString()}`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(403);
    });

    test('deletes message for everyone when sender', async () => {
      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/messages/${mockMessageId.toHexString()}`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { deleted: boolean } };
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
      expect(mockDeleteForEveryone).toHaveBeenCalled();
    });

    test('returns success if message already deleted', async () => {
      mockFindMessageById.mockImplementation(() => Promise.resolve({
        ...mockMessage,
        deletedForEveryone: true,
      }));

      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/messages/${mockMessageId.toHexString()}`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForEveryoneCtrl(ctx);
      expect(response.status).toBe(200);
      expect(mockDeleteForEveryone).not.toHaveBeenCalled();
    });
  });

  describe('deleteMessageForSelfCtrl', () => {
    beforeEach(() => {
      mockFindMessageById.mockReset();
      mockDeleteForSelf.mockReset();
      mockFindMessageById.mockImplementation(() => Promise.resolve(mockMessage));
      mockDeleteForSelf.mockImplementation(() => Promise.resolve(true));
    });

    test('returns 401 when not authenticated', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/delete-for-self`,
        params: { messageId: mockMessageId.toHexString() },
        authenticated: false,
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(401);
    });

    test('returns 400 for invalid message ID', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages/invalid/delete-for-self',
        params: { messageId: 'invalid' },
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(400);
    });

    test('returns 404 when message not found', async () => {
      mockFindMessageById.mockImplementation(() => Promise.resolve(null));

      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/delete-for-self`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(404);
    });

    test('deletes message for self', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/delete-for-self`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(200);

      const json = await response.json() as { success: boolean; data: { deleted: boolean } };
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
      expect(mockDeleteForSelf).toHaveBeenCalled();
    });

    test('returns success if already deleted for everyone', async () => {
      mockFindMessageById.mockImplementation(() => Promise.resolve({
        ...mockMessage,
        deletedForEveryone: true,
      }));

      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/delete-for-self`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(200);
      expect(mockDeleteForSelf).not.toHaveBeenCalled();
    });

    test('returns success if already deleted for self', async () => {
      mockFindMessageById.mockImplementation(() => Promise.resolve({
        ...mockMessage,
        deletedFor: [mockIdentityId],
      }));

      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/delete-for-self`,
        params: { messageId: mockMessageId.toHexString() },
      });

      const response = await deleteMessageForSelfCtrl(ctx);
      expect(response.status).toBe(200);
      expect(mockDeleteForSelf).not.toHaveBeenCalled();
    });
  });
});
