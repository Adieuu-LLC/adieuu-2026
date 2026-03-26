import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { toPublicDmConversation, type DmConversationDocument } from './dm-conversation';

function buildDoc(overrides: Partial<DmConversationDocument> = {}): DmConversationDocument {
  const now = new Date();
  return {
    _id: new ObjectId(),
    conversationId: 'a'.repeat(64),
    participants: [new ObjectId(), new ObjectId()],
    activeCryptoProfile: 'default' as const,
    profileHistory: [{
      profile: 'default' as const,
      changedAt: now,
      initiatedByHash: 'hash-abc',
    }],
    readState: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('toPublicDmConversation', () => {
  test('includes participants as hex strings', () => {
    const p1 = new ObjectId();
    const p2 = new ObjectId();
    const doc = buildDoc({ participants: [p1, p2] });
    const pub = toPublicDmConversation(doc);

    expect(pub.participants).toEqual([p1.toHexString(), p2.toHexString()]);
  });

  test('handles empty participants array', () => {
    const doc = buildDoc({ participants: [] });
    const pub = toPublicDmConversation(doc);

    expect(pub.participants).toEqual([]);
  });

  test('handles missing participants with fallback', () => {
    const doc = buildDoc();
    // Simulate pre-migration document where participants may be undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).participants = undefined;
    const pub = toPublicDmConversation(doc);

    expect(pub.participants).toEqual([]);
  });

  test('serialises conversationId', () => {
    const convId = 'b'.repeat(64);
    const doc = buildDoc({ conversationId: convId });
    const pub = toPublicDmConversation(doc);

    expect(pub.conversationId).toBe(convId);
  });

  test('serialises dates as ISO strings', () => {
    const doc = buildDoc();
    const pub = toPublicDmConversation(doc);

    expect(pub.createdAt).toBe(doc.createdAt.toISOString());
    expect(pub.updatedAt).toBe(doc.updatedAt.toISOString());
  });

  test('maps readState entries with ISO date strings', () => {
    const now = new Date();
    const doc = buildDoc({
      readState: [{
        participantHash: 'c'.repeat(64),
        encryptedLastReadId: 'encrypted-read-base64',
        updatedAt: now,
      }],
    });
    const pub = toPublicDmConversation(doc);

    expect(pub.readState).toHaveLength(1);
    expect(pub.readState[0]!.participantHash).toBe('c'.repeat(64));
    expect(pub.readState[0]!.encryptedLastReadId).toBe('encrypted-read-base64');
    expect(pub.readState[0]!.updatedAt).toBe(now.toISOString());
  });

  test('handles missing readState with fallback', () => {
    const doc = buildDoc();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc as any).readState = undefined;
    const pub = toPublicDmConversation(doc);

    expect(pub.readState).toEqual([]);
  });

  test('includes activeCryptoProfile', () => {
    const doc = buildDoc({ activeCryptoProfile: 'cnsa2' });
    const pub = toPublicDmConversation(doc);

    expect(pub.activeCryptoProfile).toBe('cnsa2');
  });

  test('does not expose profileHistory', () => {
    const doc = buildDoc();
    const pub = toPublicDmConversation(doc);

    expect(Object.keys(pub)).not.toContain('profileHistory');
  });
});
