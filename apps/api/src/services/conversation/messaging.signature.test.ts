/**
 * Ingest signature verification tests for the messaging service.
 *
 * The server must reject sendMessage/editMessage payloads whose v2
 * context-bound signature does not verify against the sender's registered
 * signing key, before any message document is persisted.
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const mockConversationRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockMessageRepo = {
  findByClientMessageId: mock(() => Promise.resolve(null)) as AnyMock,
  findByIdInConversation: mock(() => Promise.resolve(null)) as AnyMock,
  create: mock(() => Promise.resolve(null)) as AnyMock,
  applyMessageEdit: mock(() => Promise.resolve({})) as AnyMock,
};

const mockBlockRepo = {
  isBlockedByEither: mock(() => Promise.resolve(false)) as AnyMock,
  getBlockRelatedIdentityIds: mock(() => Promise.resolve([])) as AnyMock,
};

const mockFindIdentityById = mock(() =>
  Promise.resolve({ signingPublicKey: 'signing-key-b64' }),
) as AnyMock;

mock.module('../../repositories/conversation.repository', () => ({
  getConversationRepository: () => mockConversationRepo,
}));

mock.module('../../repositories/message.repository', () => ({
  getMessageRepository: () => mockMessageRepo,
}));

mock.module('../../repositories/block.repository', () => ({
  getBlockRepository: () => mockBlockRepo,
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockFindIdentityById,
  }),
}));

const mockVerifyMessageSignatureV2 = mock(() => true) as AnyMock;

mock.module('../../utils/crypto', () => ({
  verifyMessageSignatureV2: mockVerifyMessageSignatureV2,
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { sendMessage, editMessage } from './messaging';

const senderId = new ObjectId();
const otherId = new ObjectId();
const convId = new ObjectId();
const msgId = new ObjectId();

function makeConversation() {
  return {
    _id: convId,
    type: 'dm' as const,
    participants: [senderId, otherId],
  };
}

function makeSendInput() {
  return {
    ciphertext: 'ct-base64',
    nonce: 'nonce-base64',
    wrappedKeys: [
      {
        identityId: otherId.toHexString(),
        ephemeralPublicKey: 'eph',
        kemCiphertext: 'kem',
        wrappedSessionKey: 'wsk',
        wrappingNonce: 'wn',
        preKeyType: 'static' as const,
      },
    ],
    signature: 'sig-base64',
    cryptoProfile: 'default' as const,
    clientMessageId: crypto.randomUUID(),
  };
}

describe('messaging service signature verification', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockConversationRepo.findById.mockReset();
    mockMessageRepo.findByClientMessageId.mockReset();
    mockMessageRepo.findByIdInConversation.mockReset();
    mockMessageRepo.create.mockReset();
    mockMessageRepo.applyMessageEdit.mockReset();
    mockBlockRepo.isBlockedByEither.mockReset();
    mockFindIdentityById.mockReset();
    mockVerifyMessageSignatureV2.mockReset();

    mockConversationRepo.findById.mockResolvedValue(makeConversation());
    mockMessageRepo.findByClientMessageId.mockResolvedValue(null);
    mockBlockRepo.isBlockedByEither.mockResolvedValue(false);
    mockFindIdentityById.mockResolvedValue({ signingPublicKey: 'signing-key-b64' });
    mockVerifyMessageSignatureV2.mockImplementation(() => true);
  });

  test('sendMessage rejects an invalid v2 signature before persisting', async () => {
    mockVerifyMessageSignatureV2.mockImplementation(() => false);

    const result = await sendMessage(convId, senderId, makeSendInput());

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
    expect(mockMessageRepo.create).not.toHaveBeenCalled();
  });

  test('sendMessage rejects when the sender has no registered signing key', async () => {
    mockFindIdentityById.mockResolvedValue({ signingPublicKey: undefined });

    const result = await sendMessage(convId, senderId, makeSendInput());

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
    expect(mockMessageRepo.create).not.toHaveBeenCalled();
  });

  test('sendMessage verifies against the full message context', async () => {
    // Return false so the flow stops right after verification; only the
    // verification arguments are asserted here.
    mockVerifyMessageSignatureV2.mockImplementation(() => false);
    const input = makeSendInput();

    await sendMessage(convId, senderId, input);

    const [publicKey, context, ciphertext, nonce, wrappedKeys, signature] =
      mockVerifyMessageSignatureV2.mock.calls[0] as [
        string,
        { conversationId: string; fromIdentityId: string; clientMessageId: string },
        string,
        string,
        unknown[],
        string,
      ];
    expect(publicKey).toBe('signing-key-b64');
    expect(context.conversationId).toBe(convId.toHexString());
    expect(context.fromIdentityId).toBe(senderId.toHexString());
    expect(context.clientMessageId).toBe(input.clientMessageId);
    expect(ciphertext).toBe(input.ciphertext);
    expect(nonce).toBe(input.nonce);
    expect(wrappedKeys).toEqual(input.wrappedKeys);
    expect(signature).toBe(input.signature);
  });

  test('editMessage rejects an invalid v2 signature before applying the edit', async () => {
    mockMessageRepo.findByIdInConversation.mockResolvedValue({
      _id: msgId,
      conversationId: convId,
      fromIdentityId: senderId,
      clientMessageId: crypto.randomUUID(),
    });
    mockVerifyMessageSignatureV2.mockImplementation(() => false);

    const result = await editMessage(convId, msgId, senderId, {
      ciphertext: 'new-ct',
      nonce: 'new-nonce',
      wrappedKeys: [],
      signature: 'sig',
      cryptoProfile: 'default',
      clientEditId: crypto.randomUUID(),
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_SIGNATURE');
    expect(mockMessageRepo.applyMessageEdit).not.toHaveBeenCalled();
  });

  test('editMessage binds the ORIGINAL clientMessageId, not the edit id', async () => {
    const originalClientMessageId = crypto.randomUUID();
    const clientEditId = crypto.randomUUID();
    mockMessageRepo.findByIdInConversation.mockResolvedValue({
      _id: msgId,
      conversationId: convId,
      fromIdentityId: senderId,
      clientMessageId: originalClientMessageId,
    });
    mockVerifyMessageSignatureV2.mockImplementation(() => false);

    await editMessage(convId, msgId, senderId, {
      ciphertext: 'new-ct',
      nonce: 'new-nonce',
      wrappedKeys: [],
      signature: 'sig',
      cryptoProfile: 'default',
      clientEditId,
    });

    const [, context] = mockVerifyMessageSignatureV2.mock.calls[0] as [
      string,
      { clientMessageId: string },
    ];
    expect(context.clientMessageId).toBe(originalClientMessageId);
    expect(context.clientMessageId).not.toBe(clientEditId);
  });
});
