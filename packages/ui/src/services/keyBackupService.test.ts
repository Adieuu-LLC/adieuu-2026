import { describe, expect, test, beforeEach, afterEach } from 'bun:test';

import {
  exportKeyBackup,
  parseKeyBackupHeader,
  decryptKeyBackup,
  applyKeyBackupImport,
  getExportFilename,
  KeyBackupError,
  type KeyBackupPayload,
} from './keyBackupService';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  setDeviceKeyStorageBackend,
  clearAllDeviceKeys,
  storePreEncryptedDeviceKeys,
  type StoredDeviceKeys,
} from './deviceKeyStorage';
import {
  storePreEncryptedCipher,
  type StoredCipher,
} from '../hooks/useCipherStore';
import type { SecureStorage } from '../config/types';
import {
  randomBytes,
  toBase64,
  fromBase64,
  constantTimeEqual,
  deriveKeyFromPassword,
  hkdfSha3_256,
  KDF_INFO,
  ARGON2_HIGH_SECURITY,
  AES_GCM_NONCE_SIZE,
  encryptAES256GCM,
} from '@adieuu/crypto';

/**
 * Tests for the key backup export/import service.
 *
 * Uses the same in-memory mock SecureStorage pattern as the
 * deviceKeyStorage.backend.test.ts tests.
 */

function createMockSecureStorage(): SecureStorage & { _store: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>();

  return {
    _store: store,

    async getKey(keyId: string): Promise<Uint8Array | null> {
      return store.get(keyId) ?? null;
    },

    async setKey(keyId: string, key: Uint8Array): Promise<void> {
      store.set(keyId, new Uint8Array(key));
    },

    async deleteKey(keyId: string): Promise<void> {
      store.delete(keyId);
    },

    async hasKey(keyId: string): Promise<boolean> {
      return store.has(keyId);
    },

    async listKeys(prefix: string): Promise<string[]> {
      return Array.from(store.keys()).filter((k) => k.startsWith(prefix));
    },
  };
}

const generateWrappingKey = (): Uint8Array => randomBytes(32);
const generateWrappingSalt = (): Uint8Array => randomBytes(16);

const TEST_EXPORT_PASSWORD = 'test-export-password-123';

async function seedDeviceKeys(
  identityId: string,
  count: number,
  wrappingKey: Uint8Array
): Promise<string[]> {
  const deviceIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const deviceId = crypto.randomUUID();
    deviceIds.push(deviceId);
    await storeDeviceKeys(
      deviceId,
      identityId,
      randomBytes(32),
      randomBytes(2400),
      wrappingKey
    );
  }
  return deviceIds;
}

function buildBackupFile(headerObj: unknown, ciphertext?: Uint8Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(headerObj));
  const data = new Uint8Array(4 + headerBytes.length + (ciphertext?.length ?? 0));
  new DataView(data.buffer).setUint32(0, headerBytes.length, false);
  data.set(headerBytes, 4);
  if (ciphertext) {
    data.set(ciphertext, 4 + headerBytes.length);
  }
  return data;
}

async function buildEncryptedBackupPayload(
  payloadBytes: Uint8Array,
  password: string
): Promise<Uint8Array> {
  const salt = randomBytes(ARGON2_HIGH_SECURITY.saltLength);
  const nonce = randomBytes(AES_GCM_NONCE_SIZE);
  const ikm = await deriveKeyFromPassword({
    password,
    salt,
    memoryCost: ARGON2_HIGH_SECURITY.memoryCost,
    timeCost: ARGON2_HIGH_SECURITY.timeCost,
    parallelism: ARGON2_HIGH_SECURITY.parallelism,
    outputLength: ARGON2_HIGH_SECURITY.outputLength,
  });
  const key = hkdfSha3_256(ikm, salt, KDF_INFO.KEY_BACKUP, 32);
  const encrypted = encryptAES256GCM(key, payloadBytes, nonce);

  return buildBackupFile(
    {
      v: 1,
      format: 'adieuu-key-backup',
      createdAt: new Date().toISOString(),
      kdf: {
        algorithm: 'argon2id',
        timeCost: ARGON2_HIGH_SECURITY.timeCost,
        memoryCost: ARGON2_HIGH_SECURITY.memoryCost,
        parallelism: ARGON2_HIGH_SECURITY.parallelism,
        salt: toBase64(salt),
      },
      hkdf: { algorithm: 'hkdf-sha3-256', info: KDF_INFO.KEY_BACKUP },
      encryption: { algorithm: 'AES-256-GCM', nonce: toBase64(nonce) },
    },
    encrypted.ciphertext
  );
}

describe('keyBackupService', () => {
  let mockStorage: ReturnType<typeof createMockSecureStorage>;

  beforeEach(() => {
    mockStorage = createMockSecureStorage();
    setDeviceKeyStorageBackend(mockStorage);
  });

  afterEach(async () => {
    await clearAllDeviceKeys();
    setDeviceKeyStorageBackend(null);
  });

  // ==========================================================================
  // exportKeyBackup
  // ==========================================================================

  describe('exportKeyBackup', () => {
    test('produces a valid binary blob', async () => {
      const identityId = 'export-test-identity';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 2, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);

      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBeGreaterThan(4);
    });

    test('binary starts with valid header length', async () => {
      const identityId = 'header-test';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);

      const headerLength = new DataView(data.buffer, data.byteOffset, 4).getUint32(0, false);
      expect(headerLength).toBeGreaterThan(0);
      expect(headerLength).toBeLessThan(data.length - 4);
    });

    test('throws PASSWORD_TOO_SHORT for short password', async () => {
      const identityId = 'short-pw';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      try {
        await exportKeyBackup(identityId, wrappingSalt, 'short');
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('PASSWORD_TOO_SHORT');
      }
    });

    test('throws NO_DATA when identity has no exportable keys', async () => {
      const wrappingSalt = generateWrappingSalt();

      try {
        await exportKeyBackup('empty-identity', wrappingSalt, TEST_EXPORT_PASSWORD);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('NO_DATA');
      }
    });

    test('includes wrapping salt in the payload', async () => {
      const identityId = 'salt-check';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      const decodedSalt = fromBase64(payload.wrappingSalt);
      expect(constantTimeEqual(decodedSalt, wrappingSalt)).toBe(true);
    });

    test('exports devices-only payload when requested', async () => {
      const identityId = 'devices-only';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(
        identityId,
        wrappingSalt,
        TEST_EXPORT_PASSWORD,
        ['devices']
      );
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);
      expect(payload.devices.length).toBe(1);
      expect(payload.ciphers).toBeUndefined();
    });

    test('exports ciphers-only payload when requested', async () => {
      const identityId = 'ciphers-only';
      const wrappingSalt = generateWrappingSalt();
      const now = new Date().toISOString();
      const cipher: StoredCipher = {
        id: `cipher-${crypto.randomUUID()}`,
        name: 'Backup Cipher',
        identityId,
        encryptedEntropy: {
          version: 1,
          salt: toBase64(randomBytes(16)),
          ciphertext: toBase64(randomBytes(48)),
          nonce: toBase64(randomBytes(12)),
        },
        cipherId: toBase64(randomBytes(16)),
        shortId: 'abc12345',
        profile: 'default',
        createdAt: now,
        lastUsedAt: now,
      };
      await storePreEncryptedCipher(cipher);

      const data = await exportKeyBackup(
        identityId,
        wrappingSalt,
        TEST_EXPORT_PASSWORD,
        ['ciphers']
      );
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);
      expect(payload.devices.length).toBe(0);
      expect(payload.ciphers?.length).toBe(1);
    });

    test('produces different ciphertext for identical exports', async () => {
      const identityId = 'replay-test';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data1 = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const data2 = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);

      expect(constantTimeEqual(data1, data2)).toBe(false);
    });
  });

  // ==========================================================================
  // parseKeyBackupHeader
  // ==========================================================================

  describe('parseKeyBackupHeader', () => {
    test('parses a valid header', async () => {
      const identityId = 'parse-header';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const header = parseKeyBackupHeader(data);

      expect(header.v).toBe(1);
      expect(header.format).toBe('adieuu-key-backup');
      expect(header.kdf.algorithm).toBe('argon2id');
      expect(header.kdf.timeCost).toBe(4);
      expect(header.kdf.memoryCost).toBe(262144);
      expect(header.kdf.parallelism).toBe(4);
      expect(header.hkdf.algorithm).toBe('hkdf-sha3-256');
      expect(header.hkdf.info).toBe('adieuu-key-backup-v1');
      expect(header.encryption.algorithm).toBe('AES-256-GCM');
      expect(header.createdAt).toBeTruthy();
    });

    test('throws CORRUPT_FILE for empty data', () => {
      expect(() => parseKeyBackupHeader(new Uint8Array(0))).toThrow(KeyBackupError);

      try {
        parseKeyBackupHeader(new Uint8Array(0));
      } catch (err) {
        expect((err as KeyBackupError).code).toBe('CORRUPT_FILE');
      }
    });

    test('throws CORRUPT_FILE for data too short', () => {
      expect(() => parseKeyBackupHeader(new Uint8Array(3))).toThrow(KeyBackupError);
    });

    test('throws CORRUPT_FILE for invalid header length', () => {
      const data = new Uint8Array(8);
      // Set header length to a huge value
      new DataView(data.buffer).setUint32(0, 999999, false);

      try {
        parseKeyBackupHeader(data);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('CORRUPT_FILE');
      }
    });

    test('throws CORRUPT_FILE for non-JSON header', () => {
      const garbage = new TextEncoder().encode('not json at all!!');
      const data = new Uint8Array(4 + garbage.length);
      new DataView(data.buffer).setUint32(0, garbage.length, false);
      data.set(garbage, 4);

      try {
        parseKeyBackupHeader(data);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('CORRUPT_FILE');
      }
    });

    test('throws INVALID_FORMAT for wrong format field', () => {
      const header = JSON.stringify({ v: 1, format: 'wrong-format', createdAt: '', kdf: {}, hkdf: {}, encryption: {} });
      const headerBytes = new TextEncoder().encode(header);
      const data = new Uint8Array(4 + headerBytes.length);
      new DataView(data.buffer).setUint32(0, headerBytes.length, false);
      data.set(headerBytes, 4);

      try {
        parseKeyBackupHeader(data);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('INVALID_FORMAT');
      }
    });

    test('throws UNSUPPORTED_VERSION for future version', () => {
      const header = JSON.stringify({ v: 99, format: 'adieuu-key-backup', createdAt: '', kdf: {}, hkdf: {}, encryption: {} });
      const headerBytes = new TextEncoder().encode(header);
      const data = new Uint8Array(4 + headerBytes.length);
      new DataView(data.buffer).setUint32(0, headerBytes.length, false);
      data.set(headerBytes, 4);

      try {
        parseKeyBackupHeader(data);
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('UNSUPPORTED_VERSION');
      }
    });
  });

  // ==========================================================================
  // decryptKeyBackup (round-trip)
  // ==========================================================================

  describe('decryptKeyBackup', () => {
    test('round-trip: export then decrypt produces identical keys', async () => {
      const identityId = 'roundtrip-test';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      const deviceIds = await seedDeviceKeys(identityId, 3, wrappingKey);

      const originalKeys = await getDeviceKeysForIdentity(identityId);
      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      expect(payload.payloadVersion).toBe(1);
      expect(payload.identityId).toBe(identityId);
      expect(payload.devices.length).toBe(3);

      const payloadDeviceIds = payload.devices.map((d) => d.deviceId).sort();
      expect(payloadDeviceIds).toEqual(deviceIds.sort());

      for (const original of originalKeys) {
        const imported = payload.devices.find((d) => d.deviceId === original.deviceId);
        expect(imported).toBeTruthy();
        expect(imported!.identityId).toBe(original.identityId);
        expect(imported!.ecdhPrivateKeyEncrypted).toEqual(original.ecdhPrivateKeyEncrypted);
        expect(imported!.kemPrivateKeyEncrypted).toEqual(original.kemPrivateKeyEncrypted);
        expect(imported!.createdAt).toBe(original.createdAt);
      }
    });

    test('throws WRONG_PASSWORD for incorrect password', async () => {
      const identityId = 'wrong-pw';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);

      try {
        await decryptKeyBackup(data, 'wrong-password-totally');
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(KeyBackupError);
        expect((err as KeyBackupError).code).toBe('WRONG_PASSWORD');
      }
    });

    test('payload includes correct wrapping salt', async () => {
      const identityId = 'salt-roundtrip';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = randomBytes(16);
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      const decoded = fromBase64(payload.wrappingSalt);
      expect(constantTimeEqual(decoded, wrappingSalt)).toBe(true);
    });

    test('payload includes correct identityId', async () => {
      const identityId = 'identity-check-' + crypto.randomUUID();
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      expect(payload.identityId).toBe(identityId);
    });

    test('exported file contains no plaintext key material', async () => {
      const identityId = 'no-plaintext';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const keys = await getDeviceKeysForIdentity(identityId);
      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);

      const dataString = new TextDecoder().decode(data);

      // The ciphertext strings from the inner encryption should NOT appear
      // in the outer file (they're encrypted again)
      for (const key of keys) {
        expect(dataString).not.toContain(key.ecdhPrivateKeyEncrypted.ciphertext);
        expect(dataString).not.toContain(key.kemPrivateKeyEncrypted.ciphertext);
      }
    });

    test('throws EMPTY_PAYLOAD when ciphertext section is empty', async () => {
      const data = buildBackupFile({
        v: 1,
        format: 'adieuu-key-backup',
        createdAt: new Date().toISOString(),
        kdf: {
          algorithm: 'argon2id',
          timeCost: 4,
          memoryCost: 262144,
          parallelism: 4,
          salt: toBase64(randomBytes(16)),
        },
        hkdf: { algorithm: 'hkdf-sha3-256', info: KDF_INFO.KEY_BACKUP },
        encryption: { algorithm: 'AES-256-GCM', nonce: toBase64(randomBytes(12)) },
      });

      await expect(decryptKeyBackup(data, TEST_EXPORT_PASSWORD)).rejects.toMatchObject({
        code: 'EMPTY_PAYLOAD',
      });
    });

    test('throws CORRUPT_PAYLOAD when decrypted payload is not JSON', async () => {
      const data = await buildEncryptedBackupPayload(
        new TextEncoder().encode('not-json'),
        TEST_EXPORT_PASSWORD
      );

      await expect(decryptKeyBackup(data, TEST_EXPORT_PASSWORD)).rejects.toMatchObject({
        code: 'CORRUPT_PAYLOAD',
      });
    });

    test('throws INVALID_PAYLOAD when required payload shape is missing', async () => {
      const invalidPayload = {
        payloadVersion: 1,
        identityId: 'invalid-shape',
        wrappingSalt: toBase64(randomBytes(16)),
      };
      const data = await buildEncryptedBackupPayload(
        new TextEncoder().encode(JSON.stringify(invalidPayload)),
        TEST_EXPORT_PASSWORD
      );

      await expect(decryptKeyBackup(data, TEST_EXPORT_PASSWORD)).rejects.toMatchObject({
        code: 'INVALID_PAYLOAD',
      });
    });

    test('throws NO_DATA when devices and ciphers are both empty', async () => {
      const emptyPayload: KeyBackupPayload = {
        payloadVersion: 1,
        identityId: 'empty-payload',
        wrappingSalt: toBase64(randomBytes(16)),
        devices: [],
        ciphers: [],
      };
      const data = await buildEncryptedBackupPayload(
        new TextEncoder().encode(JSON.stringify(emptyPayload)),
        TEST_EXPORT_PASSWORD
      );

      await expect(decryptKeyBackup(data, TEST_EXPORT_PASSWORD)).rejects.toMatchObject({
        code: 'NO_DATA',
      });
    });
  });

  // ==========================================================================
  // applyKeyBackupImport
  // ==========================================================================

  describe('applyKeyBackupImport', () => {
    test('imports all devices when none exist locally', async () => {
      const identityId = 'import-fresh';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 2, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      // Clear local keys to simulate fresh device
      await clearAllDeviceKeys();

      const result = await applyKeyBackupImport(
        payload,
        'skip',
        async (record) => { await storePreEncryptedDeviceKeys(record); }
      );

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);

      const stored = await getDeviceKeysForIdentity(identityId);
      expect(stored.length).toBe(2);
    });

    test('skip strategy skips existing devices', async () => {
      const identityId = 'import-skip';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      const deviceIds = await seedDeviceKeys(identityId, 3, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      // All 3 devices already exist locally
      const result = await applyKeyBackupImport(
        payload,
        'skip',
        async (record) => { await storePreEncryptedDeviceKeys(record); }
      );

      expect(result.imported).toBe(0);
      expect(result.skipped).toBe(3);
    });

    test('replace strategy replaces existing devices', async () => {
      const identityId = 'import-replace';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 2, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      const result = await applyKeyBackupImport(
        payload,
        'replace',
        async (record) => { await storePreEncryptedDeviceKeys(record); }
      );

      expect(result.imported).toBe(2);
      expect(result.skipped).toBe(0);
    });

    test('mixed overlap: imports new devices, applies strategy to existing', async () => {
      const identityId = 'import-mixed';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();

      // Create 2 devices locally
      const localDeviceIds = await seedDeviceKeys(identityId, 2, wrappingKey);

      // Export all 2
      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      // Clear local and re-add only 1 of them
      await clearAllDeviceKeys();
      await storeDeviceKeys(
        localDeviceIds[0]!,
        identityId,
        randomBytes(32),
        randomBytes(2400),
        wrappingKey
      );

      // Import with skip -- device 0 should be skipped, device 1 imported
      const result = await applyKeyBackupImport(
        payload,
        'skip',
        async (record) => { await storePreEncryptedDeviceKeys(record); }
      );

      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(1);

      const stored = await getDeviceKeysForIdentity(identityId);
      expect(stored.length).toBe(2);
    });

    test('uses custom storeRecord function', async () => {
      const identityId = 'custom-store';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 2, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      await clearAllDeviceKeys();

      const storedRecords: StoredDeviceKeys[] = [];
      const result = await applyKeyBackupImport(
        payload,
        'skip',
        async (record) => { storedRecords.push(record); }
      );

      expect(result.imported).toBe(2);
      expect(storedRecords.length).toBe(2);
      expect(storedRecords.every((r) => r.identityId === identityId)).toBe(true);
    });

    test('imports ciphers and skips existing ones with skip strategy', async () => {
      const identityId = `cipher-import-skip-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const existingCipher: StoredCipher = {
        id: `cipher-existing-${crypto.randomUUID()}`,
        name: 'Existing',
        identityId,
        encryptedEntropy: {
          version: 1,
          salt: toBase64(randomBytes(16)),
          ciphertext: toBase64(randomBytes(48)),
          nonce: toBase64(randomBytes(12)),
        },
        cipherId: 'shared-cipher-id',
        shortId: 'short1',
        profile: 'default',
        createdAt: now,
        lastUsedAt: now,
      };
      await storePreEncryptedCipher(existingCipher);

      const payload: KeyBackupPayload = {
        payloadVersion: 1,
        identityId,
        wrappingSalt: toBase64(randomBytes(16)),
        devices: [],
        ciphers: [
          { ...existingCipher, id: `cipher-remote-${crypto.randomUUID()}` },
          {
            ...existingCipher,
            id: `cipher-new-${crypto.randomUUID()}`,
            cipherId: 'new-cipher-id',
            shortId: 'short2',
          },
        ],
      };

      const seen: StoredCipher[] = [];
      const result = await applyKeyBackupImport(
        payload,
        'skip',
        async () => {},
        async (record) => {
          seen.push(record);
        }
      );

      expect(result.ciphersImported).toBe(1);
      expect(result.ciphersSkipped).toBe(1);
      expect(seen.length).toBe(1);
      expect(seen[0]!.cipherId).toBe('new-cipher-id');
    });

    test('replace strategy reuses local cipher id for existing cipherId', async () => {
      const identityId = `cipher-import-replace-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const existingCipher: StoredCipher = {
        id: `cipher-existing-${crypto.randomUUID()}`,
        name: 'Existing',
        identityId,
        encryptedEntropy: {
          version: 1,
          salt: toBase64(randomBytes(16)),
          ciphertext: toBase64(randomBytes(48)),
          nonce: toBase64(randomBytes(12)),
        },
        cipherId: 'shared-cipher-id',
        shortId: 'short1',
        profile: 'default',
        createdAt: now,
        lastUsedAt: now,
      };
      await storePreEncryptedCipher(existingCipher);

      const payload: KeyBackupPayload = {
        payloadVersion: 1,
        identityId,
        wrappingSalt: toBase64(randomBytes(16)),
        devices: [],
        ciphers: [{ ...existingCipher, id: `cipher-remote-${crypto.randomUUID()}` }],
      };

      const seen: StoredCipher[] = [];
      const result = await applyKeyBackupImport(
        payload,
        'replace',
        async () => {},
        async (record) => {
          seen.push(record);
        }
      );

      expect(result.ciphersImported).toBe(1);
      expect(result.ciphersSkipped).toBe(0);
      expect(seen[0]!.id).toBe(existingCipher.id);
    });
  });

  // ==========================================================================
  // storePreEncryptedDeviceKeys
  // ==========================================================================

  describe('storePreEncryptedDeviceKeys', () => {
    test('stores a pre-encrypted record directly', async () => {
      const record: StoredDeviceKeys = {
        deviceId: 'pre-enc-device',
        identityId: 'pre-enc-identity',
        ecdhPrivateKeyEncrypted: { ciphertext: toBase64(randomBytes(48)), nonce: toBase64(randomBytes(12)) },
        kemPrivateKeyEncrypted: { ciphertext: toBase64(randomBytes(2416)), nonce: toBase64(randomBytes(12)) },
        createdAt: new Date().toISOString(),
      };

      await storePreEncryptedDeviceKeys(record);

      const keys = await getDeviceKeysForIdentity('pre-enc-identity');
      expect(keys.length).toBe(1);
      expect(keys[0]!.deviceId).toBe('pre-enc-device');
      expect(keys[0]!.ecdhPrivateKeyEncrypted).toEqual(record.ecdhPrivateKeyEncrypted);
      expect(keys[0]!.kemPrivateKeyEncrypted).toEqual(record.kemPrivateKeyEncrypted);
    });

    test('overwrites an existing record with the same deviceId', async () => {
      const identityId = 'overwrite-identity';
      const wrappingKey = generateWrappingKey();

      await storeDeviceKeys('same-device', identityId, randomBytes(32), randomBytes(2400), wrappingKey);

      const replacement: StoredDeviceKeys = {
        deviceId: 'same-device',
        identityId,
        ecdhPrivateKeyEncrypted: { ciphertext: 'replaced-ct', nonce: 'replaced-nonce' },
        kemPrivateKeyEncrypted: { ciphertext: 'replaced-ct2', nonce: 'replaced-nonce2' },
        createdAt: new Date().toISOString(),
      };

      await storePreEncryptedDeviceKeys(replacement);

      const keys = await getDeviceKeysForIdentity(identityId);
      expect(keys.length).toBe(1);
      expect(keys[0]!.ecdhPrivateKeyEncrypted.ciphertext).toBe('replaced-ct');
    });
  });

  // ==========================================================================
  // getExportFilename
  // ==========================================================================

  describe('getExportFilename', () => {
    test('returns a filename with the current date', () => {
      const filename = getExportFilename();
      const today = new Date().toISOString().split('T')[0];

      expect(filename).toBe(`adieuu-keys-${today}.adieuu-keys`);
    });

    test('has .adieuu-keys extension', () => {
      const filename = getExportFilename();
      expect(filename.endsWith('.adieuu-keys')).toBe(true);
    });
  });

  // ==========================================================================
  // HKDF domain separation
  // ==========================================================================

  describe('HKDF domain separation', () => {
    test('same password + different salts produce different exports that both decrypt', async () => {
      const identityId = 'hkdf-test';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const password = 'same-password-for-both';

      const data1 = await exportKeyBackup(identityId, wrappingSalt, password);
      const data2 = await exportKeyBackup(identityId, wrappingSalt, password);

      // Different salts/nonces means different ciphertext
      expect(constantTimeEqual(data1, data2)).toBe(false);

      // But both decrypt successfully
      const payload1 = await decryptKeyBackup(data1, password);
      const payload2 = await decryptKeyBackup(data2, password);

      expect(payload1.identityId).toBe(identityId);
      expect(payload2.identityId).toBe(identityId);
      expect(payload1.devices.length).toBe(1);
      expect(payload2.devices.length).toBe(1);
    });
  });

  // ==========================================================================
  // Edge cases
  // ==========================================================================

  describe('edge cases', () => {
    test('handles single device export/import', async () => {
      const identityId = 'single-device';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      expect(payload.devices.length).toBe(1);
    });

    test('handles many devices export/import', async () => {
      const identityId = 'many-devices';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 10, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, TEST_EXPORT_PASSWORD);
      const payload = await decryptKeyBackup(data, TEST_EXPORT_PASSWORD);

      expect(payload.devices.length).toBe(10);
    });

    test('minimum password length (8 chars) is accepted', async () => {
      const identityId = 'min-pw';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      const data = await exportKeyBackup(identityId, wrappingSalt, '12345678');
      expect(data.length).toBeGreaterThan(0);

      const payload = await decryptKeyBackup(data, '12345678');
      expect(payload.devices.length).toBe(1);
    });

    test('7 character password is rejected', async () => {
      const identityId = 'too-short-pw';
      const wrappingKey = generateWrappingKey();
      const wrappingSalt = generateWrappingSalt();
      await seedDeviceKeys(identityId, 1, wrappingKey);

      try {
        await exportKeyBackup(identityId, wrappingSalt, '1234567');
        expect(true).toBe(false);
      } catch (err) {
        expect((err as KeyBackupError).code).toBe('PASSWORD_TOO_SHORT');
      }
    });
  });

  // ==========================================================================
  // KeyBackupError
  // ==========================================================================

  describe('KeyBackupError', () => {
    test('has correct name and code', () => {
      const err = new KeyBackupError('test message', 'TEST_CODE');
      expect(err.name).toBe('KeyBackupError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test message');
      expect(err instanceof Error).toBe(true);
    });
  });
});
