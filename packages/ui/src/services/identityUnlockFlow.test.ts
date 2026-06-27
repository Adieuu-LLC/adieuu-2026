import { describe, expect, test } from 'bun:test';
import { deriveUnlockWrappingKey } from './identityUnlockFlow';

describe('identityUnlockFlow', () => {
  test('derives wrapping key and salt', async () => {
    const result = await deriveUnlockWrappingKey('id-1', 'pw');
    expect(result.ok).toBe(true);
  });
});
