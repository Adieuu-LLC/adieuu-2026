import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { deriveConversationId } from '../../utils/conversation';

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
    cookie: { domain: '' },
  },
}));

const mockIdentityId = new ObjectId();
const mockRecipientId = new ObjectId();
const validConversationId = deriveConversationId(
  mockIdentityId.toHexString(),
  mockRecipientId.toHexString()
);

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
  devices: [
    {
      deviceId: 'device-1',
      name: 'Test Device',
      ecdhPublicKey: 'test-ecdh-key',
      kemPublicKey: 'test-kem-key',
      registeredAt: new Date(),
      lastActiveAt: new Date(),
    },
  ],
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

const mockPublishReactionAdded = mock(() => Promise.resolve());
const mockPublishReactionRemoved = mock(() => Promise.resolve());

mock.module('../../services/dm-events.service', () => ({
  publishReactionAdded: mockPublishReactionAdded,
  publishReactionRemoved: mockPublishReactionRemoved,
}));

const mockMessageId = new ObjectId();
const wrappedKeyStatic = {
  identityId: mockRecipientId.toHexString(),
  deviceId: 'device-2',
  ephemeralPublicKey: 'ephemeral-key',
  kemCiphertext: 'kem-ct',
  wrappedSessionKey: 'wrapped-key',
  wrappingNonce: 'wrap-nonce',
  preKeyType: 'static' as const,
};

const mockMessage = {
  _id: mockMessageId,
  conversationId: validConversationId,
  toIdentityId: mockRecipientId,
  encryptedSenderId: 'encrypted-sender-id-base64',
  ciphertext: 'encrypted-content-base64',
  nonce: 'nonce-base64',
  wrappedKeys: [wrappedKeyStatic],
  signature: 'signature-base64',
  cryptoProfile: 'default' as const,
  clientMessageId: 'client-msg-123',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedForEveryone: false,
  deletedFor: [] as ObjectId[],
};

const mockFindMessageById = mock(() => Promise.resolve(mockMessage as typeof mockMessage | null));

mock.module('../../repositories/dm-message.repository', () => ({
  getDmMessageRepository: () => ({
    findById: mockFindMessageById,
  }),
}));

const mockReactionId = new ObjectId();
const mockReactionDoc = {
  _id: mockReactionId,
  messageId: mockMessageId,
  conversationId: validConversationId,
  toIdentityId: mockRecipientId,
  ciphertext: 'reaction-ct',
  nonce: 'reaction-nonce',
  wrappedKeys: [wrappedKeyStatic],
  signature: 'reaction-sig',
  cryptoProfile: 'default' as const,
  clientReactionId: 'client-react-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFindByClientReactionId = mock(() => Promise.resolve(null));
const mockCreateReaction = mock(() => Promise.resolve(mockReactionDoc));
const mockCountByRecipient = mock(() => Promise.resolve(0));
const mockCountOnMessage = mock(() => Promise.resolve(0));
const mockReactionFindById = mock(() => Promise.resolve(mockReactionDoc));
const mockDeleteReaction = mock(() => Promise.resolve(true));
const mockGetReactionsForMessages = mock(() => Promise.resolve([mockReactionDoc]));

mock.module('../../repositories/dm-reaction.repository', () => ({
  getDmReactionRepository: () => ({
    findByClientReactionId: mockFindByClientReactionId,
    createReaction: mockCreateReaction,
    countReactionsOnMessageByRecipient: mockCountByRecipient,
    countReactionsOnMessage: mockCountOnMessage,
    findById: mockReactionFindById,
    deleteReaction: mockDeleteReaction,
    getReactionsForMessages: mockGetReactionsForMessages,
  }),
}));

const mockVerifyDmMessageSignature = mock(() => true);

mock.module('../../utils/crypto', () => ({
  verifyDmMessageSignature: mockVerifyDmMessageSignature,
}));

import { addReactionCtrl, removeReactionCtrl, getReactionsCtrl } from './reaction-controller';

const validBody = {
  conversationId: validConversationId,
  toIdentityId: mockRecipientId.toHexString(),
  ciphertext: 'reaction-ct',
  nonce: 'reaction-nonce',
  wrappedKeys: [wrappedKeyStatic],
  signature: 'reaction-sig',
  cryptoProfile: 'default' as const,
  clientReactionId: 'client-react-1',
};

function createMockContext(options: {
  method?: string;
  path?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, string | string[]>;
  authenticated?: boolean;
}): Parameters<typeof addReactionCtrl>[0] {
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

  const multi = new Map<string, string[]>();
  for (const [k, v] of Object.entries(query)) {
    multi.set(k, Array.isArray(v) ? v : [v]);
  }

  return {
    request,
    body,
    params,
    query: {
      get: (key: string) => multi.get(key)?.[0] ?? null,
      getAll: (key: string) => multi.get(key) ?? [],
      has: (key: string) => multi.has(key),
      forEach: (callback: (value: string, key: string) => void) => {
        multi.forEach((arr, k) => arr.forEach((v) => callback(v, k)));
      },
      entries: () => multi.entries(),
      keys: () => multi.keys(),
      values: () => multi.values(),
      [Symbol.iterator]: () => multi.entries(),
    },
    errors: {
      unauthorized: () =>
        new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
      notFound: () => new Response(JSON.stringify({ success: false, error: 'Not found' }), { status: 404 }),
      badRequest: () => new Response(JSON.stringify({ success: false, error: 'Bad request' }), { status: 400 }),
      validationFailed: () =>
        new Response(JSON.stringify({ success: false, error: 'Validation failed' }), { status: 400 }),
      forbidden: () => new Response(JSON.stringify({ success: false, error: 'Forbidden' }), { status: 403 }),
    },
  } as Parameters<typeof addReactionCtrl>[0];
}

describe('DM reaction controller', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockFindMessageById.mockReset();
    mockFindByClientReactionId.mockReset();
    mockCreateReaction.mockReset();
    mockCountByRecipient.mockReset();
    mockCountOnMessage.mockReset();
    mockReactionFindById.mockReset();
    mockDeleteReaction.mockReset();
    mockGetReactionsForMessages.mockReset();
    mockVerifyDmMessageSignature.mockReset();
    mockPublishReactionAdded.mockReset();
    mockPublishReactionRemoved.mockReset();

    mockFindMessageById.mockImplementation(() => Promise.resolve(mockMessage));
    mockFindByClientReactionId.mockImplementation(() => Promise.resolve(null));
    mockCreateReaction.mockImplementation(() => Promise.resolve(mockReactionDoc));
    mockCountByRecipient.mockImplementation(() => Promise.resolve(0));
    mockCountOnMessage.mockImplementation(() => Promise.resolve(0));
    mockReactionFindById.mockImplementation(() => Promise.resolve(mockReactionDoc));
    mockDeleteReaction.mockImplementation(() => Promise.resolve(true));
    mockGetReactionsForMessages.mockImplementation(() => Promise.resolve([mockReactionDoc]));
    mockVerifyDmMessageSignature.mockImplementation(() => true);
    mockPublishReactionAdded.mockImplementation(() => Promise.resolve());
    mockPublishReactionRemoved.mockImplementation(() => Promise.resolve());
  });

  describe('addReactionCtrl', () => {
    test('returns 401 without session', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/reactions`,
        body: validBody,
        params: { messageId: mockMessageId.toHexString() },
        authenticated: false,
      });
      const res = await addReactionCtrl(ctx);
      expect(res.status).toBe(401);
    });

    test('returns 400 for invalid message id', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: '/dm/messages/not-a-hex/reactions',
        body: validBody,
        params: { messageId: 'not-a-hex' },
      });
      const res = await addReactionCtrl(ctx);
      expect(res.status).toBe(400);
    });

    test('returns 201 and reaction on success', async () => {
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/reactions`,
        body: validBody,
        params: { messageId: mockMessageId.toHexString() },
      });
      const res = await addReactionCtrl(ctx);
      expect(res.status).toBe(201);
      const json = (await res.json()) as { success: boolean; data: { reaction: { id: string } } };
      expect(json.success).toBe(true);
      expect(json.data.reaction.id).toBe(mockReactionId.toHexString());
      expect(mockPublishReactionAdded).toHaveBeenCalled();
    });

    test('returns 400 when message conversation does not match body', async () => {
      mockFindMessageById.mockImplementation(() =>
        Promise.resolve({
          ...mockMessage,
          conversationId: 'b'.repeat(64),
        })
      );
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/reactions`,
        body: validBody,
        params: { messageId: mockMessageId.toHexString() },
      });
      const res = await addReactionCtrl(ctx);
      expect(res.status).toBe(400);
    });

    test('returns 200 when reaction already exists (dedupe)', async () => {
      mockFindByClientReactionId.mockImplementation(() => Promise.resolve(mockReactionDoc));
      const ctx = createMockContext({
        method: 'POST',
        path: `/dm/messages/${mockMessageId.toHexString()}/reactions`,
        body: validBody,
        params: { messageId: mockMessageId.toHexString() },
      });
      const res = await addReactionCtrl(ctx);
      expect(res.status).toBe(200);
      expect(mockCreateReaction).not.toHaveBeenCalled();
    });
  });

  describe('removeReactionCtrl', () => {
    test('returns 403 when signature does not verify', async () => {
      mockVerifyDmMessageSignature.mockImplementation(() => false);
      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/reactions/${mockReactionId.toHexString()}`,
        params: { reactionId: mockReactionId.toHexString() },
      });
      const res = await removeReactionCtrl(ctx);
      expect(res.status).toBe(403);
      expect(mockDeleteReaction).not.toHaveBeenCalled();
    });

    test('returns 200 and publishes removal when verify succeeds', async () => {
      const ctx = createMockContext({
        method: 'DELETE',
        path: `/dm/reactions/${mockReactionId.toHexString()}`,
        params: { reactionId: mockReactionId.toHexString() },
      });
      const res = await removeReactionCtrl(ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { deleted: boolean } };
      expect(json.data.deleted).toBe(true);
      expect(mockPublishReactionRemoved).toHaveBeenCalled();
    });
  });

  describe('getReactionsCtrl', () => {
    test('returns empty when no messageIds', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/reactions`,
        params: { conversationId: validConversationId },
        query: {},
      });
      const res = await getReactionsCtrl(ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { reactions: unknown[] } };
      expect(json.data.reactions).toEqual([]);
    });

    test('returns reactions for valid participant', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/reactions`,
        params: { conversationId: validConversationId },
        query: { messageIds: [mockMessageId.toHexString()] },
      });
      const res = await getReactionsCtrl(ctx);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; data: { reactions: unknown[] } };
      expect(json.data.reactions.length).toBe(1);
    });

    test('returns 400 for invalid message id in query', async () => {
      const ctx = createMockContext({
        method: 'GET',
        path: `/dm/conversations/${validConversationId}/reactions`,
        params: { conversationId: validConversationId },
        query: { messageIds: ['not-valid-object-id'] },
      });
      const res = await getReactionsCtrl(ctx);
      expect(res.status).toBe(400);
    });
  });
});
