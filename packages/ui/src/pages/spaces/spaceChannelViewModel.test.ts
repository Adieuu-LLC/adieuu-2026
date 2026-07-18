import { describe, expect, test } from 'bun:test';
import {
  buildMessageLayoutKey,
  countVisibleMessages,
  formatSpacePinPreview,
  resolveLatestPinInfo,
} from './spaceChannelViewModel';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function makeMsg(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    fromIdentityId: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    body: 'hello',
    attachments: [],
    gifAttachments: [],
    mentions: [],
    pageTags: [],
    customEmojis: {},
    deleted: false,
    revisionCount: 0,
    ...overrides,
  } as ChannelMessage;
}

// ---------------------------------------------------------------------------
// buildMessageLayoutKey
// ---------------------------------------------------------------------------

describe('buildMessageLayoutKey', () => {
  test('returns empty string for empty array', () => {
    expect(buildMessageLayoutKey([])).toBe('');
  });

  test('includes count, first id, last id, and lastEditedAt', () => {
    const msgs = [
      makeMsg({ id: 'a' }),
      makeMsg({ id: 'b', lastEditedAt: '2024-01-02' }),
    ];
    const key = buildMessageLayoutKey(msgs);
    expect(key).toBe('2:a:b:2024-01-02');
  });

  test('changes when a message is appended', () => {
    const msgs1 = [makeMsg({ id: 'a' })];
    const msgs2 = [makeMsg({ id: 'a' }), makeMsg({ id: 'b' })];
    expect(buildMessageLayoutKey(msgs1)).not.toBe(buildMessageLayoutKey(msgs2));
  });

  test('changes when last message is edited', () => {
    const msgs1 = [makeMsg({ id: 'a' })];
    const msgs2 = [makeMsg({ id: 'a', lastEditedAt: '2024-06-01' })];
    expect(buildMessageLayoutKey(msgs1)).not.toBe(buildMessageLayoutKey(msgs2));
  });
});

// ---------------------------------------------------------------------------
// countVisibleMessages
// ---------------------------------------------------------------------------

describe('countVisibleMessages', () => {
  test('counts only message items', () => {
    const items: ChannelListItem<ChannelMessage>[] = [
      { type: 'day-separator', date: new Date(), key: 'sep' },
      { type: 'message', msg: makeMsg(), key: 'msg-1' },
      { type: 'message', msg: makeMsg({ id: 'msg-2' }), key: 'msg-2' },
    ];
    expect(countVisibleMessages(items)).toBe(2);
  });

  test('returns 0 for empty array', () => {
    expect(countVisibleMessages([])).toBe(0);
  });

  test('returns 0 when only separators', () => {
    const items: ChannelListItem<ChannelMessage>[] = [
      { type: 'day-separator', date: new Date(), key: 'sep' },
    ];
    expect(countVisibleMessages(items)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatSpacePinPreview
// ---------------------------------------------------------------------------

describe('formatSpacePinPreview', () => {
  test('returns "Pinned" for empty body', () => {
    expect(formatSpacePinPreview('', t)).toBe('Pinned');
  });

  test('returns full text for short body', () => {
    expect(formatSpacePinPreview('short pin', t)).toBe('short pin');
  });

  test('truncates text longer than 70 chars', () => {
    const long = 'a'.repeat(100);
    const result = formatSpacePinPreview(long, t);
    expect(result.length).toBe(71); // 70 chars + ellipsis
    expect(result.endsWith('…')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveLatestPinInfo
// ---------------------------------------------------------------------------

describe('resolveLatestPinInfo', () => {
  test('returns null when pinnedCount is 0', () => {
    expect(resolveLatestPinInfo([], [], 0, t)).toBeNull();
  });

  test('returns null when no pinned message is in the buffer', () => {
    const msgs = [makeMsg({ id: 'a' })];
    expect(resolveLatestPinInfo(msgs, ['b'], 1, t)).toBeNull();
  });

  test('returns preview and messageId for a matching pin', () => {
    const msgs = [makeMsg({ id: 'a', body: 'pinned content' })];
    const result = resolveLatestPinInfo(msgs, ['a'], 1, t);
    expect(result).not.toBeNull();
    expect(result!.messageId).toBe('a');
    expect(result!.preview).toBe('pinned content');
  });
});
