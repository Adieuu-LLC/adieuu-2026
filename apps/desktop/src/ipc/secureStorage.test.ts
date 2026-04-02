import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  ipcHandlers,
  mockApp,
  setSafeStorageAvailable,
} from '../test/electron-mock';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { registerSecureStorageIpc } = require('../ipc/secureStorage') as {
  registerSecureStorageIpc: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function callHandler<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`No handler registered for ${channel}`);
  return handler({}, ...args) as T;
}

function keysDir(): string {
  return path.join(tmpDir, 'secure-keys');
}

function keyFile(keyId: string): string {
  return path.join(keysDir(), `${keyId}.enc`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('secureStorage IPC handlers', () => {
  beforeEach(async () => {
    ipcHandlers.clear();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'adieuu-ss-test-'));
    mockApp.getPath.mockImplementation(() => tmpDir);
    setSafeStorageAvailable(false);
    registerSecureStorageIpc();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Basic round-trip
  // -------------------------------------------------------------------------

  test('set then get returns the stored payload', async () => {
    await callHandler('secure-storage:set', 'round-trip', 'dGVzdA==');
    const result = await callHandler<string | null>('secure-storage:get', 'round-trip');
    expect(result).toBe('dGVzdA==');
  });

  test('get returns null for a key that was never stored', async () => {
    const result = await callHandler<string | null>('secure-storage:get', 'nonexistent');
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Corrupt / partial file recovery
  // -------------------------------------------------------------------------

  test('get returns null for a corrupt (non-JSON) file and removes it', async () => {
    await fs.mkdir(keysDir(), { recursive: true });
    await fs.writeFile(keyFile('corrupt'), 'this is not json');

    const result = await callHandler<string | null>('secure-storage:get', 'corrupt');
    expect(result).toBeNull();

    const exists = await fs.access(keyFile('corrupt')).then(() => true).catch(() => false);
    expect(exists).toBe(false);
  });

  test('get returns null for an empty file (simulating interrupted write)', async () => {
    await fs.mkdir(keysDir(), { recursive: true });
    await fs.writeFile(keyFile('empty'), '');

    const result = await callHandler<string | null>('secure-storage:get', 'empty');
    expect(result).toBeNull();
  });

  test('get returns null for truncated JSON (simulating partial write)', async () => {
    await fs.mkdir(keysDir(), { recursive: true });
    await fs.writeFile(keyFile('partial'), '{"v":1,"tee":fal');

    const result = await callHandler<string | null>('secure-storage:get', 'partial');
    expect(result).toBeNull();
  });

  test('a subsequent set succeeds after a corrupt file was cleaned up', async () => {
    await fs.mkdir(keysDir(), { recursive: true });
    await fs.writeFile(keyFile('recoverable'), '!!!');

    const first = await callHandler<string | null>('secure-storage:get', 'recoverable');
    expect(first).toBeNull();

    await callHandler('secure-storage:set', 'recoverable', 'fresh-data');
    const second = await callHandler<string | null>('secure-storage:get', 'recoverable');
    expect(second).toBe('fresh-data');
  });

  // -------------------------------------------------------------------------
  // Atomic write guarantees
  // -------------------------------------------------------------------------

  test('set leaves no .tmp files on success', async () => {
    await callHandler('secure-storage:set', 'clean-write', 'payload');

    const files = await fs.readdir(keysDir());
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
    expect(files).toContain('clean-write.enc');
  });

  test('set overwrites an existing key atomically', async () => {
    await callHandler('secure-storage:set', 'overwrite', 'v1');
    await callHandler('secure-storage:set', 'overwrite', 'v2');

    const result = await callHandler<string | null>('secure-storage:get', 'overwrite');
    expect(result).toBe('v2');

    const files = await fs.readdir(keysDir());
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // safeStorage (TEE) integration
  // -------------------------------------------------------------------------

  test('set encrypts with safeStorage when available', async () => {
    setSafeStorageAvailable(true);
    ipcHandlers.clear();
    registerSecureStorageIpc();

    await callHandler('secure-storage:set', 'tee-key', 'sensitive');

    const raw = await fs.readFile(keyFile('tee-key'), 'utf-8');
    const envelope = JSON.parse(raw);
    expect(envelope.tee).toBe(true);
    expect(envelope.data).not.toBe('sensitive');
  });

  test('get decrypts safeStorage-protected keys', async () => {
    setSafeStorageAvailable(true);
    ipcHandlers.clear();
    registerSecureStorageIpc();

    await callHandler('secure-storage:set', 'tee-rt', 'secret-payload');
    const result = await callHandler<string | null>('secure-storage:get', 'tee-rt');
    expect(result).toBe('secret-payload');
  });

  test('set falls back to plaintext when safeStorage is unavailable', async () => {
    setSafeStorageAvailable(false);
    ipcHandlers.clear();
    registerSecureStorageIpc();

    await callHandler('secure-storage:set', 'no-tee', 'plain-data');

    const raw = await fs.readFile(keyFile('no-tee'), 'utf-8');
    const envelope = JSON.parse(raw);
    expect(envelope.tee).toBe(false);
    expect(envelope.data).toBe('plain-data');
  });

  // -------------------------------------------------------------------------
  // delete / has / list
  // -------------------------------------------------------------------------

  test('delete removes an existing key', async () => {
    await callHandler('secure-storage:set', 'del-me', 'data');
    await callHandler('secure-storage:delete', 'del-me');

    const result = await callHandler<string | null>('secure-storage:get', 'del-me');
    expect(result).toBeNull();
  });

  test('delete is a no-op for a missing key', async () => {
    await callHandler('secure-storage:delete', 'never-existed');
  });

  test('has returns true for existing keys', async () => {
    await callHandler('secure-storage:set', 'exists', 'data');
    const result = await callHandler<boolean>('secure-storage:has', 'exists');
    expect(result).toBe(true);
  });

  test('has returns false for missing keys', async () => {
    const result = await callHandler<boolean>('secure-storage:has', 'ghost');
    expect(result).toBe(false);
  });

  test('list returns keys matching the given prefix', async () => {
    await callHandler('secure-storage:set', 'app-key1', 'a');
    await callHandler('secure-storage:set', 'app-key2', 'b');
    await callHandler('secure-storage:set', 'other-key', 'c');

    const result = await callHandler<string[]>('secure-storage:list', 'app-');
    expect(result.sort()).toEqual(['app-key1', 'app-key2']);
  });

  test('list returns empty array when directory does not exist', async () => {
    const result = await callHandler<string[]>('secure-storage:list', 'any');
    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  test('rejects key IDs containing path traversal characters', async () => {
    await expect(callHandler('secure-storage:get', '../etc/passwd')).rejects.toThrow('Invalid key ID');
    await expect(callHandler('secure-storage:set', 'bad/key', 'x')).rejects.toThrow('Invalid key ID');
  });
});
