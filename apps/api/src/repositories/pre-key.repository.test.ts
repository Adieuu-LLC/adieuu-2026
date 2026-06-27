import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { CONSUMED_OTPK_TTL_DAYS } from '../models/pre-key';

mock.module('../config', () => ({
  config: {
    env: 'test',
    mongodb: { uri: 'mongodb://localhost:27017', dbName: 'test' },
    redis: { url: 'redis://localhost:6379' },
  },
}));

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyMock = ReturnType<typeof mock<(...args: any[]) => any>>;

const mockToArray = mock(() => Promise.resolve([])) as AnyMock;
const mockProject = mock(() => ({ toArray: mockToArray }));
const mockFind = mock(() => ({ project: mockProject }));

const mockCollection = {
  updateMany: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  insertMany: mock(() => Promise.resolve({ insertedCount: 0 })) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
  countDocuments: mock(() => Promise.resolve(0)) as AnyMock,
  deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
  find: mockFind as AnyMock,
};
/* eslint-enable @typescript-eslint/no-explicit-any */

mock.module('../db', () => ({
  getCollection: mock(() => mockCollection),
  Collections: {
    PRE_KEYS: 'pre_keys',
  },
}));

import { PreKeyRepository } from './pre-key.repository';

describe('PreKeyRepository', () => {
  afterAll(() => {
    mock.restore();
  });

  let repo: PreKeyRepository;
  const identityId = new ObjectId();
  const deviceId = 'device-1';

  beforeEach(() => {
    repo = new PreKeyRepository();

    mockCollection.updateMany.mockReset();
    mockCollection.insertOne.mockReset();
    mockCollection.insertMany.mockReset();
    mockCollection.findOne.mockReset();
    mockCollection.findOneAndUpdate.mockReset();
    mockCollection.countDocuments.mockReset();
    mockCollection.deleteMany.mockReset();
    mockFind.mockReset();
    mockProject.mockReset();
    mockToArray.mockReset();

    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 0 });
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOneAndUpdate.mockResolvedValue(null);
    mockCollection.countDocuments.mockResolvedValue(0);
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    mockToArray.mockResolvedValue([]);
    mockProject.mockReturnValue({ toArray: mockToArray });
    mockFind.mockReturnValue({ project: mockProject });
  });

  test('claimOneTimePreKey uses consumed=false filter and returnDocument=before', async () => {
    const claimed = {
      _id: new ObjectId(),
      identityId,
      deviceId,
      keyType: 'one-time',
      keyId: 'otpk-1',
      ecdhPublicKey: 'ecdh',
      kemPublicKey: 'kem',
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCollection.findOneAndUpdate.mockResolvedValue(claimed);

    const result = await repo.claimOneTimePreKey(identityId, deviceId);

    expect(result?.keyId).toBe('otpk-1');
    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'one-time',
        consumed: false,
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          consumed: true,
          consumedAt: expect.any(Date),
          expiresAt: expect.any(Date),
        }),
      }),
      { returnDocument: 'before' }
    );
  });

  test('claimOneTimePreKey sets OTPK cleanup expiry near configured TTL', async () => {
    mockCollection.findOneAndUpdate.mockResolvedValue(null);
    const before = Date.now();
    await repo.claimOneTimePreKey(identityId, deviceId);
    const after = Date.now();

    const updateArg = mockCollection.findOneAndUpdate.mock.calls[0]?.[1] as
      | { $set?: { expiresAt?: Date } }
      | undefined;
    const expiresAt = updateArg?.$set?.expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);

    const ttlMs = CONSUMED_OTPK_TTL_DAYS * 24 * 60 * 60 * 1000;
    const minExpected = before + ttlMs;
    const maxExpected = after + ttlMs;
    const actual = (expiresAt as Date).getTime();
    expect(actual).toBeGreaterThanOrEqual(minExpected);
    expect(actual).toBeLessThanOrEqual(maxExpected);
  });

  test('storeSignedPreKey expires older signed keys before insert', async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const inserted = {
      _id: new ObjectId(),
      identityId,
      deviceId,
      keyType: 'signed',
      keyId: 'spk-new',
      ecdhPublicKey: 'ecdh',
      kemPublicKey: 'kem',
      signature: 'sig',
      consumed: false,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockCollection.insertOne.mockResolvedValue({ insertedId: inserted._id });

    await repo.storeSignedPreKey({
      identityId,
      deviceId,
      keyId: 'spk-new',
      ecdhPublicKey: 'ecdh',
      kemPublicKey: 'kem',
      signature: 'sig',
      expiresAt,
    });

    expect(mockCollection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'signed',
      }),
      expect.objectContaining({
        $set: expect.objectContaining({
          expiresAt: expect.any(Date),
        }),
      })
    );
  });

  test('concurrent claims consume distinct OTPKs and then exhaust', async () => {
    const available = [
      { keyId: 'otpk-1' },
      { keyId: 'otpk-2' },
    ];

    mockCollection.findOneAndUpdate.mockImplementation(async () => {
      const next = available.shift();
      if (!next) return null;
      return {
        _id: new ObjectId(),
        identityId,
        deviceId,
        keyType: 'one-time',
        keyId: next.keyId,
        ecdhPublicKey: 'ecdh',
        kemPublicKey: 'kem',
        consumed: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    const [first, second] = await Promise.all([
      repo.claimOneTimePreKey(identityId, deviceId),
      repo.claimOneTimePreKey(identityId, deviceId),
    ]);
    const third = await repo.claimOneTimePreKey(identityId, deviceId);

    expect(first?.keyId).not.toBe(second?.keyId);
    expect(new Set([first?.keyId, second?.keyId]).size).toBe(2);
    expect(third).toBeNull();
  });

  test('claimPreKeysForAllDevices returns partial availability per device in request order', async () => {
    const requestedDeviceIds = ['device-a', 'device-b'];

    mockCollection.findOne.mockImplementation(async (filter: { deviceId: string; keyType: string }) => {
      if (filter.keyType !== 'signed') return null;
      if (filter.deviceId === 'device-a') {
        return {
          _id: new ObjectId(),
          identityId,
          deviceId: 'device-a',
          keyType: 'signed',
          keyId: 'spk-a',
          ecdhPublicKey: 'spk-ecdh-a',
          kemPublicKey: 'spk-kem-a',
          signature: 'spk-sig-a',
          consumed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        };
      }
      if (filter.deviceId === 'device-b') {
        return {
          _id: new ObjectId(),
          identityId,
          deviceId: 'device-b',
          keyType: 'signed',
          keyId: 'spk-b',
          ecdhPublicKey: 'spk-ecdh-b',
          kemPublicKey: 'spk-kem-b',
          signature: 'spk-sig-b',
          consumed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
        };
      }
      return null;
    });

    mockCollection.findOneAndUpdate.mockImplementation(async (filter: { deviceId: string; keyType: string }) => {
      if (filter.keyType !== 'one-time') return null;
      if (filter.deviceId === 'device-a') {
        return {
          _id: new ObjectId(),
          identityId,
          deviceId: 'device-a',
          keyType: 'one-time',
          keyId: 'otpk-a',
          ecdhPublicKey: 'otpk-ecdh-a',
          kemPublicKey: 'otpk-kem-a',
          consumed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      // device-b intentionally has no available OTPK to assert SPK-only fallback.
      return null;
    });

    const results = await repo.claimPreKeysForAllDevices(identityId, requestedDeviceIds);

    expect(results.map((r) => r.deviceId)).toEqual(requestedDeviceIds);
    expect(results[0]?.signedPreKey?.keyId).toBe('spk-a');
    expect(results[0]?.oneTimePreKey?.keyId).toBe('otpk-a');
    expect(results[1]?.signedPreKey?.keyId).toBe('spk-b');
    expect(results[1]?.oneTimePreKey).toBeNull();
  });

  test('claimPreKeysForAllDevices processes devices concurrently', async () => {
    let activeCalls = 0;
    let maxConcurrentCalls = 0;

    const trackConcurrency = async () => {
      activeCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, activeCalls);
      await new Promise((r) => setTimeout(r, 10));
      activeCalls--;
      return null;
    };

    mockCollection.findOne.mockImplementation(trackConcurrency);
    mockCollection.findOneAndUpdate.mockImplementation(trackConcurrency);

    await repo.claimPreKeysForAllDevices(identityId, ['dev-1', 'dev-2', 'dev-3']);

    // Sequential per-device processing would max at 2 concurrent calls (inner Promise.all).
    // Cross-device parallelism pushes this higher (up to 6 with 3 devices x 2 calls each).
    expect(maxConcurrentCalls).toBeGreaterThan(2);
  });

  test('claimPreKeysForAllDevices omits signedPreKey when signature is missing', async () => {
    mockCollection.findOne.mockResolvedValue({
      _id: new ObjectId(),
      identityId,
      deviceId,
      keyType: 'signed',
      keyId: 'spk-unsigned',
      ecdhPublicKey: 'spk-ecdh',
      kemPublicKey: 'spk-kem',
      // signature intentionally missing
      consumed: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    mockCollection.findOneAndUpdate.mockResolvedValue(null);

    const [result] = await repo.claimPreKeysForAllDevices(identityId, [deviceId]);

    expect(result?.deviceId).toBe(deviceId);
    expect(result?.signedPreKey).toBeNull();
    expect(result?.oneTimePreKey).toBeNull();
  });

  // ---- getUnconsumedOtpkDigest ----

  test('getUnconsumedOtpkDigest returns stable digest for given key IDs regardless of DB order', async () => {
    mockToArray.mockResolvedValue([
      { keyId: 'bbb' },
      { keyId: 'aaa' },
      { keyId: 'ccc' },
    ]);

    const digest1 = await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    mockToArray.mockResolvedValue([
      { keyId: 'ccc' },
      { keyId: 'aaa' },
      { keyId: 'bbb' },
    ]);

    const digest2 = await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    expect(digest1).toBe(digest2);
    expect(digest1).toHaveLength(64);
  });

  test('getUnconsumedOtpkDigest returns empty sentinel when no OTPKs exist', async () => {
    mockToArray.mockResolvedValue([]);

    const digest = await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    expect(digest).toHaveLength(64);
    // SHA-256 of empty string is well-known
    expect(digest).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  test('getUnconsumedOtpkDigest changes when a key is added', async () => {
    mockToArray.mockResolvedValue([{ keyId: 'aaa' }]);
    const digest1 = await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    mockToArray.mockResolvedValue([{ keyId: 'aaa' }, { keyId: 'bbb' }]);
    const digest2 = await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    expect(digest1).not.toBe(digest2);
  });

  test('getUnconsumedOtpkDigest queries with correct filter and projection', async () => {
    mockToArray.mockResolvedValue([]);

    await repo.getUnconsumedOtpkDigest(identityId, deviceId);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'one-time',
        consumed: false,
      })
    );
    expect(mockProject).toHaveBeenCalledWith({ keyId: 1, _id: 0 });
  });

  // ---- getConsumedOtpkKeyIds ----

  test('getConsumedOtpkKeyIds returns consumed non-expired OTPK key IDs', async () => {
    mockToArray.mockResolvedValue([
      { keyId: 'consumed-1' },
      { keyId: 'consumed-2' },
    ]);

    const ids = await repo.getConsumedOtpkKeyIds(identityId, deviceId);

    expect(ids).toEqual(['consumed-1', 'consumed-2']);
  });

  test('getConsumedOtpkKeyIds returns empty array when none exist', async () => {
    mockToArray.mockResolvedValue([]);

    const ids = await repo.getConsumedOtpkKeyIds(identityId, deviceId);

    expect(ids).toEqual([]);
  });

  test('getConsumedOtpkKeyIds queries with consumed=true and expiresAt > now', async () => {
    mockToArray.mockResolvedValue([]);
    const before = new Date();

    await repo.getConsumedOtpkKeyIds(identityId, deviceId);

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'one-time',
        consumed: true,
        expiresAt: { $gt: expect.any(Date) },
      })
    );

    const calls = mockFind.mock.calls as unknown as Array<[{ expiresAt: { $gt: Date } }]>;
    const filterArg = calls[0]?.[0];
    const expiry = filterArg?.expiresAt.$gt;
    expect(expiry!.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  // ---- storeOneTimePreKeys ----

  test('storeOneTimePreKeys calls insertMany with timestamped docs', async () => {
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });

    await repo.storeOneTimePreKeys([
      { identityId, deviceId, keyId: 'otpk-1', ecdhPublicKey: 'ecdh-1', kemPublicKey: 'kem-1' },
      { identityId, deviceId, keyId: 'otpk-2', ecdhPublicKey: 'ecdh-2', kemPublicKey: 'kem-2' },
    ]);

    expect(mockCollection.insertMany).toHaveBeenCalledTimes(1);
    const insertedDocs = mockCollection.insertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(insertedDocs?.length).toBe(2);
    expect(insertedDocs?.[0]?.keyType).toBe('one-time');
    expect(insertedDocs?.[0]?.consumed).toBe(false);
    expect(insertedDocs?.[0]?.createdAt).toBeInstanceOf(Date);
    expect(insertedDocs?.[0]?.updatedAt).toBeInstanceOf(Date);
  });

  test('storeOneTimePreKeys returns inserted count', async () => {
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 3 });

    const count = await repo.storeOneTimePreKeys([
      { identityId, deviceId, keyId: 'otpk-1', ecdhPublicKey: 'ecdh', kemPublicKey: 'kem' },
      { identityId, deviceId, keyId: 'otpk-2', ecdhPublicKey: 'ecdh', kemPublicKey: 'kem' },
      { identityId, deviceId, keyId: 'otpk-3', ecdhPublicKey: 'ecdh', kemPublicKey: 'kem' },
    ]);

    expect(count).toBe(3);
  });

  test('storeOneTimePreKeys returns 0 for empty input array', async () => {
    const count = await repo.storeOneTimePreKeys([]);
    expect(count).toBe(0);
    expect(mockCollection.insertMany).not.toHaveBeenCalled();
  });

  test('storeOneTimePreKeys adds consumed: false to each doc', async () => {
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 1 });

    await repo.storeOneTimePreKeys([
      { identityId, deviceId, keyId: 'otpk-1', ecdhPublicKey: 'ecdh', kemPublicKey: 'kem' },
    ]);

    const docs = mockCollection.insertMany.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(docs?.[0]?.consumed).toBe(false);
    expect(docs?.[0]?.keyId).toBe('otpk-1');
  });

  // ---- getActiveSignedPreKey ----

  test('getActiveSignedPreKey returns signed key with expiresAt > now', async () => {
    const spkDoc = {
      _id: new ObjectId(),
      identityId,
      deviceId,
      keyType: 'signed',
      keyId: 'spk-active',
      ecdhPublicKey: 'ecdh',
      kemPublicKey: 'kem',
      signature: 'sig',
      consumed: false,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockCollection.findOne.mockResolvedValue(spkDoc);

    const result = await repo.getActiveSignedPreKey(identityId, deviceId);
    expect(result?.keyId).toBe('spk-active');
  });

  test('getActiveSignedPreKey returns null when no active signed key exists', async () => {
    mockCollection.findOne.mockResolvedValue(null);
    const result = await repo.getActiveSignedPreKey(identityId, deviceId);
    expect(result).toBeNull();
  });

  test('getActiveSignedPreKey filters by identityId, deviceId, and keyType signed', async () => {
    mockCollection.findOne.mockResolvedValue(null);

    await repo.getActiveSignedPreKey(identityId, deviceId);

    expect(mockCollection.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'signed',
      })
    );
  });

  // ---- countUnconsumedOneTimePreKeys ----

  test('countUnconsumedOneTimePreKeys returns count from countDocuments', async () => {
    mockCollection.countDocuments.mockResolvedValue(42);
    const count = await repo.countUnconsumedOneTimePreKeys(identityId, deviceId);
    expect(count).toBe(42);
  });

  test('countUnconsumedOneTimePreKeys filters with consumed: false', async () => {
    mockCollection.countDocuments.mockResolvedValue(0);

    await repo.countUnconsumedOneTimePreKeys(identityId, deviceId);

    expect(mockCollection.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'one-time',
        consumed: false,
      })
    );
  });

  // ---- purgeUnconsumedOneTimePreKeys ----

  test('purgeUnconsumedOneTimePreKeys calls deleteMany with correct filter', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 10 });
    const result = await repo.purgeUnconsumedOneTimePreKeys(identityId, deviceId);

    expect(result).toBe(10);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
        keyType: 'one-time',
        consumed: false,
      })
    );
  });

  test('purgeUnconsumedOneTimePreKeys returns deletedCount', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    const result = await repo.purgeUnconsumedOneTimePreKeys(identityId, deviceId);
    expect(result).toBe(0);
  });

  // ---- deletePreKeysForDevice ----

  test('deletePreKeysForDevice deletes all key types for the device', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 5 });

    const result = await repo.deletePreKeysForDevice(identityId, deviceId);

    expect(result).toBe(5);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId,
        deviceId,
      })
    );
  });

  test('deletePreKeysForDevice returns deletedCount', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    const result = await repo.deletePreKeysForDevice(identityId, deviceId);
    expect(result).toBe(0);
  });

  // ---- deleteAllPreKeysForIdentity ----

  test('deleteAllPreKeysForIdentity deletes all keys across all devices', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 15 });

    const result = await repo.deleteAllPreKeysForIdentity(identityId);

    expect(result).toBe(15);
    expect(mockCollection.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ identityId })
    );
  });

  test('deleteAllPreKeysForIdentity returns deletedCount', async () => {
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
    const result = await repo.deleteAllPreKeysForIdentity(identityId);
    expect(result).toBe(0);
  });
});

