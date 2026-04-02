import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------

const mockReactionRepo = {
  createReaction: mock(() => Promise.resolve(null)) as AnyMock,
  findById: mock(() => Promise.resolve(null)) as AnyMock,
  findByMessageIds: mock(() => Promise.resolve([])) as AnyMock,
  countByIdentityAndMessage: mock(() => Promise.resolve(0)) as AnyMock,
  countByMessage: mock(() => Promise.resolve(0)) as AnyMock,
  deleteById: mock(() => Promise.resolve(true)) as AnyMock,
  deleteByConversation: mock(() => Promise.resolve(0)) as AnyMock,
  deleteByMessage: mock(() => Promise.resolve(0)) as AnyMock,
};

const mockConversationRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

const mockMessageRepo = {
  findById: mock(() => Promise.resolve(null)) as AnyMock,
};

mock.module('../repositories/reaction.repository', () => ({
  getReactionRepository: () => mockReactionRepo,
}));

mock.module('../repositories/conversation.repository', () => ({
  getConversationRepository: () => mockConversationRepo,
}));

mock.module('../repositories/message.repository', () => ({
  getMessageRepository: () => mockMessageRepo,
}));

mock.module('./notification.service', () => ({
  createNotification: mock(() => Promise.resolve()),
}));

mock.module('../utils/adieuuLogger', () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { addReaction, removeReaction } from './reaction.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const identityA = new ObjectId();
const identityB = new ObjectId();
const convId = new ObjectId();
const msgId = new ObjectId();
const reactionId = new ObjectId();
const now = new Date('2026-04-01T12:00:00.000Z');

function makeConversation(participants: ObjectId[] = [identityA, identityB]) {
  return { _id: convId, participants };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    _id: msgId,
    conversationId: convId,
    fromIdentityId: identityB,
    createdAt: now,
    ...overrides,
  };
}

function makeReactionData() {
  return {
    ciphertext: 'ct-base64',
    nonce: 'nonce-base64',
    wrappedKeys: [
      {
        identityId: identityA.toHexString(),
        ephemeralPublicKey: 'eph',
        kemCiphertext: 'kem',
        wrappedSessionKey: 'wsk',
        wrappingNonce: 'wn',
        preKeyType: 'static' as const,
      },
    ],
    signature: 'sig-base64',
    cryptoProfile: 'default' as const,
    clientReactionId: crypto.randomUUID(),
  };
}

function makeReactionDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: reactionId,
    messageId: msgId,
    conversationId: convId,
    fromIdentityId: identityA,
    ciphertext: 'ct-base64',
    nonce: 'nonce-base64',
    wrappedKeys: [],
    signature: 'sig-base64',
    cryptoProfile: 'default',
    clientReactionId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reaction.service', () => {
  afterAll(() => {
    mock.restore();
  });

  beforeEach(() => {
    mockReactionRepo.createReaction.mockReset();
    mockReactionRepo.findById.mockReset();
    mockReactionRepo.countByIdentityAndMessage.mockReset();
    mockReactionRepo.countByMessage.mockReset();
    mockReactionRepo.deleteById.mockReset();
    mockConversationRepo.findById.mockReset();
    mockMessageRepo.findById.mockReset();

    mockReactionRepo.countByIdentityAndMessage.mockResolvedValue(0);
    mockReactionRepo.countByMessage.mockResolvedValue(0);
    mockConversationRepo.findById.mockResolvedValue(makeConversation());
    mockMessageRepo.findById.mockResolvedValue(makeMessage());
  });

  // -------------------------------------------------------------------------
  // addReaction: TTL inheritance
  // -------------------------------------------------------------------------

  test('addReaction copies message expiresAt onto the reaction', async () => {
    const expiresAt = new Date('2026-04-02T12:00:00.000Z');
    mockMessageRepo.findById.mockResolvedValue(makeMessage({ expiresAt }));
    mockReactionRepo.createReaction.mockResolvedValue(makeReactionDoc({ expiresAt }));

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(true);
    const createCall = mockReactionRepo.createReaction.mock.calls[0]?.[0];
    expect(createCall.expiresAt).toEqual(expiresAt);
  });

  test('addReaction omits expiresAt when message has no TTL', async () => {
    mockMessageRepo.findById.mockResolvedValue(makeMessage());
    mockReactionRepo.createReaction.mockResolvedValue(makeReactionDoc());

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(true);
    const createCall = mockReactionRepo.createReaction.mock.calls[0]?.[0];
    expect(createCall.expiresAt).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // addReaction: limit enforcement
  // -------------------------------------------------------------------------

  test('addReaction rejects when per-user limit is reached', async () => {
    mockReactionRepo.countByIdentityAndMessage.mockResolvedValue(5);
    mockReactionRepo.createReaction.mockResolvedValue(makeReactionDoc());

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('5');
    expect(mockReactionRepo.createReaction).not.toHaveBeenCalled();
  });

  test('addReaction rejects when total message limit is reached', async () => {
    mockReactionRepo.countByMessage.mockResolvedValue(25);
    mockReactionRepo.createReaction.mockResolvedValue(makeReactionDoc());

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('25');
    expect(mockReactionRepo.createReaction).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // addReaction: validation
  // -------------------------------------------------------------------------

  test('addReaction rejects non-participants', async () => {
    const outsider = new ObjectId();
    const result = await addReaction(
      outsider.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not a participant');
  });

  test('addReaction rejects when conversation not found', async () => {
    mockConversationRepo.findById.mockResolvedValue(null);

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Conversation not found');
  });

  test('addReaction rejects when message not found', async () => {
    mockMessageRepo.findById.mockResolvedValue(null);

    const result = await addReaction(
      identityA.toHexString(),
      convId.toHexString(),
      msgId.toHexString(),
      makeReactionData()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Message not found');
  });

  // -------------------------------------------------------------------------
  // removeReaction
  // -------------------------------------------------------------------------

  test('removeReaction only allows the reactor to remove their own reaction', async () => {
    mockReactionRepo.findById.mockResolvedValue(
      makeReactionDoc({ fromIdentityId: identityA })
    );

    const result = await removeReaction(
      identityB.toHexString(),
      convId.toHexString(),
      reactionId.toHexString()
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('your own');
    expect(mockReactionRepo.deleteById).not.toHaveBeenCalled();
  });

  test('removeReaction succeeds for the reactor', async () => {
    mockReactionRepo.findById.mockResolvedValue(
      makeReactionDoc({ fromIdentityId: identityA })
    );
    mockReactionRepo.deleteById.mockResolvedValue(true);
    mockConversationRepo.findById.mockResolvedValue(makeConversation());

    const result = await removeReaction(
      identityA.toHexString(),
      convId.toHexString(),
      reactionId.toHexString()
    );

    expect(result.success).toBe(true);
    expect(mockReactionRepo.deleteById).toHaveBeenCalledWith(reactionId.toHexString());
  });
});
