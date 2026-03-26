import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { toPublicDmMessage, isDmMessageTombstone, type DmMessageDocument } from './dm-message';

function buildDoc(overrides: Partial<DmMessageDocument> = {}): DmMessageDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    conversationId: 'a'.repeat(64),
    fromIdentityId: new ObjectId(),
    toIdentityId: new ObjectId(),
    encryptedSenderId: 'encrypted-sender-base64',
    ciphertext: 'ciphertext-base64',
    nonce: 'nonce-base64',
    wrappedKeys: [{
      identityId: new ObjectId().toHexString(),
      deviceId: 'device-1',
      ephemeralPublicKey: 'epk',
      kemCiphertext: 'kem-ct',
      wrappedSessionKey: 'wsk',
      wrappingNonce: 'wn',
      preKeyType: 'static' as const,
    }],
    signature: 'sig-base64',
    cryptoProfile: 'default' as const,
    clientMessageId: 'client-msg-1',
    createdAt: now,
    updatedAt: now,
    deletedForEveryone: false,
    deletedFor: [],
    ...overrides,
  };
}

describe('toPublicDmMessage', () => {
  test('includes fromIdentityId as hex string', () => {
    const fromId = new ObjectId();
    const doc = buildDoc({ fromIdentityId: fromId });
    const pub = toPublicDmMessage(doc);

    expect('deleted' in pub && pub.deleted === true).toBe(false);
    expect((pub as { fromIdentityId: string }).fromIdentityId).toBe(fromId.toHexString());
  });

  test('includes toIdentityId as hex string', () => {
    const toId = new ObjectId();
    const doc = buildDoc({ toIdentityId: toId });
    const pub = toPublicDmMessage(doc);

    expect((pub as { toIdentityId: string }).toIdentityId).toBe(toId.toHexString());
  });

  test('serialises dates as ISO strings', () => {
    const doc = buildDoc();
    const pub = toPublicDmMessage(doc);

    expect((pub as { createdAt: string }).createdAt).toBe(doc.createdAt.toISOString());
  });

  test('includes optional expiresAt when present', () => {
    const exp = new Date(Date.now() + 60_000);
    const doc = buildDoc({ expiresAt: exp });
    const pub = toPublicDmMessage(doc);

    expect((pub as { expiresAt?: string }).expiresAt).toBe(exp.toISOString());
  });

  test('omits expiresAt when absent', () => {
    const doc = buildDoc();
    const pub = toPublicDmMessage(doc);

    expect((pub as { expiresAt?: string }).expiresAt).toBeUndefined();
  });

  test('includes optional replyToId and threadRootId', () => {
    const replyId = new ObjectId();
    const threadId = new ObjectId();
    const doc = buildDoc({ replyToId: replyId, threadRootId: threadId });
    const pub = toPublicDmMessage(doc);

    expect((pub as { replyToId?: string }).replyToId).toBe(replyId.toHexString());
    expect((pub as { threadRootId?: string }).threadRootId).toBe(threadId.toHexString());
  });

  test('returns tombstone when deletedForEveryone is true', () => {
    const doc = buildDoc({ deletedForEveryone: true });
    const pub = toPublicDmMessage(doc);

    expect(isDmMessageTombstone(pub)).toBe(true);
    expect(pub).toEqual({
      id: doc._id.toHexString(),
      conversationId: doc.conversationId,
      deleted: true,
      createdAt: doc.createdAt.toISOString(),
    });
  });

  test('returns tombstone when deleted for requesting identity', () => {
    const requesterId = new ObjectId();
    const doc = buildDoc({ deletedFor: [requesterId] });
    const pub = toPublicDmMessage(doc, requesterId);

    expect(isDmMessageTombstone(pub)).toBe(true);
  });

  test('returns full message when deleted for a different identity', () => {
    const requesterId = new ObjectId();
    const otherId = new ObjectId();
    const doc = buildDoc({ deletedFor: [otherId] });
    const pub = toPublicDmMessage(doc, requesterId);

    expect(isDmMessageTombstone(pub)).toBe(false);
    expect((pub as { fromIdentityId: string }).fromIdentityId).toBeDefined();
  });

  test('tombstone does not leak sensitive fields', () => {
    const doc = buildDoc({ deletedForEveryone: true });
    const pub = toPublicDmMessage(doc);
    const keys = Object.keys(pub);

    expect(keys).not.toContain('fromIdentityId');
    expect(keys).not.toContain('toIdentityId');
    expect(keys).not.toContain('ciphertext');
    expect(keys).not.toContain('wrappedKeys');
    expect(keys).not.toContain('signature');
    expect(keys).not.toContain('encryptedSenderId');
  });

  test('preserves wrappedKeys array verbatim', () => {
    const doc = buildDoc();
    const pub = toPublicDmMessage(doc);

    expect((pub as { wrappedKeys: unknown[] }).wrappedKeys).toEqual(doc.wrappedKeys);
  });
});

describe('isDmMessageTombstone', () => {
  test('returns true for tombstone', () => {
    expect(isDmMessageTombstone({
      id: 'abc',
      conversationId: 'conv',
      deleted: true,
      createdAt: new Date().toISOString(),
    })).toBe(true);
  });

  test('returns false for full message', () => {
    const doc = buildDoc();
    const pub = toPublicDmMessage(doc);
    expect(isDmMessageTombstone(pub)).toBe(false);
  });
});
