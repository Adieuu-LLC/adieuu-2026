import { describe, it, expect } from 'bun:test';
import { groupReactions, groupReactionsByMessageId, type DecryptedDmReaction } from './useDmReactions';

const baseRaw = {
  id: 'reaction-id-1',
  messageId: 'msg-1',
  conversationId: 'c'.repeat(64),
  toIdentityId: '507f1f77bcf86cd799439011',
  ciphertext: 'x',
  nonce: 'n',
  wrappedKeys: [],
  signature: 's',
  cryptoProfile: 'default' as const,
  clientReactionId: 'cr1',
  createdAt: new Date().toISOString(),
};

function reaction(
  overrides: Partial<DecryptedDmReaction> & {
    decrypted: NonNullable<DecryptedDmReaction['decrypted']>;
    raw?: Partial<DecryptedDmReaction['raw']>;
  }
): DecryptedDmReaction {
  return {
    raw: { ...baseRaw, ...overrides.raw },
    decrypted: overrides.decrypted,
    decryptionError: overrides.decryptionError,
  };
}

describe('groupReactions', () => {
  const me = '507f1f77bcf86cd799439012';
  const other = '507f1f77bcf86cd799439013';

  it('groups by emoji and counts reactors', () => {
    const list = [
      reaction({
        raw: { id: 'r1', clientReactionId: 'a' },
        decrypted: { emoji: '👍', fromIdentityId: other, version: 1 },
      }),
      reaction({
        raw: { id: 'r2', clientReactionId: 'b' },
        decrypted: { emoji: '👍', fromIdentityId: me, version: 1 },
      }),
      reaction({
        raw: { id: 'r3', clientReactionId: 'c' },
        decrypted: { emoji: '😀', fromIdentityId: other, version: 1 },
      }),
    ];
    const groups = groupReactions(list, me);
    expect(groups).toHaveLength(2);
    const thumbs = groups.find((g) => g.emoji === '👍');
    expect(thumbs?.count).toBe(2);
    expect(thumbs?.includesMe).toBe(true);
    expect(thumbs?.reactionIds).toEqual(['r1', 'r2']);
  });

  it('skips reactions without decrypted emoji', () => {
    const list: DecryptedDmReaction[] = [
      {
        raw: baseRaw,
        decrypted: null,
      },
    ];
    expect(groupReactions(list, me)).toEqual([]);
  });
});

describe('groupReactionsByMessageId', () => {
  const me = '507f1f77bcf86cd799439012';

  it('partitions by message id then groups emojis', () => {
    const list = [
      reaction({
        raw: { id: 'r1', messageId: 'm1', clientReactionId: 'a' },
        decrypted: { emoji: '👍', fromIdentityId: me, version: 1 },
      }),
      reaction({
        raw: { id: 'r2', messageId: 'm2', clientReactionId: 'b' },
        decrypted: { emoji: '👍', fromIdentityId: me, version: 1 },
      }),
    ];
    const byMsg = groupReactionsByMessageId(list, me);
    expect(Object.keys(byMsg).sort()).toEqual(['m1', 'm2']);
    expect(byMsg['m1']?.[0]?.emoji).toBe('👍');
    expect(byMsg['m2']?.[0]?.emoji).toBe('👍');
  });
});
