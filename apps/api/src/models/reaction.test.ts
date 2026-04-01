import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import {
  toPublicReaction,
  MAX_REACTIONS_PER_USER_PER_MESSAGE,
  MAX_REACTIONS_PER_MESSAGE,
  type ReactionDocument,
} from './reaction';

function makeReactionDoc(overrides: Partial<ReactionDocument> = {}): ReactionDocument {
  const now = new Date('2026-04-01T12:00:00.000Z');
  return {
    _id: new ObjectId(),
    messageId: new ObjectId(),
    conversationId: new ObjectId(),
    fromIdentityId: new ObjectId(),
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

describe('reaction model', () => {
  test('toPublicReaction serialises all base fields', () => {
    const doc = makeReactionDoc();
    const pub = toPublicReaction(doc);

    expect(pub.id).toBe(doc._id.toHexString());
    expect(pub.messageId).toBe(doc.messageId.toHexString());
    expect(pub.conversationId).toBe(doc.conversationId.toHexString());
    expect(pub.fromIdentityId).toBe(doc.fromIdentityId.toHexString());
    expect(pub.ciphertext).toBe(doc.ciphertext);
    expect(pub.nonce).toBe(doc.nonce);
    expect(pub.wrappedKeys).toEqual(doc.wrappedKeys);
    expect(pub.signature).toBe(doc.signature);
    expect(pub.cryptoProfile).toBe(doc.cryptoProfile);
    expect(pub.clientReactionId).toBe(doc.clientReactionId);
    expect(pub.createdAt).toBe(doc.createdAt.toISOString());
  });

  test('toPublicReaction includes expiresAt as ISO string when present', () => {
    const expiresAt = new Date('2026-04-02T12:00:00.000Z');
    const doc = makeReactionDoc({ expiresAt });
    const pub = toPublicReaction(doc);

    expect(pub.expiresAt).toBe(expiresAt.toISOString());
  });

  test('toPublicReaction omits expiresAt when not set on document', () => {
    const doc = makeReactionDoc();
    const pub = toPublicReaction(doc);

    expect(pub.expiresAt).toBeUndefined();
  });

  test('reaction limit constants have expected values', () => {
    expect(MAX_REACTIONS_PER_USER_PER_MESSAGE).toBe(5);
    expect(MAX_REACTIONS_PER_MESSAGE).toBe(25);
  });
});
