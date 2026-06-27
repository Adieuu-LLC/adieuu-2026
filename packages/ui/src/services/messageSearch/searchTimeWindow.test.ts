import { describe, expect, test } from 'bun:test';
import {
  getEffectiveSearchWindowRange,
  getSearchWindowRange,
} from './searchTimeWindow';

describe('getEffectiveSearchWindowRange', () => {
  const now = 1_700_000_000_000;
  const joinRecent = now - 3 * 24 * 60 * 60 * 1000; // 3d ago
  const joinOld = now - 30 * 24 * 60 * 60 * 1000; // 30d ago

  test('matches preset when join is older than window start', () => {
    const plain = getSearchWindowRange('7d', now);
    const eff = getEffectiveSearchWindowRange('7d', now, joinOld);
    expect(eff).toEqual(plain);
  });

  test('raises start to join when join is more recent than preset window start', () => {
    const plain = getSearchWindowRange('7d', now);
    const eff = getEffectiveSearchWindowRange('7d', now, joinRecent);
    expect(eff.endMs).toBe(plain.endMs);
    expect(eff.startMs).toBe(joinRecent);
    expect(eff.startMs).toBeGreaterThan(plain.startMs);
  });

  test('raises start to join for "all" when join is known', () => {
    const plain = getSearchWindowRange('all', now);
    expect(plain.startMs).toBe(0);
    const eff = getEffectiveSearchWindowRange('all', now, joinRecent);
    expect(eff.startMs).toBe(joinRecent);
    expect(eff.endMs).toBe(plain.endMs);
  });

  test('ignores invalid join ms', () => {
    const plain = getSearchWindowRange('all', now);
    expect(getEffectiveSearchWindowRange('all', now, Number.NaN)).toEqual(plain);
    expect(getEffectiveSearchWindowRange('all', now, null)).toEqual(plain);
    expect(getEffectiveSearchWindowRange('all', now, undefined)).toEqual(plain);
  });
});
