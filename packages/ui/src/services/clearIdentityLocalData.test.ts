/**
 * Tier-2 logout wipe regression tests.
 *
 * `clearIdentityLocalData` must remove every locally persisted secret and
 * cache for the targeted identity (device keys, pre-keys, session keys,
 * wrapping salt, unlock metadata, stored ciphers, TOFU verification records,
 * per-identity localStorage) while leaving other identities' scoped key
 * material intact.
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import { randomBytes, toBase64 } from '@adieuu/crypto';
import { clearIdentityLocalData } from './clearIdentityLocalData';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  getOrCreateWrappingSalt,
  getLastIdentityUnlockAt,
  setLastIdentityUnlockAt,
  clearAllDeviceKeys,
} from './deviceKeyStorage';
import {
  storeSignedPreKey,
  getActiveSignedPreKey,
  storeSessionKey,
  getPersistedSessionKey,
  clearAllPreKeys,
} from './preKeyStorage';
import { saveStoredCipher, getStoredCiphers } from './cipherStoreDb';
import {
  setDeviceSignatureVerification,
  getDeviceSignatureVerification,
} from './deviceSignatureVerificationStorage';
import type { StoredCipher } from '../hooks/useCipherStore';

const IDENTITY_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const IDENTITY_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
}

function makeStoredCipher(id: string, identityId: string): StoredCipher {
  return {
    id,
    name: `cipher-${id}`,
    identityId,
    encryptedEntropy: {
      ciphertext: toBase64(randomBytes(48)),
      nonce: toBase64(randomBytes(12)),
    },
    cipherId: `cid-${id}`,
    shortId: id.slice(0, 6),
    profile: 'default',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  } as StoredCipher;
}

describe('clearIdentityLocalData (tier-2 wipe)', () => {
  beforeEach(async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
      writable: true,
    });
    await clearAllDeviceKeys().catch(() => {});
    await clearAllPreKeys().catch(() => {});
  });

  test('wipes all identity-scoped stores', async () => {
    const deviceId = crypto.randomUUID();
    const wrappingKey = randomBytes(32);
    const messageId = crypto.randomUUID();
    const spkId = crypto.randomUUID();

    await storeDeviceKeys(deviceId, IDENTITY_A, randomBytes(32), randomBytes(2400), new Uint8Array(wrappingKey));
    await storeSignedPreKey(spkId, IDENTITY_A, deviceId, randomBytes(32), randomBytes(2400), new Uint8Array(wrappingKey));
    await storeSessionKey(messageId, IDENTITY_A, randomBytes(32), new Uint8Array(wrappingKey));
    const saltBefore = await getOrCreateWrappingSalt(IDENTITY_A);
    await setLastIdentityUnlockAt(IDENTITY_A);
    await saveStoredCipher(makeStoredCipher('cipher-a', IDENTITY_A));

    // Preconditions
    expect((await getDeviceKeysForIdentity(IDENTITY_A)).length).toBe(1);
    expect(await getActiveSignedPreKey(IDENTITY_A, deviceId)).not.toBeNull();
    expect(await getPersistedSessionKey(messageId, IDENTITY_A, new Uint8Array(wrappingKey))).not.toBeNull();
    expect(await getLastIdentityUnlockAt(IDENTITY_A)).not.toBeNull();
    expect((await getStoredCiphers(IDENTITY_A)).length).toBe(1);

    await clearIdentityLocalData(IDENTITY_A);

    expect((await getDeviceKeysForIdentity(IDENTITY_A)).length).toBe(0);
    expect(await getActiveSignedPreKey(IDENTITY_A, deviceId)).toBeNull();
    expect(await getPersistedSessionKey(messageId, IDENTITY_A, new Uint8Array(wrappingKey))).toBeNull();
    expect(await getLastIdentityUnlockAt(IDENTITY_A)).toBeNull();
    expect((await getStoredCiphers(IDENTITY_A)).length).toBe(0);

    // The Argon2id wrapping salt was deleted: a fresh one is generated on
    // next access and must differ from the pre-wipe salt.
    const saltAfter = await getOrCreateWrappingSalt(IDENTITY_A);
    expect(toBase64(saltAfter)).not.toBe(toBase64(saltBefore));
  });

  test('preserves other identities device keys and ciphers', async () => {
    const deviceA = crypto.randomUUID();
    const deviceB = crypto.randomUUID();
    const wrappingKey = randomBytes(32);

    await storeDeviceKeys(deviceA, IDENTITY_A, randomBytes(32), randomBytes(2400), new Uint8Array(wrappingKey));
    await storeDeviceKeys(deviceB, IDENTITY_B, randomBytes(32), randomBytes(2400), new Uint8Array(wrappingKey));
    await saveStoredCipher(makeStoredCipher('cipher-b', IDENTITY_B));

    await clearIdentityLocalData(IDENTITY_A);

    expect((await getDeviceKeysForIdentity(IDENTITY_A)).length).toBe(0);
    expect((await getDeviceKeysForIdentity(IDENTITY_B)).length).toBe(1);
    expect((await getStoredCiphers(IDENTITY_B)).length).toBe(1);
  });

  test('wipes TOFU device verification records', async () => {
    await setDeviceSignatureVerification('peer-1', 'device-1', 'FP-DISPLAY');
    expect(await getDeviceSignatureVerification('peer-1', 'device-1')).not.toBeNull();

    await clearIdentityLocalData(IDENTITY_A);

    expect(await getDeviceSignatureVerification('peer-1', 'device-1')).toBeNull();
  });

  test('removes per-identity and per-conversation localStorage keys', async () => {
    localStorage.setItem('adieuu-device-id', 'browser-id');
    localStorage.setItem(`adieuu-fs-config-${IDENTITY_A}`, 'true');
    localStorage.setItem(`adieuu-show-artifacts-${IDENTITY_A}`, 'true');
    localStorage.setItem('adieuu-conv-fs-conv1', 'true');
    localStorage.setItem('adieuu-conv-fs-conv2', 'false');
    localStorage.setItem('unrelated-key', 'keep-me');

    await clearIdentityLocalData(IDENTITY_A);

    expect(localStorage.getItem('adieuu-device-id')).toBeNull();
    expect(localStorage.getItem(`adieuu-fs-config-${IDENTITY_A}`)).toBeNull();
    expect(localStorage.getItem(`adieuu-show-artifacts-${IDENTITY_A}`)).toBeNull();
    expect(localStorage.getItem('adieuu-conv-fs-conv1')).toBeNull();
    expect(localStorage.getItem('adieuu-conv-fs-conv2')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
  });

  test('is idempotent: wiping an identity with no data does not throw', async () => {
    await clearIdentityLocalData('cccccccccccccccccccccccc');
    await clearIdentityLocalData('cccccccccccccccccccccccc');
  });
});
