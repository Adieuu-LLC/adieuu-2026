import { describe, expect, mock, test } from 'bun:test';
import type { MediaOutboxJobRecord } from '../../services/mediaOutbox/mediaOutboxTypes';

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

const { formatConversationSinceDate } = await import('./conversationUtils');

const {
  getReversedVisibleMessages,
  getLastMessagePreviewText,
  buildMessagesByIdMap,
  buildFlatChatItems,
  mergePendingOutboxIntoFlatItems,
  getConversationHeaderCopy,
} = await import('./conversationViewModel');

const tFn = (key: string, fallbackOrOpts: string | Record<string, unknown>) => {
  if (typeof fallbackOrOpts === 'string') return fallbackOrOpts;
  return (fallbackOrOpts as { defaultValue?: string }).defaultValue ?? key;
};

describe('getReversedVisibleMessages', () => {
  test('reverses order', () => {
    const a = { id: '1', messageType: 'user' as const, deleted: false, decryptedContent: '{}', decryptionError: undefined };
    const b = { id: '2', messageType: 'user' as const, deleted: false, decryptedContent: '{}', decryptionError: undefined };
    const out = getReversedVisibleMessages([a, b] as any, true);
    expect(out.map((m) => m.id)).toEqual(['2', '1']);
  });

  test('hides failed decrypt when artifacts off', () => {
    const msg = {
      id: '1',
      messageType: 'user' as const,
      deleted: false,
      decryptedContent: undefined,
      decryptionError: 'bad' as const,
    };
    expect(getReversedVisibleMessages([msg] as any, false)).toHaveLength(0);
  });
});

describe('getLastMessagePreviewText', () => {
  test('returns last non-system text', () => {
    const messages = [
      { id: '1', messageType: 'system' as const, decryptedContent: '{"text":"x"}' },
      { id: '2', messageType: 'user' as const, deleted: false, decryptedContent: '{"text":"hello"}' },
    ];
    expect(getLastMessagePreviewText(messages as any)).toBe('hello');
  });
});

describe('buildMessagesByIdMap', () => {
  test('hydration fills gaps', () => {
    const active = [{ id: 'a', messageType: 'user' as const } as any];
    const hydration = { b: { id: 'b', messageType: 'user' as const } as any };
    const m = buildMessagesByIdMap(active, hydration);
    expect(m.get('a')).toBeDefined();
    expect(m.get('b')?.id).toBe('b');
  });

  test('active wins over hydration for same id', () => {
    const active = [{ id: 'a', messageType: 'user' as const, x: 1 } as any];
    const hydration = { a: { id: 'a', messageType: 'user' as const, x: 2 } as any };
    const m = buildMessagesByIdMap(active, hydration);
    expect((m.get('a') as any).x).toBe(1);
  });
});

describe('mergePendingOutboxIntoFlatItems', () => {
  test('appends row when jobs are pending for conversation', () => {
    const base = buildFlatChatItems([], 0, Date.now());
    const jobs: MediaOutboxJobRecord[] = [
      {
        id: 'j1',
        conversationId: 'c1',
        stage: 'queued',
        createdAt: 1,
        updatedAt: 1,
        caption: '',
        mentionsJson: '[]',
        useForwardSecrecy: false,
        stripExif: true,
        attachmentBlobs: [],
      },
    ];
    const merged = mergePendingOutboxIntoFlatItems(base, 'c1', jobs);
    expect(merged.length).toBe(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({ type: 'pending-outbox', pendingCount: 1 })
    );
  });

  test('skips when no conversation id', () => {
    const base = buildFlatChatItems([], 0, Date.now());
    expect(mergePendingOutboxIntoFlatItems(base, undefined, [])).toBe(base);
  });
});

describe('buildFlatChatItems', () => {
  test('inserts day separator and first unread', () => {
    const d = new Date('2020-01-02T12:00:00Z').toISOString();
    const d2 = new Date('2020-01-03T12:00:00Z').toISOString();
    const messages = [
      { id: '1', createdAt: d, messageType: 'user' as const, deleted: false, decryptedContent: '{}' },
      { id: '2', createdAt: d2, messageType: 'user' as const, deleted: false, decryptedContent: '{}' },
    ];
    const items = buildFlatChatItems(messages as any, 1, Date.now());
    const types = items.map((i) => i.type);
    expect(types).toContain('day-separator');
    expect(items.some((i) => i.type === 'message' && (i as any).isFirstUnread)).toBe(true);
  });
});

describe('getConversationHeaderCopy', () => {
  test('dm uses participant names when no decrypted name', () => {
    const conv = {
      type: 'dm' as const,
      participants: ['self', 'other'],
      decryptedName: undefined,
      encryptedName: undefined,
      nameNonce: undefined,
    };
    const { displayName, otherParticipantIds } = getConversationHeaderCopy(
      conv as any,
      'self',
      { other: { displayName: 'Bob', username: 'bob' } } as any,
      {},
      tFn as any,
    );
    expect(otherParticipantIds).toEqual(['other']);
    expect(displayName).toContain('Bob');
  });

  test('uses messages-since subtitle when messageCount is set', () => {
    const createdAt = '2001-02-21T00:00:00.000Z';
    const t = (k: string, o: { count: number; date: string } | string) => {
      if (typeof o === 'string') return o;
      if (k === 'conversations.headerSubtitleMessagesSince') {
        return `${o.count} messages since ${o.date}`;
      }
      return k;
    };
    const { subtitle } = getConversationHeaderCopy(
      {
        type: 'group',
        participants: ['a', 'b'],
        messageCount: 251,
        createdAt,
        decryptedName: 'Team',
        encryptedName: 'x',
        nameNonce: 'n',
      } as any,
      'a',
      {},
      {},
      t as any,
    );
    expect(subtitle).toBe(`251 messages since ${formatConversationSinceDate(createdAt)}`);
  });
});
