import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from '@adieuu/crypto';
import {
  clearAllPreKeys,
  clearOneTimePreKeysExcept,
  clearOneTimePreKeysForDevice,
  deleteAllPreKeysForIdentity,
  deleteOneTimePreKey,
  deleteSignedPreKey,
  findAndDecryptOneTimePreKey,
  findAndDecryptSignedPreKey,
  getActiveSignedPreKey,
  getOneTimePreKeyCount,
  getOneTimePreKeyIds,
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

  // ---- getOneTimePreKeyIds ----

  test('getOneTimePreKeyIds returns sorted key IDs', async () => {
    const keyC = 'cccccccc-0000-4000-8000-000000000000';
    const keyA = 'aaaaaaaa-0000-4000-8000-000000000000';
    const keyB = 'bbbbbbbb-0000-4000-8000-000000000000';

    await storeOneTimePreKeys(
      [
        { keyId: keyC, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: keyA, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: keyB, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
      ],
      identityId,
      deviceId,
      wrappingKey
    );

    const ids = await getOneTimePreKeyIds(identityId, deviceId);
    expect(ids).toEqual([keyA, keyB, keyC]);
  });

  test('getOneTimePreKeyIds returns empty array when no OTPKs exist', async () => {
    const ids = await getOneTimePreKeyIds(identityId, deviceId);
    expect(ids).toEqual([]);
  });

  test('getOneTimePreKeyIds does not include OTPKs from other devices', async () => {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();

    await storeOneTimePreKeys(
      [{ keyId: key1, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId,
      deviceId,
      wrappingKey
    );
    await storeOneTimePreKeys(
      [{ keyId: key2, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId,
      'other-device',
      wrappingKey
    );

    const ids = await getOneTimePreKeyIds(identityId, deviceId);
    expect(ids).toEqual([key1]);
  });

  // ---- clearOneTimePreKeysExcept ----

  test('clearOneTimePreKeysExcept keeps only specified keys', async () => {
    const keepKey = crypto.randomUUID();
    const removeKey = crypto.randomUUID();

    await storeOneTimePreKeys(
      [
        { keyId: keepKey, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: removeKey, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
      ],
      identityId,
      deviceId,
      wrappingKey
    );

    const removed = await clearOneTimePreKeysExcept(identityId, deviceId, [keepKey]);
    expect(removed).toBe(1);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(1);
    expect(await findAndDecryptOneTimePreKey(keepKey, identityId, wrappingKey)).not.toBeNull();
    expect(await findAndDecryptOneTimePreKey(removeKey, identityId, wrappingKey)).toBeNull();
  });

  test('clearOneTimePreKeysExcept with empty keep list removes all', async () => {
    await storeOneTimePreKeys(
      [
        { keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
      ],
      identityId,
      deviceId,
      wrappingKey
    );

    const removed = await clearOneTimePreKeysExcept(identityId, deviceId, []);
    expect(removed).toBe(2);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(0);
  });

  test('clearOneTimePreKeysExcept with all keys in keep list removes none', async () => {
    const key1 = crypto.randomUUID();
    const key2 = crypto.randomUUID();

    await storeOneTimePreKeys(
      [
        { keyId: key1, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: key2, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
      ],
      identityId,
      deviceId,
      wrappingKey
    );

    const removed = await clearOneTimePreKeysExcept(identityId, deviceId, [key1, key2]);
    expect(removed).toBe(0);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(2);
  });

  test('clearOneTimePreKeysExcept preserves signed pre-keys', async () => {
    const spkId = crypto.randomUUID();

    await storeSignedPreKey(spkId, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);
    await storeOneTimePreKeys(
      [{ keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId,
      deviceId,
      wrappingKey
    );

    await clearOneTimePreKeysExcept(identityId, deviceId, []);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active).not.toBeNull();
    expect(active?.keyId).toBe(spkId);
  });

  // ---- findAndDecryptSignedPreKey ----

  test('findAndDecryptSignedPreKey returns decrypted private keys for stored SPK', async () => {
    const keyId = crypto.randomUUID();
    const ecdhPriv = randomBytes(32);
    const kemPriv = randomBytes(2400);
    const expectedEcdh = new Uint8Array(ecdhPriv);
    const expectedKem = new Uint8Array(kemPriv);

    await storeSignedPreKey(keyId, identityId, deviceId, ecdhPriv, kemPriv, wrappingKey);

    const result = await findAndDecryptSignedPreKey(keyId, identityId, wrappingKey);
    expect(result).not.toBeNull();
    expect(result?.ecdhPrivateKey).toEqual(expectedEcdh);
    expect(result?.kemPrivateKey).toEqual(expectedKem);
  });

  test('findAndDecryptSignedPreKey returns null for non-existent keyId', async () => {
    const result = await findAndDecryptSignedPreKey('nonexistent-key', identityId, wrappingKey);
    expect(result).toBeNull();
  });

  test('findAndDecryptSignedPreKey returns null when identity has no keys', async () => {
    const result = await findAndDecryptSignedPreKey(crypto.randomUUID(), 'no-such-identity', wrappingKey);
    expect(result).toBeNull();
  });

  // ---- deleteSignedPreKey ----

  test('deleteSignedPreKey removes SPK so it cannot be retrieved', async () => {
    const keyId = crypto.randomUUID();
    await storeSignedPreKey(keyId, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);

    await deleteSignedPreKey(keyId, identityId);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active).toBeNull();
  });

  test('deleteSignedPreKey no-ops gracefully for non-existent keyId', async () => {
    await expect(deleteSignedPreKey('nonexistent', identityId)).resolves.toBeUndefined();
  });

  test('deleteSignedPreKey does not affect other SPKs or OTPKs', async () => {
    const spk1 = crypto.randomUUID();
    const spk2 = crypto.randomUUID();
    const otpkId = crypto.randomUUID();

    await storeSignedPreKey(spk1, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);
    await retireSignedPreKey(spk1, identityId);
    await storeSignedPreKey(spk2, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);
    await storeOneTimePreKeys(
      [{ keyId: otpkId, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId, deviceId, wrappingKey
    );

    await deleteSignedPreKey(spk1, identityId);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active?.keyId).toBe(spk2);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(1);
  });

  // ---- clearOneTimePreKeysForDevice ----

  test('clearOneTimePreKeysForDevice removes all OTPKs for a device', async () => {
    await storeOneTimePreKeys(
      [
        { keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
        { keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) },
      ],
      identityId, deviceId, wrappingKey
    );

    const removed = await clearOneTimePreKeysForDevice(identityId, deviceId);
    expect(removed).toBe(2);
    expect(await getOneTimePreKeyCount(identityId, deviceId)).toBe(0);
  });

  test('clearOneTimePreKeysForDevice preserves SPKs', async () => {
    const spkId = crypto.randomUUID();
    await storeSignedPreKey(spkId, identityId, deviceId, randomBytes(32), randomBytes(2400), wrappingKey);
    await storeOneTimePreKeys(
      [{ keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId, deviceId, wrappingKey
    );

    await clearOneTimePreKeysForDevice(identityId, deviceId);

    const active = await getActiveSignedPreKey(identityId, deviceId);
    expect(active?.keyId).toBe(spkId);
  });

  test('clearOneTimePreKeysForDevice preserves OTPKs belonging to other devices', async () => {
    const otherDevice = 'other-device';
    const otherKey = crypto.randomUUID();

    await storeOneTimePreKeys(
      [{ keyId: crypto.randomUUID(), ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId, deviceId, wrappingKey
    );
    await storeOneTimePreKeys(
      [{ keyId: otherKey, ecdhPrivateKey: randomBytes(32), kemPrivateKey: randomBytes(2400) }],
      identityId, otherDevice, wrappingKey
    );

    await clearOneTimePreKeysForDevice(identityId, deviceId);

    expect(await getOneTimePreKeyCount(identityId, otherDevice)).toBe(1);
  });

  test('clearOneTimePreKeysForDevice returns 0 when device has no OTPKs', async () => {
    const removed = await clearOneTimePreKeysForDevice(identityId, deviceId);
    expect(removed).toBe(0);
  });
});

