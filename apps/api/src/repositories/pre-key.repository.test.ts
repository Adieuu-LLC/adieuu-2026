import { beforeEach, describe, expect, mock, test } from 'bun:test';
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

const mockCollection = {
  updateMany: mock(() => Promise.resolve({ modifiedCount: 0 })) as AnyMock,
  insertOne: mock(() => Promise.resolve({ insertedId: new ObjectId() })) as AnyMock,
  insertMany: mock(() => Promise.resolve({ insertedCount: 0 })) as AnyMock,
  findOne: mock(() => Promise.resolve(null)) as AnyMock,
  findOneAndUpdate: mock(() => Promise.resolve(null)) as AnyMock,
  countDocuments: mock(() => Promise.resolve(0)) as AnyMock,
  deleteMany: mock(() => Promise.resolve({ deletedCount: 0 })) as AnyMock,
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

    mockCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
    mockCollection.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 0 });
    mockCollection.findOne.mockResolvedValue(null);
    mockCollection.findOneAndUpdate.mockResolvedValue(null);
    mockCollection.countDocuments.mockResolvedValue(0);
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 0 });
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
});

