import { describe, expect, test } from 'bun:test';
import { searchMessageRows } from './messageSearchQuery';
import type { MessageSearchCacheRow } from './messageSearchCacheTypes';

const baseRow = (over: Partial<MessageSearchCacheRow>): MessageSearchCacheRow => ({
  messageId: over.messageId ?? 'a',
  conversationId: 'c1',
  timestamp: over.timestamp ?? 1000,
  authorId: over.authorId ?? 'u1',
  bodyText: over.bodyText ?? 'hello world',
  hasAttachments: over.hasAttachments ?? false,
  isReply: over.isReply ?? false,
  parentMessageId: over.parentMessageId,
  hasReplies: over.hasReplies ?? false,
});

describe('searchMessageRows', () => {
  test('matches substring', () => {
    const rows = [baseRow({ messageId: '1', bodyText: 'foo bar baz' })];
    const r = searchMessageRows(rows, { query: 'bar', authorId: null }, 'newest');
    expect(r).toHaveLength(1);
    expect(r[0]!.snippet.toLowerCase()).toContain('bar');
  });

  test('author filter', () => {
    const rows = [baseRow({ messageId: '1', authorId: 'a' }), baseRow({ messageId: '2', authorId: 'b' })];
    const r = searchMessageRows(rows, { query: '', authorId: 'b' }, 'newest');
    expect(r.map((x) => x.row.messageId)).toEqual(['2']);
  });
});
