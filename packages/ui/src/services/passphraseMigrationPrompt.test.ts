/**
 * Tests for the remote passphrase-change migration prompt loop used by both the
 * login and unlock flows (`attemptPassphraseMigration`).
 *
 * Covers the loop control flow:
 *  - no handler / not-needed short-circuits (no prompt)
 *  - opt-out (skip) returns null without touching keys
 *  - wrong old passphrase retries (surfacing `lastError`) then succeeds
 *  - wrong old passphrase then skip bails out, leaving old material intact
 *  - success returns the recovered deviceId and bumps lastIdentityUnlockAt
 *  - already-migrated (newer local unlock) never prompts
 *
 * Real crypto + fake-indexeddb, no mocks of the migrator. Runs against the web
 * (IndexedDB) backend.
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  getOrCreateWrappingSalt,
  setLastIdentityUnlockAt,
  getLastIdentityUnlockAt,
} from './deviceKeyStorage';
import { attemptPassphraseMigration } from './passphraseMigrationPrompt';
import { randomBytes, deriveEntropyWrappingKey } from '@adieuu/crypto';
import type {
  MigrationPromptContext,
  MigrationPromptResult,
  MigrationPromptHandler,
} from '../hooks/useIdentity.types';

const OLD_PASSPHRASE = 'old-secret-passphrase-2024';
const NEW_PASSPHRASE = 'new-secret-passphrase-2025';
const WRONG_PASSPHRASE = 'totally-wrong-passphrase';
const IDENTITY = 'prompt-identity-abc';
// A server change far in the future guarantees needsPassphraseMigration is true
// whenever there is no (or an older) local unlock timestamp.
const CHANGED_AT = '2999-01-01T00:00:00.000Z';

const DB_NAMES = [
  'adieuu-device-keys',
  'adieuu-pre-keys',
  'adieuu-session-keys',
  'adieuu-wrapping-keys',
  'adieuu-ciphers',
  'adieuu-identity-meta',
];

function deleteDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function wipeAll(): Promise<void> {
  for (const name of DB_NAMES) await deleteDb(name);
}

async function deriveKeyFor(passphrase: string): Promise<Uint8Array> {
  const salt = await getOrCreateWrappingSalt(IDENTITY);
  return deriveEntropyWrappingKey(passphrase, salt);
}

/** Seeds one device wrapped under the OLD passphrase; returns its deviceId. */
async function seedOldDevice(): Promise<string> {
  const oldKey = await deriveKeyFor(OLD_PASSPHRASE);
  const deviceId = crypto.randomUUID();
  await storeDeviceKeys(deviceId, IDENTITY, randomBytes(32), randomBytes(2400), oldKey);
  return deviceId;
}

/** A prompt handler that replays a fixed list of decisions and records calls. */
function scriptedPrompt(decisions: MigrationPromptResult[]): {
  handler: MigrationPromptHandler;
  calls: MigrationPromptContext[];
} {
  const calls: MigrationPromptContext[] = [];
  const handler: MigrationPromptHandler = async (ctx) => {
    const decision = decisions[calls.length];
    calls.push(ctx);
    if (!decision) throw new Error('prompt invoked more times than scripted');
    return decision;
  };
  return { handler, calls };
}

describe('attemptPassphraseMigration', () => {
  beforeEach(async () => {
    await wipeAll();
  });

  test('returns null and never prompts when no handler is provided', async () => {
    await seedOldDevice();
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, undefined);
    expect(result).toBeNull();
  });

  test('returns null and never prompts when migration is not needed', async () => {
    await seedOldDevice();
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const { handler, calls } = scriptedPrompt([{ action: 'migrate', oldPassphrase: OLD_PASSPHRASE }]);

    // No server-side passphrase change -> nothing to migrate.
    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, null, handler);

    expect(result).toBeNull();
    expect(calls.length).toBe(0);
  });

  test('does not prompt when the device already unlocked after the change', async () => {
    await seedOldDevice();
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    // Local unlock newer than the server change => already migrated.
    await setLastIdentityUnlockAt(IDENTITY, new Date('2999-02-01T00:00:00.000Z'));
    const { handler, calls } = scriptedPrompt([{ action: 'migrate', oldPassphrase: OLD_PASSPHRASE }]);

    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, handler);

    expect(result).toBeNull();
    expect(calls.length).toBe(0);
  });

  test('opt-out (skip) returns null and leaves old material untouched', async () => {
    const deviceId = await seedOldDevice();
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE);
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const { handler, calls } = scriptedPrompt([{ action: 'skip' }]);

    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, handler);

    expect(result).toBeNull();
    expect(calls.length).toBe(1);
    expect(calls[0]!.attempt).toBe(0);

    // Keys remain wrapped under the OLD key (caller will delete + regenerate).
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, oldKey);
    expect(decrypted.deviceId).toBe(deviceId);
  });

  test('correct old passphrase re-wraps keys, returns deviceId, and bumps unlock timestamp', async () => {
    const deviceId = await seedOldDevice();
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const { handler, calls } = scriptedPrompt([{ action: 'migrate', oldPassphrase: OLD_PASSPHRASE }]);

    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, handler);

    expect(result).toEqual({ deviceId });
    expect(calls.length).toBe(1);
    expect(calls[0]!.lastError).toBeUndefined();

    // Device keys now decrypt with the NEW key.
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, newKey);
    expect(decrypted.deviceId).toBe(deviceId);

    // The success path records that this device is now in sync.
    expect(await getLastIdentityUnlockAt(IDENTITY)).not.toBeNull();
  });

  test('wrong old passphrase retries with lastError, then succeeds', async () => {
    const deviceId = await seedOldDevice();
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const { handler, calls } = scriptedPrompt([
      { action: 'migrate', oldPassphrase: WRONG_PASSPHRASE },
      { action: 'migrate', oldPassphrase: OLD_PASSPHRASE },
    ]);

    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, handler);

    expect(result).toEqual({ deviceId });
    expect(calls.length).toBe(2);
    // First attempt has no prior error; the retry surfaces the wrong-passphrase.
    expect(calls[0]!.lastError).toBeUndefined();
    expect(calls[0]!.attempt).toBe(0);
    expect(calls[1]!.lastError).toBe('wrong-passphrase');
    expect(calls[1]!.attempt).toBe(1);

    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, newKey);
    expect(decrypted.deviceId).toBe(deviceId);
  });

  test('wrong old passphrase then skip bails out and leaves old material intact', async () => {
    const deviceId = await seedOldDevice();
    const oldKey = await deriveKeyFor(OLD_PASSPHRASE);
    const newKey = await deriveKeyFor(NEW_PASSPHRASE);
    const { handler, calls } = scriptedPrompt([
      { action: 'migrate', oldPassphrase: WRONG_PASSPHRASE },
      { action: 'skip' },
    ]);

    const result = await attemptPassphraseMigration(IDENTITY, NEW_PASSPHRASE, newKey, CHANGED_AT, handler);

    expect(result).toBeNull();
    expect(calls.length).toBe(2);
    expect(calls[1]!.lastError).toBe('wrong-passphrase');

    // Nothing was re-wrapped: old key still decrypts the device record.
    const stored = await getDeviceKeysForIdentity(IDENTITY);
    const decrypted = await decryptDeviceKeys(stored[0]!, oldKey);
    expect(decrypted.deviceId).toBe(deviceId);
    // And no success timestamp was recorded.
    expect(await getLastIdentityUnlockAt(IDENTITY)).toBeNull();
  });
});
