import { describe, expect, test } from 'bun:test';
import { withTimeout } from './withTimeout';

describe('withTimeout', () => {
  test('resolves when promise resolves before timeout', async () => {
    const p = withTimeout(Promise.resolve(42), 1000, 'timeout');
    await expect(p).resolves.toBe(42);
  });

  test('rejects with timeout message when promise never settles', async () => {
    const p = withTimeout(new Promise<number>(() => {}), 15, 'timed out');
    await expect(p).rejects.toThrow('timed out');
  });

  test('forwards rejection when promise rejects', async () => {
    const p = withTimeout(Promise.reject(new Error('boom')), 1000, 'timeout');
    await expect(p).rejects.toThrow('boom');
  });
});
