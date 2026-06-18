import { describe, expect, test } from 'bun:test';
import { detectShortcodeQuery, detectMentionQuery, updateMentionOffsets, resolveMentionedIdentityIds } from './composerUtils';
import type { TrackedMention } from './composerTypes';
import { MENTION_EVERYONE_ID, MENTION_HERE_ID, isGroupMentionId } from './composerTypes';

describe('detectShortcodeQuery', () => {
  test('returns null when no colon present', () => {
    expect(detectShortcodeQuery('hello world', 11)).toBeNull();
  });

  test('returns null for empty query after colon', () => {
    expect(detectShortcodeQuery('hello:', 6)).toBeNull();
  });

  test('returns null for query with invalid chars', () => {
    expect(detectShortcodeQuery('hello:smi le', 12)).toBeNull();
  });

  test('detects valid shortcode query', () => {
    expect(detectShortcodeQuery('hello :smi', 10)).toEqual({ query: 'smi', colonIdx: 6 });
  });

  test('detects query with numbers and special chars', () => {
    expect(detectShortcodeQuery(':+1', 3)).toEqual({ query: '+1', colonIdx: 0 });
  });

  test('finds the last colon', () => {
    expect(detectShortcodeQuery('a:b :smi', 8)).toEqual({ query: 'smi', colonIdx: 4 });
  });
});

describe('detectMentionQuery', () => {
  test('returns null when no @ present', () => {
    expect(detectMentionQuery('hello world', 11)).toBeNull();
  });

  test('returns null when @ not preceded by whitespace', () => {
    expect(detectMentionQuery('email@example', 13)).toBeNull();
  });

  test('detects @ at start of text', () => {
    expect(detectMentionQuery('@ali', 4)).toEqual({ query: 'ali', atIdx: 0 });
  });

  test('detects @ after whitespace', () => {
    expect(detectMentionQuery('hey @bob', 8)).toEqual({ query: 'bob', atIdx: 4 });
  });

  test('returns null for invalid mention chars', () => {
    expect(detectMentionQuery('@ali!ce', 7)).toBeNull();
  });

  test('allows spaces in mention query', () => {
    expect(detectMentionQuery('@Alice B', 8)).toEqual({ query: 'Alice B', atIdx: 0 });
  });
});

describe('updateMentionOffsets', () => {
  test('returns entries unchanged when delta is 0', () => {
    const entries: TrackedMention[] = [{ identityId: 'a', offset: 5, length: 4 }];
    const result = updateMentionOffsets(entries, 'hello', 'hello', 3);
    expect(result).toEqual([{ identityId: 'a', offset: 5, length: 4 }]);
  });

  test('shifts mentions after insertion point', () => {
    const entries: TrackedMention[] = [{ identityId: 'a', offset: 10, length: 4 }];
    const result = updateMentionOffsets(entries, 'hello world', 'hello X world', 5);
    expect(result[0]!.offset).toBe(12);
  });

  test('preserves mentions before insertion point', () => {
    const entries: TrackedMention[] = [{ identityId: 'a', offset: 0, length: 4 }];
    const result = updateMentionOffsets(entries, 'hello world', 'hello world!!', 11);
    expect(result[0]!.offset).toBe(0);
  });

  test('removes mentions that overlap edit region', () => {
    const entries: TrackedMention[] = [{ identityId: 'a', offset: 3, length: 5 }];
    const result = updateMentionOffsets(entries, 'hi @Alice world', 'hi @ world', 5);
    expect(result.length).toBe(0);
  });

  test('handles deletion shifting mentions back', () => {
    const entries: TrackedMention[] = [{ identityId: 'a', offset: 10, length: 4 }];
    const result = updateMentionOffsets(entries, 'hello world', 'helloworld', 5);
    expect(result[0]!.offset).toBe(9);
  });
});

describe('resolveMentionedIdentityIds', () => {
  const mentionSource = {
    users: [
      { id: 'user-a', displayName: 'Alice' },
      { id: 'user-b', displayName: 'Bob' },
    ],
    resolveMentionDisplay: (id: string) => id,
    isGroup: true,
  };

  test('returns undefined for empty mentions', () => {
    expect(resolveMentionedIdentityIds([], mentionSource)).toBeUndefined();
  });

  test('expands @here to all participants', () => {
    expect(
      resolveMentionedIdentityIds([{ id: MENTION_HERE_ID, offset: 0, length: 5 }], mentionSource),
    ).toEqual(['user-a', 'user-b']);
  });

  test('expands @everyone to all participants', () => {
    expect(
      resolveMentionedIdentityIds([{ id: MENTION_EVERYONE_ID, offset: 0, length: 9 }], mentionSource),
    ).toEqual(['user-a', 'user-b']);
  });

  test('keeps individual mention ids', () => {
    expect(
      resolveMentionedIdentityIds([{ id: 'user-a', offset: 0, length: 5 }], mentionSource),
    ).toEqual(['user-a']);
  });

  test('dedupes group and individual mentions', () => {
    const ids = resolveMentionedIdentityIds(
      [
        { id: MENTION_HERE_ID, offset: 0, length: 5 },
        { id: 'user-a', offset: 6, length: 5 },
      ],
      mentionSource,
    );
    expect(ids?.sort()).toEqual(['user-a', 'user-b']);
  });
});
