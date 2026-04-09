import { describe, expect, mock, test } from 'bun:test';

mock.module('../../services/messagePayload', () => ({
  parsePayload: (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return { text: parsed.text ?? '', attachments: parsed.attachments ?? [], mentions: [] };
    } catch {
      return { text: raw, attachments: [], mentions: [] };
    }
  },
}));
mock.module('../../utils/emojiMartShortcode', () => ({
  getEmojiMartShortcodeLabel: (emoji: string) => `:${emoji}:`,
}));

const {
  resolveDisplayName,
  buildReplySnippet,
  replyComposerLabel,
  resolveQuotedAuthorPreview,
  buildReactionTooltip,
  formatRotationInterval,
  isSameDay,
  formatMessageTime,
  formatDayLabel,
  formatAbsoluteTime,
} = await import('./conversationUtils');

const tFn = (key: string, fallbackOrOpts: string | Record<string, unknown>) => {
  if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
  return (fallbackOrOpts as { defaultValue?: string }).defaultValue ?? key;
};

describe('resolveDisplayName', () => {
  const profiles: Record<string, { displayName?: string; username?: string }> = {
    'user-1': { displayName: 'Alice', username: 'alice' },
    'user-2': { username: 'bob' },
  };

  test('returns nickname when present', () => {
    expect(resolveDisplayName('user-1', profiles as any, { 'user-1': { nickname: 'Ally' } })).toBe('Ally');
  });

  test('returns displayName when no nickname', () => {
    expect(resolveDisplayName('user-1', profiles as any, {})).toBe('Alice');
  });

  test('falls back to username', () => {
    expect(resolveDisplayName('user-2', profiles as any, {})).toBe('bob');
  });

  test('falls back to truncated ID', () => {
    expect(resolveDisplayName('unknown-id-long', {} as any, {})).toBe('unknown-');
  });

  test('returns "You" for self with t function', () => {
    expect(resolveDisplayName('user-1', profiles as any, {}, 'user-1', tFn)).toBe('You');
  });

  test('returns self nickname over "You"', () => {
    expect(resolveDisplayName('user-1', profiles as any, { 'user-1': { nickname: 'Me' } }, 'user-1', tFn)).toBe('Me');
  });
});

describe('buildReplySnippet', () => {
  test('returns fallback for undefined parent', () => {
    expect(buildReplySnippet(undefined, tFn as any)).toBe('Original message');
  });

  test('returns deleted text for deleted message', () => {
    expect(buildReplySnippet({ deleted: true } as any, tFn as any)).toBe('Message deleted');
  });

  test('returns system text for system message', () => {
    expect(buildReplySnippet({ messageType: 'system' } as any, tFn as any)).toBe('System message');
  });

  test('truncates to 6 words with ellipsis', () => {
    const msg = { decryptedContent: 'one two three four five six seven eight' } as any;
    expect(buildReplySnippet(msg, tFn as any)).toBe('one two three four five six…');
  });

  test('does not add ellipsis for <= 6 words', () => {
    const msg = { decryptedContent: 'hello world' } as any;
    expect(buildReplySnippet(msg, tFn as any)).toBe('hello world');
  });

  test('returns Image for media-only message', () => {
    const msg = { decryptedContent: JSON.stringify({ text: '', attachments: [{ e2eMediaId: 'x' }] }) } as any;
    expect(buildReplySnippet(msg, tFn as any)).toBe('Image');
  });
});

describe('replyComposerLabel', () => {
  test('returns "name: snippet"', () => {
    const msg = { fromIdentityId: 'user-1', decryptedContent: 'hey' } as any;
    const profiles = { 'user-1': { displayName: 'Alice' } } as any;
    expect(replyComposerLabel(msg, profiles, {}, tFn as any)).toBe('Alice: hey');
  });
});

describe('resolveQuotedAuthorPreview', () => {
  test('returns undefined for no parent', () => {
    expect(resolveQuotedAuthorPreview(undefined, {}, {}, null)).toBeUndefined();
  });

  test('returns nickname when set', () => {
    const result = resolveQuotedAuthorPreview(
      { fromIdentityId: 'u1' } as any,
      { u1: { displayName: 'Alice', avatarUrl: 'a.png' } } as any,
      { u1: { nickname: 'Ally' } },
      null,
    );
    expect(result).toEqual({ displayName: 'Ally', avatarUrl: 'a.png' });
  });

  test('returns profile name when no nickname', () => {
    const result = resolveQuotedAuthorPreview(
      { fromIdentityId: 'u1' } as any,
      { u1: { displayName: 'Alice', username: 'alice' } } as any,
      {},
      null,
    );
    expect(result?.displayName).toBe('Alice');
  });

  test('returns ? for unknown profile', () => {
    const result = resolveQuotedAuthorPreview(
      { fromIdentityId: 'u1' } as any,
      {} as any,
      {},
      null,
    );
    expect(result).toEqual({ displayName: '?' });
  });
});

describe('buildReactionTooltip', () => {
  test('includes "You" when own reaction', () => {
    const reaction = { emoji: '❤️', count: 1, isOwn: true, fromIdentityIds: ['self'] };
    const result = buildReactionTooltip(reaction as any, {} as any, {}, 'self');
    expect(result).toContain('You');
    expect(result).toContain(':❤️:');
  });

  test('caps named users at 3 and shows others count', () => {
    const reaction = {
      emoji: '👍',
      count: 5,
      isOwn: false,
      fromIdentityIds: ['a', 'b', 'c', 'd', 'e'],
    };
    const profiles = {
      a: { displayName: 'A' },
      b: { displayName: 'B' },
      c: { displayName: 'C' },
      d: { displayName: 'D' },
      e: { displayName: 'E' },
    };
    const result = buildReactionTooltip(reaction as any, profiles as any, {}, undefined);
    expect(result).toContain('+ 2 others');
  });
});

describe('formatRotationInterval', () => {
  test('formats hours', () => {
    expect(formatRotationInterval(1000 * 60 * 60 * 12)).toBe('12h');
  });

  test('formats days', () => {
    expect(formatRotationInterval(1000 * 60 * 60 * 24 * 7)).toBe('7d');
  });

  test('formats weeks', () => {
    expect(formatRotationInterval(1000 * 60 * 60 * 24 * 21)).toBe('3w');
  });

  test('formats months', () => {
    expect(formatRotationInterval(1000 * 60 * 60 * 24 * 90)).toBe('3mo');
  });
});

describe('isSameDay', () => {
  test('returns true for same date', () => {
    const a = new Date(2025, 5, 15, 10, 0);
    const b = new Date(2025, 5, 15, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  test('returns false for different dates', () => {
    const a = new Date(2025, 5, 15);
    const b = new Date(2025, 5, 16);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('formatMessageTime', () => {
  test('returns just time for today', () => {
    const now = new Date();
    const result = formatMessageTime(now.toISOString());
    expect(result).not.toContain('Yesterday');
    expect(result).not.toContain('at');
  });

  test('returns Yesterday for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = formatMessageTime(yesterday.toISOString());
    expect(result).toContain('Yesterday');
  });
});

describe('formatDayLabel', () => {
  test('returns Today for today', () => {
    expect(formatDayLabel(new Date())).toBe('Today');
  });

  test('returns Yesterday for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDayLabel(yesterday)).toBe('Yesterday');
  });
});

describe('formatAbsoluteTime', () => {
  test('returns a locale string', () => {
    const result = formatAbsoluteTime('2025-01-15T12:00:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(10);
  });
});
