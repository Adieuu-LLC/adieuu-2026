import { describe, expect, test } from 'bun:test';
import { groupReactions, mergeReactionsByMessageId } from './reactionGrouping';

describe('reactionGrouping', () => {
  test('merges reactions by id while preserving verified items', () => {
    const prev = {
      m1: [{ id: 'r1', verified: true } as never],
    };
    const fetched = {
      m1: [{ id: 'r1', verified: false } as never, { id: 'r2', verified: true } as never],
    };
    const merged = mergeReactionsByMessageId(prev as never, fetched as never);
    expect(merged.m1).toHaveLength(2);
    expect(merged.m1?.find((r) => r.id === 'r1')?.verified).toBe(true);
  });

  test('groups reactions by emoji and marks own reaction', () => {
    const grouped = groupReactions(
      [
        { id: 'r1', emoji: '👍', fromIdentityId: 'me' },
        { id: 'r2', emoji: '👍', fromIdentityId: 'other' },
      ] as never,
      'me'
    );
    expect(grouped[0]?.count).toBe(2);
    expect(grouped[0]?.isOwn).toBe(true);
    expect(grouped[0]?.ownReactionId).toBe('r1');
  });
});
