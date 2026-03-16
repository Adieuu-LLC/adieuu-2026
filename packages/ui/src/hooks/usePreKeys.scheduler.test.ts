import { describe, expect, test } from 'bun:test';
import {
  createDebouncedAsyncTrigger,
  PREKEY_REPLENISH_DEBOUNCE_MS,
  PREKEY_ROTATION_RETRY_MS,
  rescheduleTimer,
} from './usePreKeys.scheduler';

describe('usePreKeys.scheduler', () => {
  test('rescheduleTimer clears previous handle before scheduling next', () => {
    const events: string[] = [];
    const oldHandle = { id: 'old' } as unknown as ReturnType<typeof setTimeout>;
    const newHandle = { id: 'new' } as unknown as ReturnType<typeof setTimeout>;

    const clearTimer = (handle: ReturnType<typeof setTimeout>) => {
      if (handle === oldHandle) {
        events.push('cleared-old');
      }
    };
    const setTimer = (_callback: () => void, delayMs: number) => {
      events.push(`scheduled-${delayMs}`);
      return newHandle;
    };

    const result = rescheduleTimer(oldHandle, () => {}, 1234, setTimer, clearTimer);
    expect(result).toBe(newHandle);
    expect(events).toEqual(['cleared-old', 'scheduled-1234']);
  });

  test('rescheduleTimer schedules when no existing handle', () => {
    let scheduledDelay = -1;
    const handle = { id: 'first' } as unknown as ReturnType<typeof setTimeout>;
    const result = rescheduleTimer(
      null,
      () => {},
      42,
      (_callback, delayMs) => {
        scheduledDelay = delayMs;
        return handle;
      }
    );
    expect(result).toBe(handle);
    expect(scheduledDelay).toBe(42);
  });

  test('createDebouncedAsyncTrigger runs only once while pending', async () => {
    let callCount = 0;
    const callbacks: Array<() => void> = [];

    const trigger = createDebouncedAsyncTrigger(
      async () => {
        callCount++;
      },
      PREKEY_REPLENISH_DEBOUNCE_MS,
      (cb) => {
        callbacks.push(cb);
        return { id: callbacks.length } as unknown as ReturnType<typeof setTimeout>;
      },
      () => {}
    );

    expect(trigger.trigger()).toBe(true);
    expect(trigger.isPending()).toBe(true);
    expect(trigger.trigger()).toBe(false);
    expect(callbacks.length).toBe(1);

    callbacks[0]?.();
    await Promise.resolve();

    expect(callCount).toBe(1);
    expect(trigger.isPending()).toBe(false);
    expect(trigger.trigger()).toBe(true);
  });

  test('createDebouncedAsyncTrigger cancel clears pending timer', () => {
    let cleared = false;
    let activeHandle: ReturnType<typeof setTimeout> | null = null;

    const trigger = createDebouncedAsyncTrigger(
      async () => {},
      PREKEY_REPLENISH_DEBOUNCE_MS,
      (_cb) => {
        activeHandle = { id: 'timer' } as unknown as ReturnType<typeof setTimeout>;
        return activeHandle;
      },
      (handle) => {
        if (handle === activeHandle) {
          cleared = true;
        }
      }
    );

    trigger.trigger();
    expect(trigger.isPending()).toBe(true);
    trigger.cancel();
    expect(trigger.isPending()).toBe(false);
    expect(cleared).toBe(true);
  });

  test('exports stable timing constants', () => {
    expect(PREKEY_REPLENISH_DEBOUNCE_MS).toBe(2000);
    expect(PREKEY_ROTATION_RETRY_MS).toBe(5 * 60 * 1000);
  });
});

