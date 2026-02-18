import { describe, expect, test } from 'bun:test';

import { addJitter, withMinimumTime } from './timing';

describe('timing utilities', () => {
  describe('addJitter', () => {
    test('delays execution for default range (100-500ms)', async () => {
      const start = performance.now();
      await addJitter();
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(99); // Allow 1ms tolerance
      expect(elapsed).toBeLessThanOrEqual(550); // Allow 50ms tolerance for OS scheduling variance
    });

    test('delays execution for custom range', async () => {
      const start = performance.now();
      await addJitter(50, 100);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(49);
      expect(elapsed).toBeLessThanOrEqual(110);
    });

    test('handles minimum equal to maximum', async () => {
      const start = performance.now();
      await addJitter(50, 50);
      const elapsed = performance.now() - start;

      // With min === max, delay should be exactly that value (plus OS overhead)
      expect(elapsed).toBeGreaterThanOrEqual(49);
      expect(elapsed).toBeLessThanOrEqual(100); // Allow generous tolerance for OS scheduling
    });

    test('handles very small jitter values', async () => {
      const start = performance.now();
      await addJitter(1, 5);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(50); // Allow generous tolerance for OS scheduling
    });

    test('handles zero jitter', async () => {
      const start = performance.now();
      await addJitter(0, 0);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(30); // Allow tolerance for OS scheduling variance
    });

    test('produces varying delays within range', async () => {
      const delays: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await addJitter(10, 50);
        delays.push(performance.now() - start);
      }

      // Check that we get some variation (not all the same)
      const uniqueDelays = new Set(delays.map((d) => Math.round(d / 5) * 5)); // Round to nearest 5ms
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    test('is awaitable and resolves to void', async () => {
      const result = await addJitter(1, 2);
      expect(result).toBeUndefined();
    });
  });

  describe('withMinimumTime', () => {
    test('returns result of the function', async () => {
      const result = await withMinimumTime(async () => 'hello', 10);
      expect(result).toBe('hello');
    });

    test('returns complex objects', async () => {
      const data = { id: 1, name: 'test', nested: { value: true } };
      const result = await withMinimumTime(async () => data, 10);
      expect(result).toEqual(data);
    });

    test('preserves function return type', async () => {
      const numberResult = await withMinimumTime(async () => 42, 10);
      expect(typeof numberResult).toBe('number');

      const boolResult = await withMinimumTime(async () => true, 10);
      expect(typeof boolResult).toBe('boolean');

      const arrayResult = await withMinimumTime(async () => [1, 2, 3], 10);
      expect(Array.isArray(arrayResult)).toBe(true);
    });

    test('pads fast operations to minimum time', async () => {
      const minTime = 100;
      const start = performance.now();

      await withMinimumTime(async () => {
        // Fast operation - nearly instant
        return 'fast';
      }, minTime);

      const elapsed = performance.now() - start;
      // Allow 5ms tolerance for CI environment timing variations
      expect(elapsed).toBeGreaterThanOrEqual(minTime - 5);
    });

    test('does not delay slow operations beyond their natural time', async () => {
      const minTime = 50;
      const operationTime = 100;
      const start = performance.now();

      await withMinimumTime(async () => {
        await Bun.sleep(operationTime);
        return 'slow';
      }, minTime);

      const elapsed = performance.now() - start;
      // Should be close to operationTime, not minTime
      expect(elapsed).toBeGreaterThanOrEqual(operationTime - 5);
      expect(elapsed).toBeLessThan(operationTime + minTime); // Should not add extra delay
    });

    test('handles zero minimum time', async () => {
      const start = performance.now();
      const result = await withMinimumTime(async () => 'instant', 0);
      const elapsed = performance.now() - start;

      expect(result).toBe('instant');
      expect(elapsed).toBeLessThan(50);
    });

    test('handles errors in wrapped function', async () => {
      const errorFn = async () => {
        throw new Error('Test error');
      };

      await expect(withMinimumTime(errorFn, 100)).rejects.toThrow('Test error');
    });

    test('handles async functions that return promises', async () => {
      const result = await withMinimumTime(async () => {
        return Promise.resolve('nested promise');
      }, 10);

      expect(result).toBe('nested promise');
    });

    test('handles null and undefined returns', async () => {
      const nullResult = await withMinimumTime(async () => null, 10);
      expect(nullResult).toBeNull();

      const undefinedResult = await withMinimumTime(async () => undefined, 10);
      expect(undefinedResult).toBeUndefined();
    });

    test('exact minimum time behavior', async () => {
      const minTime = 75;
      const operationTime = 25;

      const start = performance.now();
      await withMinimumTime(async () => {
        await Bun.sleep(operationTime);
        return 'done';
      }, minTime);
      const elapsed = performance.now() - start;

      // Should be padded to at least minTime
      expect(elapsed).toBeGreaterThanOrEqual(minTime - 1);
      // Should not significantly exceed minTime (allow 20ms tolerance)
      expect(elapsed).toBeLessThan(minTime + 20);
    });
  });
});
