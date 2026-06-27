import path from 'path';
import os from 'os';
import { describe, expect, test } from 'bun:test';
import {
  assertUpdaterCachePathIsSafe,
  parseUpdaterCacheDirNameFromYml,
} from './clear-installer-cache';

describe('parseUpdaterCacheDirNameFromYml', () => {
  test('reads unquoted value', () => {
    const yml = `
provider: generic
updaterCacheDirName: @adieuudesktop-updater
url: https://example.com
`;
    expect(parseUpdaterCacheDirNameFromYml(yml)).toBe('@adieuudesktop-updater');
  });

  test('reads double-quoted value', () => {
    const yml = 'updaterCacheDirName: "foo-updater"\n';
    expect(parseUpdaterCacheDirNameFromYml(yml)).toBe('foo-updater');
  });

  test('returns null when key missing', () => {
    expect(parseUpdaterCacheDirNameFromYml('provider: generic\n')).toBeNull();
  });
});

describe('assertUpdaterCachePathIsSafe', () => {
  const base = path.join(os.homedir(), '.cache');
  const target = path.join(base, 'some-updater');

  test('allows one segment under base', () => {
    expect(() => {
      assertUpdaterCachePathIsSafe(base, target);
    }).not.toThrow();
  });

  test('rejects the base path itself', () => {
    expect(() => {
      assertUpdaterCachePathIsSafe(base, base);
    }).toThrow(/cache root/);
  });

  test('rejects path outside base', () => {
    const outside = path.join(os.homedir(), 'other');
    expect(() => {
      assertUpdaterCachePathIsSafe(base, outside);
    }).toThrow(/outside/);
  });
});
