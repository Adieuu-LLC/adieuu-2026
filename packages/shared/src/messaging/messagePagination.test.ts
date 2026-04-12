import { describe, expect, test } from 'bun:test';
import {
  compareObjectIdHex,
  computeHasNewerPagesFromLastMessageId,
  messagePageBoundsFromNewestFirst,
} from './messagePagination';

describe('compareObjectIdHex', () => {
  test('equal ids', () => {
    expect(compareObjectIdHex('aaaaaaaaaaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(0);
    expect(compareObjectIdHex('AaAaAaAaAaAaAaAaAaAaAaAa', 'aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(0);
  });

  test('ordering', () => {
    const older = '000000000000000000000001';
    const newer = 'ffffffffffffffffffffffff';
    expect(compareObjectIdHex(older, newer)).toBeLessThan(0);
    expect(compareObjectIdHex(newer, older)).toBeGreaterThan(0);
  });
});

describe('messagePageBoundsFromNewestFirst', () => {
  test('empty', () => {
    expect(messagePageBoundsFromNewestFirst([])).toEqual({
      pageOldestId: null,
      pageNewestId: null,
    });
  });

  test('single', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(messagePageBoundsFromNewestFirst([{ id }])).toEqual({
      pageOldestId: id,
      pageNewestId: id,
    });
  });

  test('multiple', () => {
    const newest = 'ffffffffffffffffffffffff';
    const mid = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const oldest = '000000000000000000000001';
    expect(
      messagePageBoundsFromNewestFirst([{ id: newest }, { id: mid }, { id: oldest }]),
    ).toEqual({
      pageNewestId: newest,
      pageOldestId: oldest,
    });
  });
});

describe('computeHasNewerPagesFromLastMessageId', () => {
  const tail = 'ffffffffffffffffffffffff';
  const older = '000000000000000000000001';

  test('no page newest', () => {
    expect(computeHasNewerPagesFromLastMessageId(null, tail)).toBe(false);
    expect(computeHasNewerPagesFromLastMessageId(undefined, tail)).toBe(false);
  });

  test('no conversation tail — indeterminate', () => {
    expect(computeHasNewerPagesFromLastMessageId(tail, null)).toBe(null);
    expect(computeHasNewerPagesFromLastMessageId(tail, undefined)).toBe(null);
  });

  test('at live tail', () => {
    expect(computeHasNewerPagesFromLastMessageId(tail, tail)).toBe(false);
  });

  test('more newer pages exist', () => {
    expect(computeHasNewerPagesFromLastMessageId(older, tail)).toBe(true);
  });

  test('page ahead of stored tail (inconsistent)', () => {
    expect(computeHasNewerPagesFromLastMessageId(tail, older)).toBe(false);
  });
});
