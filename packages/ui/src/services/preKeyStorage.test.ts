import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from '@adieuu/crypto';
import {
  clearAllPreKeys,
  deleteAllPreKeysForIdentity,
  deleteOneTimePreKey,
  findAndDecryptOneTimePreKey,
  getActiveSignedPreKey,
  getOneTimePreKeyCount,
  getRetiredSignedPreKeys,
  retireSignedPreKey,
  storeOneTimePreKeys,
  storeSignedPreKey,
} from './preKeyStorage';

describe('services/preKeyStorage', () => {
  const identityId = 'identity-prekeys-test';
  const deviceId = 'device-prekeys-test';
  const wrappingKey = randomBytes(32);

  beforeEach(async () => {
    await clearAllPreKeys();
  });

  afterEach(async () => {
    await clearAllPreKeys();
  });

  test('stores and retrieves active signed pre-key', async () => {
    const ecdhPrivate = randomBytes(32);
    const kemPrivate = randomBytes(2400);
    const keyId = crypto.randomUUID();

    await storeSignedPreKey(
      keyId,
      identityId,
      deviceId,
      ecdhPrivate,
      kemPrivate,
      wrappingKey
    );

    // Original key material should be cleared.
    expect(ecdhPrivate.every((b) => b === 0)).toBe(true);
    expect(kemPrivate.every((b) => b === 0)).toBe(true);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active).not.toBeNull();
    expect(active?.keyId).toBe(keyId);
    expect(active?.status).toBe('active');
  });

  test('retires signed pre-key and lists it as retired', async () => {
    const keyId = crypto.randomUUID();

    await storeSignedPreKey(
      keyId,
      identityId,
      deviceId,
      randomBytes(32),
      randomBytes(2400),
      wrappingKey
    );
    await retireSignedPreKey(keyId, identityId);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active).toBeNull();

    const retired = await getRetiredSignedPreKeys(identityId, deviceId);
    expect(retired.length).toBe(1);
    expect(retired[0]?.keyId).toBe(keyId);
    expect(retired[0]?.status).toBe('retired');
    expect(retired[0]?.retiredAt).toBeDefined();
  });

  test('stores, decrypts, counts, and deletes one-time pre-keys', async () => {
    const keyA = crypto.randomUUID();
    const keyB = crypto.randomUUID();
    const ecdhA = randomBytes(32);
    const kemA = randomBytes(2400);
    const ecdhB = randomBytes(32);
    const kemB = randomBytes(2400);

    const expectedEcdhA = new Uint8Array(ecdhA);
    const expectedKemA = new Uint8Array(kemA);

    await storeOneTimePreKeys(
      [
        { keyId: keyA, ecdhPrivateKey: ecdhA, kemPrivateKey: kemA },
        { keyId: keyB, ecdhPrivateKey: ecdhB, kemPrivateKey: kemB },
      ],
      identityId,
      deviceId,
      wrappingKey
    );

    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(2);

    const decryptedA = await findAndDecryptOneTimePreKey(keyA, identityId, wrappingKey);
    expect(decryptedA).not.toBeNull();
    expect(decryptedA?.ecdhPrivateKey).toEqual(expectedEcdhA);
    expect(decryptedA?.kemPrivateKey).toEqual(expectedKemA);

    await deleteOneTimePreKey(keyA, identityId);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(1);
    expect(await findAndDecryptOneTimePreKey(keyA, identityId, wrappingKey)).toBeNull();
  });

  test('deletes all pre-keys for an identity', async () => {
    await storeSignedPreKey(
      crypto.randomUUID(),
      identityId,
      deviceId,
      randomBytes(32),
      randomBytes(2400),
      wrappingKey
    );
    await storeOneTimePreKeys(
      [{ keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId,
      deviceId,
      wrappingKey
    );

    await deleteAllPreKeysForIdentity(identityId);

    expect(await getActiveSignedPreKey(identityId, deviceId)).toBeNull();
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(0);
  });
});

