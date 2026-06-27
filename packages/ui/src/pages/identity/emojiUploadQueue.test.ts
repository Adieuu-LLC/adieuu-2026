import { describe, it, expect } from 'bun:test';
import { scheduleUploads, retryItem, allUploadsSettled, type QueueItem } from './emojiUploadQueue';

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: 'item-' + Math.random().toString(36).slice(2, 8),
    uploadStarted: false,
    uploadDone: false,
    uploadFailed: false,
    retryCount: 0,
    ...overrides,
  };
}

describe('scheduleUploads', () => {
  it('starts items up to the concurrency limit', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ id: `item-${i}` }),
    );

    const result = scheduleUploads(items, 20);
    const started = result.filter((i) => i.uploadStarted);
    expect(started).toHaveLength(20);
  });

  it('does not exceed the concurrency limit when some are already active', () => {
    const active = Array.from({ length: 15 }, (_, i) =>
      makeItem({ id: `active-${i}`, uploadStarted: true }),
    );
    const pending = Array.from({ length: 10 }, (_, i) =>
      makeItem({ id: `pending-${i}` }),
    );
    const items = [...active, ...pending];

    const result = scheduleUploads(items, 20);
    const started = result.filter((i) => i.uploadStarted);
    expect(started).toHaveLength(20);
  });

  it('returns items unchanged when at capacity', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({ id: `item-${i}`, uploadStarted: true }),
    );

    const result = scheduleUploads(items, 20);
    expect(result).toEqual(items);
  });

  it('does not start items that already completed', () => {
    const items = [
      makeItem({ id: 'done', uploadDone: true }),
      makeItem({ id: 'pending' }),
    ];

    const result = scheduleUploads(items, 20);
    const done = result.find((i) => i.id === 'done');
    expect(done!.uploadStarted).toBe(false);
    const pending = result.find((i) => i.id === 'pending');
    expect(pending!.uploadStarted).toBe(true);
  });

  it('does not start items that have failed', () => {
    const items = [
      makeItem({ id: 'failed', uploadFailed: true }),
      makeItem({ id: 'pending' }),
    ];

    const result = scheduleUploads(items, 20);
    const failed = result.find((i) => i.id === 'failed');
    expect(failed!.uploadStarted).toBe(false);
  });

  it('fills freed slots when active items complete', () => {
    const items = [
      makeItem({ id: 'completed', uploadStarted: true, uploadDone: true }),
      makeItem({ id: 'still-active', uploadStarted: true }),
      makeItem({ id: 'pending-1' }),
      makeItem({ id: 'pending-2' }),
    ];

    const result = scheduleUploads(items, 2);
    const started = result.filter((i) => i.uploadStarted && !i.uploadDone);
    expect(started).toHaveLength(2);
    expect(result.find((i) => i.id === 'pending-1')!.uploadStarted).toBe(true);
  });

  it('returns unchanged list when no items are pending', () => {
    const items = [
      makeItem({ id: 'done', uploadStarted: true, uploadDone: true }),
      makeItem({ id: 'failed', uploadStarted: true, uploadFailed: true }),
    ];

    const result = scheduleUploads(items, 20);
    expect(result).toEqual(items);
  });

  it('handles empty list', () => {
    const result = scheduleUploads([], 20);
    expect(result).toEqual([]);
  });

  it('starts exactly the number of available slots', () => {
    const active = Array.from({ length: 18 }, (_, i) =>
      makeItem({ id: `active-${i}`, uploadStarted: true }),
    );
    const pending = Array.from({ length: 5 }, (_, i) =>
      makeItem({ id: `pending-${i}` }),
    );

    const result = scheduleUploads([...active, ...pending], 20);
    const newlyStarted = result.filter(
      (i) => i.uploadStarted && !active.find((a) => a.id === i.id),
    );
    expect(newlyStarted).toHaveLength(2);
  });
});

describe('retryItem', () => {
  it('resets upload state and increments retryCount', () => {
    const items = [
      makeItem({ id: 'failed-item', uploadFailed: true, uploadStarted: true, retryCount: 0 }),
    ];

    const result = retryItem(items, 'failed-item', 2);
    const item = result[0];
    expect(item.uploadFailed).toBe(false);
    expect(item.uploadDone).toBe(false);
    expect(item.retryCount).toBe(1);
    expect(item.uploadStarted).toBe(false);
  });

  it('allows up to maxRetries retries', () => {
    const items = [
      makeItem({ id: 'item', uploadFailed: true, retryCount: 1 }),
    ];

    const result = retryItem(items, 'item', 2);
    expect(result[0].retryCount).toBe(2);
    expect(result[0].uploadFailed).toBe(false);
  });

  it('does not retry when retryCount equals maxRetries', () => {
    const items = [
      makeItem({ id: 'item', uploadFailed: true, retryCount: 2 }),
    ];

    const result = retryItem(items, 'item', 2);
    expect(result[0].retryCount).toBe(2);
    expect(result[0].uploadFailed).toBe(true);
  });

  it('does not retry when retryCount exceeds maxRetries', () => {
    const items = [
      makeItem({ id: 'item', uploadFailed: true, retryCount: 3 }),
    ];

    const result = retryItem(items, 'item', 2);
    expect(result[0]).toEqual(items[0]);
  });

  it('only affects the targeted item', () => {
    const items = [
      makeItem({ id: 'other', uploadFailed: true, retryCount: 0 }),
      makeItem({ id: 'target', uploadFailed: true, retryCount: 0 }),
    ];

    const result = retryItem(items, 'target', 2);
    expect(result[0].uploadFailed).toBe(true);
    expect(result[0].retryCount).toBe(0);
    expect(result[1].uploadFailed).toBe(false);
    expect(result[1].retryCount).toBe(1);
  });

  it('returns unchanged list when item id not found', () => {
    const items = [makeItem({ id: 'item', uploadFailed: true })];
    const result = retryItem(items, 'nonexistent', 2);
    expect(result).toEqual(items);
  });

  it('respects concurrency limit when combined with scheduleUploads', () => {
    const maxConcurrent = 3;
    const active = Array.from({ length: maxConcurrent }, (_, i) =>
      makeItem({ id: `active-${i}`, uploadStarted: true }),
    );
    const failed = makeItem({ id: 'failed-item', uploadStarted: true, uploadFailed: true, retryCount: 0 });
    const items = [...active, failed];

    const afterRetry = retryItem(items, 'failed-item', 2);
    const afterSchedule = scheduleUploads(afterRetry, maxConcurrent);

    const activeCount = afterSchedule.filter(
      (i) => i.uploadStarted && !i.uploadDone && !i.uploadFailed,
    ).length;
    expect(activeCount).toBeLessThanOrEqual(maxConcurrent);
  });
});

describe('allUploadsSettled', () => {
  it('returns true when all items are done', () => {
    const items = [
      makeItem({ uploadDone: true }),
      makeItem({ uploadDone: true }),
    ];
    expect(allUploadsSettled(items)).toBe(true);
  });

  it('returns true when all items are done or failed', () => {
    const items = [
      makeItem({ uploadDone: true }),
      makeItem({ uploadFailed: true }),
    ];
    expect(allUploadsSettled(items)).toBe(true);
  });

  it('returns false when some items are still pending', () => {
    const items = [
      makeItem({ uploadDone: true }),
      makeItem({}),
    ];
    expect(allUploadsSettled(items)).toBe(false);
  });

  it('returns false for empty list', () => {
    expect(allUploadsSettled([])).toBe(false);
  });

  it('returns false when items are started but not settled', () => {
    const items = [
      makeItem({ uploadStarted: true }),
      makeItem({ uploadDone: true }),
    ];
    expect(allUploadsSettled(items)).toBe(false);
  });
});

describe('hasActiveUploads condition', () => {
  function hasActiveUploads(items: QueueItem[]): boolean {
    return items.some((i) => i.uploadStarted && !i.uploadDone && !i.uploadFailed);
  }

  it('returns true when an item is uploading', () => {
    const items = [makeItem({ uploadStarted: true })];
    expect(hasActiveUploads(items)).toBe(true);
  });

  it('returns false when all items are pending', () => {
    const items = [makeItem(), makeItem()];
    expect(hasActiveUploads(items)).toBe(false);
  });

  it('returns false when all started items have completed', () => {
    const items = [
      makeItem({ uploadStarted: true, uploadDone: true }),
      makeItem({ uploadStarted: true, uploadDone: true }),
    ];
    expect(hasActiveUploads(items)).toBe(false);
  });

  it('returns false when all started items have failed', () => {
    const items = [
      makeItem({ uploadStarted: true, uploadFailed: true }),
    ];
    expect(hasActiveUploads(items)).toBe(false);
  });

  it('returns false after retryItem resets an item (before scheduleUploads)', () => {
    const items = [
      makeItem({ id: 'failed', uploadStarted: true, uploadFailed: true, retryCount: 0 }),
    ];
    const afterRetry = retryItem(items, 'failed', 2);
    expect(hasActiveUploads(afterRetry)).toBe(false);
  });

  it('returns true after scheduleUploads starts a retried item', () => {
    const items = [
      makeItem({ id: 'failed', uploadStarted: true, uploadFailed: true, retryCount: 0 }),
    ];
    const afterRetry = retryItem(items, 'failed', 2);
    const afterSchedule = scheduleUploads(afterRetry, 5);
    expect(hasActiveUploads(afterSchedule)).toBe(true);
  });
});
