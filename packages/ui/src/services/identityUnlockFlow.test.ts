import { afterAll, describe, expect, mock, test } from 'bun:test';

const deriveEntropyWrappingKeyMock = mock(async () => new Uint8Array([1, 2, 3]));
const getOrCreateWrappingSaltMock = mock(async () => new Uint8Array([9, 9, 9]));

mock.module('@adieuu/crypto', () => ({
  deriveEntropyWrappingKey: deriveEntropyWrappingKeyMock,
}));

mock.module('./deviceKeyStorage', () => ({
  getOrCreateWrappingSalt: getOrCreateWrappingSaltMock,
}));

const unlockFlow = await import('./identityUnlockFlow');

afterAll(() => {
  mock.restore();
});

describe('identityUnlockFlow', () => {
  test('derives wrapping key and salt', async () => {
    const result = await unlockFlow.deriveUnlockWrappingKey('id-1', 'pw');
    expect(result.ok).toBe(true);
  });
});
