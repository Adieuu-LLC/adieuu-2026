import { describe, expect, it } from 'bun:test';
import { buildFlatMessageItems, formatDayLabel } from './buildFlatMessageItems';

type TestMsg = { id: string; createdAt: string; expiresAt?: string };

function msg(id: string, iso: string, expiresAt?: string): TestMsg {
  return { id, createdAt: iso, expiresAt };
}

describe('buildFlatMessageItems', () => {
  it('returns empty for no messages', () => {
    expect(buildFlatMessageItems([], 0, 0)).toEqual([]);
  });

  it('wraps a single message with a day separator', () => {
    const items = buildFlatMessageItems(
      [msg('m1', '2024-06-15T10:00:00Z')],
      0,
      0,
    );
    expect(items).toHaveLength(2);
    expect(items[0]!.type).toBe('day-separator');
    expect(items[1]!.type).toBe('message');
    if (items[1]!.type === 'message') {
      expect(items[1]!.msg.id).toBe('m1');
    }
  });

  it('inserts day separator between messages on different days', () => {
    const items = buildFlatMessageItems(
      [
        msg('m1', new Date(2024, 5, 15, 10, 0, 0).toISOString()),
        msg('m2', new Date(2024, 5, 16, 10, 0, 0).toISOString()),
      ],
      0,
      0,
    );
    const types = items.map((i) => i.type);
    expect(types).toEqual(['day-separator', 'message', 'day-separator', 'message']);
  });

  it('does NOT insert day separator between messages on the same day', () => {
    const items = buildFlatMessageItems(
      [
        msg('m1', new Date(2024, 5, 15, 8, 0, 0).toISOString()),
        msg('m2', new Date(2024, 5, 15, 20, 0, 0).toISOString()),
      ],
      0,
      0,
    );
    const types = items.map((i) => i.type);
    expect(types).toEqual(['day-separator', 'message', 'message']);
  });

  it('handles cross-year day separator', () => {
    const items = buildFlatMessageItems(
      [
        msg('m1', new Date(2023, 11, 31, 23, 0, 0).toISOString()),
        msg('m2', new Date(2024, 0, 1, 1, 0, 0).toISOString()),
      ],
      0,
      0,
    );
    const seps = items.filter((i) => i.type === 'day-separator');
    expect(seps).toHaveLength(2);
  });

  it('marks the first unread message correctly', () => {
    const items = buildFlatMessageItems(
      [
        msg('m1', '2024-06-15T10:00:00Z'),
        msg('m2', '2024-06-15T11:00:00Z'),
        msg('m3', '2024-06-15T12:00:00Z'),
      ],
      1,
      0,
    );
    const unreadItems = items.filter(
      (i) => i.type === 'message' && i.isFirstUnread,
    );
    expect(unreadItems).toHaveLength(1);
    if (unreadItems[0]!.type === 'message') {
      expect(unreadItems[0]!.msg.id).toBe('m3');
    }
  });

  it('marks first unread with 2 unread messages', () => {
    const items = buildFlatMessageItems(
      [
        msg('m1', '2024-06-15T10:00:00Z'),
        msg('m2', '2024-06-15T11:00:00Z'),
        msg('m3', '2024-06-15T12:00:00Z'),
      ],
      2,
      0,
    );
    const unreadItems = items.filter(
      (i) => i.type === 'message' && i.isFirstUnread,
    );
    expect(unreadItems).toHaveLength(1);
    if (unreadItems[0]!.type === 'message') {
      expect(unreadItems[0]!.msg.id).toBe('m2');
    }
  });

  it('does not mark unread when unreadCount >= messages.length', () => {
    const items = buildFlatMessageItems(
      [msg('m1', '2024-06-15T10:00:00Z')],
      5,
      0,
    );
    const unreadItems = items.filter(
      (i) => i.type === 'message' && i.isFirstUnread,
    );
    expect(unreadItems).toHaveLength(0);
  });

  it('filters out expired messages when nowMs > 0', () => {
    const now = new Date('2024-06-15T12:00:00Z').getTime();
    const items = buildFlatMessageItems(
      [
        msg('m1', '2024-06-15T10:00:00Z', '2024-06-15T11:00:00Z'), // expired
        msg('m2', '2024-06-15T10:30:00Z'), // no expiry
      ],
      0,
      now,
    );
    const msgs = items.filter((i) => i.type === 'message');
    expect(msgs).toHaveLength(1);
    if (msgs[0]!.type === 'message') {
      expect(msgs[0]!.msg.id).toBe('m2');
    }
  });

  it('places unread marker on retained messages after excluding expired', () => {
    const now = new Date('2024-06-15T12:00:00Z').getTime();
    // Retained: m1, m3, m4. unreadCount=2 → first unread should be m3 (not m4 via expired m2).
    const items = buildFlatMessageItems(
      [
        msg('m1', '2024-06-15T10:00:00Z'),
        msg('m2', '2024-06-15T10:30:00Z', '2024-06-15T11:00:00Z'), // expired in unread window
        msg('m3', '2024-06-15T11:00:00Z'),
        msg('m4', '2024-06-15T11:30:00Z'),
      ],
      2,
      now,
    );
    const unreadItems = items.filter(
      (i) => i.type === 'message' && i.isFirstUnread,
    );
    expect(unreadItems).toHaveLength(1);
    if (unreadItems[0]!.type === 'message') {
      expect(unreadItems[0]!.msg.id).toBe('m3');
    }
  });

  it('keeps messages when nowMs is 0 even if expiresAt is set', () => {
    const items = buildFlatMessageItems(
      [msg('m1', '2024-06-15T10:00:00Z', '2024-06-15T11:00:00Z')],
      0,
      0,
    );
    expect(items.filter((i) => i.type === 'message')).toHaveLength(1);
  });
});

describe('formatDayLabel', () => {
  it('returns "Today" for today\'s date', () => {
    expect(formatDayLabel(new Date())).toBe('Today');
  });

  it('returns "Yesterday" for yesterday', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDayLabel(yesterday)).toBe('Yesterday');
  });

  it('includes year for dates in a different year', () => {
    const old = new Date('2020-03-15');
    const label = formatDayLabel(old);
    expect(label).toContain('2020');
  });
});
