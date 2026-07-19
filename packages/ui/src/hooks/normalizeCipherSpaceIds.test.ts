import { describe, expect, test } from 'bun:test';
import { normalizeCipherSpaceIds } from './cipherStoreTypes';

describe('normalizeCipherSpaceIds', () => {
  test('returns spaceIds when present', () => {
    expect(normalizeCipherSpaceIds({ spaceIds: ['a', 'b', 'a'] })).toEqual(['a', 'b']);
  });

  test('migrates legacy singular spaceId', () => {
    expect(normalizeCipherSpaceIds({ spaceId: 'legacy' })).toEqual(['legacy']);
  });

  test('prefers spaceIds over legacy spaceId', () => {
    expect(normalizeCipherSpaceIds({ spaceIds: ['new'], spaceId: 'legacy' })).toEqual(['new']);
  });

  test('returns empty when neither is set', () => {
    expect(normalizeCipherSpaceIds({})).toEqual([]);
  });
});
