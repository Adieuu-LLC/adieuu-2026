/**
 * Tests for the polling pattern used in useFriendsList and ConversationsProvider.
 *
 * Exercises the scheduling, concurrency guard, and visibility-pause logic
 * extracted to a standalone helper for testability.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createPollingController, type PollingController } from './usePolling';

describe('createPollingController', () => {
  let controller: PollingController;

  afterEach(() => {
    controller?.stop();
  });

  it('should call the tick function at the specified interval', async () => {
    let callCount = 0;
    controller = createPollingController(async () => { callCount++; }, 50);
    controller.start();

    await sleep(130);
    controller.stop();

    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it('should not call tick before the interval elapses', async () => {
    let callCount = 0;
    controller = createPollingController(async () => { callCount++; }, 200);
    controller.start();

    await sleep(50);
    controller.stop();

    expect(callCount).toBe(0);
  });

  it('should stop calling tick after stop()', async () => {
    let callCount = 0;
    controller = createPollingController(async () => { callCount++; }, 30);
    controller.start();

    await sleep(80);
    controller.stop();
    const countAtStop = callCount;

    await sleep(80);
    expect(callCount).toBe(countAtStop);
  });

  it('should guard against concurrent ticks when callback is slow', async () => {
    let concurrency = 0;
    let maxConcurrency = 0;

    controller = createPollingController(async () => {
      concurrency++;
      maxConcurrency = Math.max(maxConcurrency, concurrency);
      await sleep(100);
      concurrency--;
    }, 20);
    controller.start();

    await sleep(200);
    controller.stop();

    expect(maxConcurrency).toBe(1);
  });

  it('should skip ticks when paused via shouldSkip', async () => {
    let callCount = 0;
    let paused = false;

    controller = createPollingController(
      async () => { callCount++; },
      30,
      () => paused,
    );
    controller.start();

    await sleep(40);
    expect(callCount).toBeGreaterThanOrEqual(1);
    const countBeforePause = callCount;

    paused = true;
    await sleep(80);
    expect(callCount).toBe(countBeforePause);

    paused = false;
    await sleep(80);
    expect(callCount).toBeGreaterThan(countBeforePause);

    controller.stop();
  });

  it('should be safe to call stop() multiple times', () => {
    controller = createPollingController(async () => {}, 50);
    controller.start();
    controller.stop();
    controller.stop();
  });

  it('should be safe to call start() multiple times without stacking intervals', async () => {
    let callCount = 0;
    controller = createPollingController(async () => { callCount++; }, 30);
    controller.start();
    controller.start();
    controller.start();

    await sleep(80);
    controller.stop();

    // If intervals stacked we'd see 3x the expected count
    expect(callCount).toBeLessThanOrEqual(3);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
