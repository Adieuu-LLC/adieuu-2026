import { describe, expect, test } from 'bun:test';
import {
  groupReactions,
  mergeReactionsByMessageId,
  OPTIMISTIC_REACTION_ID_PREFIX,
} from './reactionGrouping';

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

  test('merge drops optimistic rows when fetched contains the same user emoji', () => {
    const optimisticId = `${OPTIMISTIC_REACTION_ID_PREFIX}client-uuid`;
    const prev = {
      m1: [
        {
          id: optimisticId,
          messageId: 'm1',
          conversationId: 'c1',
          fromIdentityId: 'me',
          emoji: '👍',
          verified: true,
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    };
    const fetched = {
      m1: [
        {
          id: 'server-r1',
          messageId: 'm1',
          conversationId: 'c1',
          fromIdentityId: 'me',
          emoji: '👍',
          verified: true,
          createdAt: '2020-01-01T00:00:01.000Z',
        },
      ],
    };
    const merged = mergeReactionsByMessageId(prev as never, fetched as never);
    expect(merged.m1).toHaveLength(1);
    expect(merged.m1?.[0]?.id).toBe('server-r1');
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
