/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, mock, beforeEach } from 'bun:test';

const mockWarn = mock(() => {});
const mockInfo = mock(() => {});
mock.module('../../utils/adieuuLogger', () => ({
  default: {
    warn: mockWarn,
    info: mockInfo,
    debug: () => {},
    error: () => {},
  },
}));

const { extractItemPeriodEnd, extractCancelIntent, extractSubscriptionStatus } =
  await import('./billing.service');

beforeEach(() => {
  mockWarn.mockClear();
});

// ---------------------------------------------------------------------------
// 7d. extractItemPeriodEnd
// ---------------------------------------------------------------------------
describe('extractItemPeriodEnd', () => {
  test('single item with current_period_end -> correct Date', () => {
    const ts = Math.floor(Date.now() / 1000) + 86400;
    const sub: any = { id: 'sub_1', items: { data: [{ current_period_end: ts }] } };
    const result = extractItemPeriodEnd(sub);
    expect(result).toBeInstanceOf(Date);
    expect(result!.getTime()).toBe(ts * 1000);
  });

  test('multiple items -> takes the latest', () => {
    const earlier = Math.floor(Date.now() / 1000) + 100;
    const later = Math.floor(Date.now() / 1000) + 200;
    const sub: any = {
      id: 'sub_1',
      items: { data: [{ current_period_end: earlier }, { current_period_end: later }] },
    };
    const result = extractItemPeriodEnd(sub);
    expect(result!.getTime()).toBe(later * 1000);
  });

  test('items with missing current_period_end -> skipped, warning logged', () => {
    const ts = Math.floor(Date.now() / 1000) + 100;
    const sub: any = {
      id: 'sub_1',
      items: { data: [{ id: 'si_a' }, { current_period_end: ts }] },
    };
    const result = extractItemPeriodEnd(sub);
    expect(result!.getTime()).toBe(ts * 1000);
  });

  test('empty items.data array -> undefined, warning logged', () => {
    const sub: any = { id: 'sub_1', items: { data: [] } };
    const result = extractItemPeriodEnd(sub);
    expect(result).toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });

  test('missing items object entirely -> undefined, warning logged', () => {
    const sub: any = { id: 'sub_1' };
    const result = extractItemPeriodEnd(sub);
    expect(result).toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });

  test('current_period_end as non-number -> skipped, warning logged', () => {
    const sub: any = {
      id: 'sub_1',
      items: { data: [{ id: 'si_a', current_period_end: 'not-a-number' }] },
    };
    const result = extractItemPeriodEnd(sub);
    expect(result).toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7d. extractCancelIntent
// ---------------------------------------------------------------------------
describe('extractCancelIntent', () => {
  test('cancel_at as Unix timestamp -> cancelAt Date + cancelAtPeriodEnd true', () => {
    const ts = Math.floor(Date.now() / 1000) + 1000;
    const { cancelAt, cancelAtPeriodEnd } = extractCancelIntent({ cancel_at: ts });
    expect(cancelAt).toBeInstanceOf(Date);
    expect(cancelAt!.getTime()).toBe(ts * 1000);
    expect(cancelAtPeriodEnd).toBe(true);
  });

  test('cancel_at as null -> no cancellation', () => {
    const { cancelAt, cancelAtPeriodEnd } = extractCancelIntent({ cancel_at: null });
    expect(cancelAt).toBeUndefined();
    expect(cancelAtPeriodEnd).toBe(false);
  });

  test('legacy cancel_at_period_end fallback', () => {
    const { cancelAt, cancelAtPeriodEnd } = extractCancelIntent({ cancel_at_period_end: true });
    expect(cancelAt).toBeUndefined();
    expect(cancelAtPeriodEnd).toBe(true);
  });

  test('both absent -> no cancellation', () => {
    const { cancelAt, cancelAtPeriodEnd } = extractCancelIntent({});
    expect(cancelAt).toBeUndefined();
    expect(cancelAtPeriodEnd).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7d. extractSubscriptionStatus
// ---------------------------------------------------------------------------
describe('extractSubscriptionStatus', () => {
  test('known status returns correctly', () => {
    expect(extractSubscriptionStatus({ id: 's', status: 'active' })).toBe('active');
    expect(extractSubscriptionStatus({ id: 's', status: 'canceled' })).toBe('canceled');
    expect(extractSubscriptionStatus({ id: 's', status: 'past_due' })).toBe('past_due');
  });

  test('unknown status stored as-is with warning', () => {
    const result = extractSubscriptionStatus({ id: 's', status: 'some_new_status' });
    expect(result).toBe('some_new_status' as any);
    expect(mockWarn).toHaveBeenCalled();
  });

  test('non-string status -> undefined with warning', () => {
    const result = extractSubscriptionStatus({ id: 's', status: 42 });
    expect(result).toBeUndefined();
    expect(mockWarn).toHaveBeenCalled();
  });
});
