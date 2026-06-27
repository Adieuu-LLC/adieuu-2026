/**
 * Phase 1 unit tests for the per-store passphrase re-wrap, probe, and
 * enumeration helpers that the migration orchestrator composes.
 *
 * These cover each helper in isolation, including the tolerant/idempotent
 * semantics (already-migrated records are skipped, undecryptable records are
 * left untouched) and the discovery primitives (decrypt-probe + identity
 * enumeration) that the orchestrator relies on.
 *
 * Real crypto, no mocks. Runs against fake-indexeddb (web backend).
 */
import { describe, expect, test, beforeEach } from 'bun:test';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  deviceKeysDecryptWith,
  getAllDeviceKeyIdentityIds,
  reWrapDeviceKeys,
  getOrCreateWrappingSalt,
} from './deviceKeyStorage';
import {
  storeSignedPreKey,
  getActiveSignedPreKey,
  decryptSignedPreKey,
  storeOneTimePreKeys,
  findAndDecryptOneTimePreKey,
  storeSessionKey,
  getPersistedSessionKey,
  reWrapSignedPreKeys,
  reWrapOneTimePreKeys,
  reWrapSessionKeys,
  preKeysDecryptWith,
  getAllPreKeyIdentityIds,
} from './preKeyStorage';
import {
  reWrapCipher,
  reWrapAllCiphers,
  cipherEntropyDecryptsWith,
  getAllCipherIdentityIds,
} from './cipherStoreOperations';
import { saveStoredCipher, getStoredCiphers } from './cipherStoreDb';
import type { StoredCipher } from '../hooks/useCipherStore';
import {
  randomBytes,
  deriveEntropyWrappingKey,
  wrapEntropy,
  unwrapEntropy,
  type EntropyPiece,
} from '@adieuu/crypto';

const OLD_PASSPHRASE = 'old-secret-passphrase-2024';
const NEW_PASSPHRASE = 'new-secret-passphrase-2025';
const ENTROPY: EntropyPiece[] = [{ type: 'text', value: 'unit-helper-entropy' }];

const DB_NAMES = [
  'adieuu-device-keys',
  'adieuu-pre-keys',
  'adieuu-session-keys',
  'adieuu-wrapping-keys',
  'adieuu-ciphers',
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

async function keyFor(passphrase: string, identityId: string): Promise<Uint8Array> {
  const salt = await getOrCreateWrappingSalt(identityId);
  return deriveEntropyWrappingKey(passphrase, salt);
}

async function makeCipher(identityId: string, wrappingKey: Uint8Array, salt: Uint8Array): Promise<string> {
  const id = crypto.randomUUID();
  const cipher: StoredCipher = {
    id,
    name: 'c',
    identityId,
    encryptedEntropy: await wrapEntropy(ENTROPY, wrappingKey, salt),
    cipherId: 'cid-' + id.slice(0, 8),
    shortId: id.slice(0, 6),
    profile: 'default',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };
  await saveStoredCipher(cipher);
  return id;
}

describe('deviceKeyStorage re-wrap/probe/enumerate helpers', () => {
  beforeEach(async () => { await wipeAll(); });

  test('reWrapDeviceKeys is idempotent on a second run', async () => {
    const id = 'dev-idem';
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const newKey = await keyFor(NEW_PASSPHRASE, id);
    await storeDeviceKeys(crypto.randomUUID(), id, randomBytes(32), randomBytes(2400), oldKey);

    expect(await reWrapDeviceKeys(id, oldKey, newKey)).toBe(1);
    // Second run: already migrated -> nothing to do.
    expect(await reWrapDeviceKeys(id, oldKey, newKey)).toBe(0);

    const stored = await getDeviceKeysForIdentity(id);
    const dec = await decryptDeviceKeys(stored[0]!, newKey);
    expect(dec.ecdhPrivateKey.length).toBe(32);
  });

  test('reWrapDeviceKeys skips records that decrypt with neither key', async () => {
    const id = 'dev-skip';
    const realKey = await keyFor(OLD_PASSPHRASE, id);
    await storeDeviceKeys(crypto.randomUUID(), id, randomBytes(32), randomBytes(2400), realKey);

    const wrongOld = randomBytes(32);
    const unrelatedNew = randomBytes(32);
    expect(await reWrapDeviceKeys(id, wrongOld, unrelatedNew)).toBe(0);

    // Still readable with the original key — untouched.
    const stored = await getDeviceKeysForIdentity(id);
    const dec = await decryptDeviceKeys(stored[0]!, realKey);
    expect(dec.ecdhPrivateKey.length).toBe(32);
  });

  test('deviceKeysDecryptWith returns null/true/false correctly', async () => {
    const id = 'dev-probe';
    const key = await keyFor(OLD_PASSPHRASE, id);
    expect(await deviceKeysDecryptWith(id, key)).toBeNull();

    await storeDeviceKeys(crypto.randomUUID(), id, randomBytes(32), randomBytes(2400), key);
    expect(await deviceKeysDecryptWith(id, key)).toBe(true);
    expect(await deviceKeysDecryptWith(id, randomBytes(32))).toBe(false);
  });

  test('getAllDeviceKeyIdentityIds enumerates every identity with device keys', async () => {
    const a = 'dev-enum-a';
    const b = 'dev-enum-b';
    await storeDeviceKeys(crypto.randomUUID(), a, randomBytes(32), randomBytes(2400), await keyFor(OLD_PASSPHRASE, a));
    await storeDeviceKeys(crypto.randomUUID(), b, randomBytes(32), randomBytes(2400), await keyFor(OLD_PASSPHRASE, b));

    const ids = await getAllDeviceKeyIdentityIds();
    expect(new Set(ids)).toEqual(new Set([a, b]));
  });
});

describe('preKeyStorage re-wrap/probe/enumerate helpers', () => {
  beforeEach(async () => { await wipeAll(); });

  test('reWrapSignedPreKeys round-trips and is idempotent', async () => {
    const id = 'spk-rt';
    const deviceId = crypto.randomUUID();
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const newKey = await keyFor(NEW_PASSPHRASE, id);
    const spkId = crypto.randomUUID();
    await storeSignedPreKey(spkId, id, deviceId, randomBytes(32), randomBytes(2400), oldKey);

    expect(await reWrapSignedPreKeys(id, oldKey, newKey)).toBe(1);
    expect(await reWrapSignedPreKeys(id, oldKey, newKey)).toBe(0);

    const spk = await getActiveSignedPreKey(id, deviceId);
    const dec = await decryptSignedPreKey(spk!, newKey);
    expect(dec.ecdhPrivateKey.length).toBe(32);
  });

  test('reWrapOneTimePreKeys round-trips and is idempotent', async () => {
    const id = 'otpk-rt';
    const deviceId = crypto.randomUUID();
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const newKey = await keyFor(NEW_PASSPHRASE, id);
    const otpkId = crypto.randomUUID();
    await storeOneTimePreKeys(
      [{ keyId: otpkId, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      id,
      deviceId,
      oldKey,
    );

    expect(await reWrapOneTimePreKeys(id, oldKey, newKey)).toBe(1);
    expect(await reWrapOneTimePreKeys(id, oldKey, newKey)).toBe(0);

    const otpk = await findAndDecryptOneTimePreKey(otpkId, id, newKey);
    expect(otpk).not.toBeNull();
    expect(otpk!.ecdhPrivateKey.length).toBe(32);
  });

  test('reWrapSessionKeys round-trips and is idempotent', async () => {
    const id = 'sk-rt';
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const newKey = await keyFor(NEW_PASSPHRASE, id);
    const msgId = crypto.randomUUID();
    await storeSessionKey(msgId, id, randomBytes(32), oldKey);

    expect(await reWrapSessionKeys(id, oldKey, newKey)).toBe(1);
    expect(await reWrapSessionKeys(id, oldKey, newKey)).toBe(0);

    const sk = await getPersistedSessionKey(msgId, id, newKey);
    expect(sk).not.toBeNull();
    expect(sk!.length).toBe(32);
    // Old key no longer reads it (getPersistedSessionKey swallows the failure -> null).
    expect(await getPersistedSessionKey(msgId, id, oldKey)).toBeNull();
  });

  test('preKeysDecryptWith returns null/true/false across categories', async () => {
    const id = 'pk-probe';
    const deviceId = crypto.randomUUID();
    const key = await keyFor(OLD_PASSPHRASE, id);
    expect(await preKeysDecryptWith(id, key)).toBeNull();

    // Only a session key present -> still detectable.
    await storeSessionKey(crypto.randomUUID(), id, randomBytes(32), key);
    expect(await preKeysDecryptWith(id, key)).toBe(true);
    expect(await preKeysDecryptWith(id, randomBytes(32))).toBe(false);

    // Add an SPK too; still true with the right key.
    await storeSignedPreKey(crypto.randomUUID(), id, deviceId, randomBytes(32), randomBytes(2400), key);
    expect(await preKeysDecryptWith(id, key)).toBe(true);
  });

  test('getAllPreKeyIdentityIds enumerates SPK and OTPK owners', async () => {
    const a = 'pk-enum-a';
    const b = 'pk-enum-b';
    await storeSignedPreKey(crypto.randomUUID(), a, crypto.randomUUID(), randomBytes(32), randomBytes(2400), await keyFor(OLD_PASSPHRASE, a));
    await storeOneTimePreKeys(
      [{ keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      b,
      crypto.randomUUID(),
      await keyFor(OLD_PASSPHRASE, b),
    );

    const ids = await getAllPreKeyIdentityIds();
    expect(new Set(ids)).toEqual(new Set([a, b]));
  });
});

describe('cipher re-wrap/probe/enumerate helpers', () => {
  beforeEach(async () => { await wipeAll(); });

  test('reWrapCipher round-trips a single cipher', async () => {
    const id = 'cipher-direct';
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const salt = await getOrCreateWrappingSalt(id);
    const newKey = await deriveEntropyWrappingKey(NEW_PASSPHRASE, salt);
    const cipherId = await makeCipher(id, oldKey, salt);

    const stored = (await getStoredCiphers(id)).find((c) => c.id === cipherId)!;
    const rewrapped = await reWrapCipher(stored, oldKey, newKey, salt);
    const entropy = await unwrapEntropy(rewrapped.encryptedEntropy, newKey);
    expect(entropy[0]!.value).toBe(ENTROPY[0]!.value);
  });

  test('reWrapAllCiphers re-wraps all, is idempotent, and skips foreign ciphers', async () => {
    const id = 'cipher-bulk';
    const oldKey = await keyFor(OLD_PASSPHRASE, id);
    const salt = await getOrCreateWrappingSalt(id);
    const newKey = await deriveEntropyWrappingKey(NEW_PASSPHRASE, salt);

    await makeCipher(id, oldKey, salt);
    await makeCipher(id, oldKey, salt);
    // A cipher wrapped with an unrelated key -> decryptable with neither old nor new.
    const foreignKey = randomBytes(32);
    const foreignId = await makeCipher(id, foreignKey, salt);

    expect(await reWrapAllCiphers(id, oldKey, newKey, salt)).toBe(2);
    // Idempotent second run.
    expect(await reWrapAllCiphers(id, oldKey, newKey, salt)).toBe(0);

    const ciphers = await getStoredCiphers(id);
    for (const c of ciphers) {
      if (c.id === foreignId) {
        // Untouched: still readable only with its foreign key.
        const e = await unwrapEntropy(c.encryptedEntropy, foreignKey);
        expect(e[0]!.value).toBe(ENTROPY[0]!.value);
      } else {
        const e = await unwrapEntropy(c.encryptedEntropy, newKey);
        expect(e[0]!.value).toBe(ENTROPY[0]!.value);
      }
    }
  });

  test('cipherEntropyDecryptsWith returns null/true/false', async () => {
    const id = 'cipher-probe';
    const key = await keyFor(OLD_PASSPHRASE, id);
    const salt = await getOrCreateWrappingSalt(id);
    expect(await cipherEntropyDecryptsWith(id, key)).toBeNull();

    await makeCipher(id, key, salt);
    expect(await cipherEntropyDecryptsWith(id, key)).toBe(true);
    expect(await cipherEntropyDecryptsWith(id, randomBytes(32))).toBe(false);
  });

  test('getAllCipherIdentityIds enumerates cipher owners', async () => {
    const a = 'cipher-enum-a';
    const b = 'cipher-enum-b';
    await makeCipher(a, await keyFor(OLD_PASSPHRASE, a), await getOrCreateWrappingSalt(a));
    await makeCipher(b, await keyFor(OLD_PASSPHRASE, b), await getOrCreateWrappingSalt(b));

    const ids = await getAllCipherIdentityIds();
    expect(new Set(ids)).toEqual(new Set([a, b]));
  });
});
