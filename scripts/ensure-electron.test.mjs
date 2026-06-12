import { afterEach, describe, expect, test } from 'bun:test';
import os from 'node:os';
import path from 'node:path';
import { getElectronCacheRoot } from './ensure-electron.mjs';

describe('getElectronCacheRoot', () => {
  const originalEnv = { ...process.env };
  const originalPlatform = process.platform;

  afterEach(() => {
    process.env = { ...originalEnv };
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('uses XDG_CACHE_HOME when set', () => {
    process.env.XDG_CACHE_HOME = '/custom/cache';
    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(getElectronCacheRoot()).toBe(path.join('/custom/cache', 'electron'));
  });

  test('uses macOS Library/Caches on darwin', () => {
    delete process.env.XDG_CACHE_HOME;
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    expect(getElectronCacheRoot()).toBe(
      path.join(os.homedir(), 'Library', 'Caches', 'electron'),
    );
  });

  test('uses LOCALAPPDATA electron Cache on win32', () => {
    delete process.env.XDG_CACHE_HOME;
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    Object.defineProperty(process, 'platform', { value: 'win32' });

    expect(getElectronCacheRoot()).toBe(
      path.join('C:\\Users\\test\\AppData\\Local', 'electron', 'Cache'),
    );
  });

  test('falls back to ~/.cache/electron on linux', () => {
    delete process.env.XDG_CACHE_HOME;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(getElectronCacheRoot()).toBe(path.join(os.homedir(), '.cache', 'electron'));
  });
});
