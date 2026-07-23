import { describe, expect, test } from 'bun:test';

import {
  hkdfSha3_256,
  hkdfSha384,
  deriveKey,
  deriveWrappingKey,
  deriveCipherKey,
  deriveChunkKey,
  DEFAULT_KEY_LENGTH,
  KDF_INFO,
} from './hkdf';
import { randomBytes, constantTimeEqual, toBytes, toHex } from '../utils';

describe('kdf/hkdf', () => {
  describe('constants', () => {
    test('DEFAULT_KEY_LENGTH is 32', () => {
      expect(DEFAULT_KEY_LENGTH).toBe(32);
    });

    test('KDF_INFO contains all required contexts', () => {
      expect(KDF_INFO.KEY_WRAP).toBe('adieuu-key-wrap-v1');
      expect(KDF_INFO.MESSAGE_ENCRYPT).toBe('adieuu-message-encrypt-v1');
      expect(KDF_INFO.KEY_BACKUP).toBe('adieuu-key-backup-v1');
      expect(KDF_INFO.SPACE_CIPHER).toBe('adieuu-space-cipher-v1');
      expect(KDF_INFO.CHANNEL_CIPHER).toBe('adieuu-channel-cipher-v1');
      expect(KDF_INFO.FILE_ENCRYPT).toBe('adieuu-file-encrypt-v1');
      expect(KDF_INFO.CHUNK_KEY).toBe('adieuu-chunk-key-v1');
      expect(KDF_INFO.VOICE_CHANNEL_MEDIA).toBe('adieuu-voice-channel-media-v1');
    });
  });

  describe('hkdfSha3_256', () => {
    test('derives key of default length (32 bytes)', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const key = hkdfSha3_256(ikm, salt, 'test-info');

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('derives key of custom length', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);

      expect(hkdfSha3_256(ikm, salt, 'test', 16).length).toBe(16);
      expect(hkdfSha3_256(ikm, salt, 'test', 64).length).toBe(64);
      expect(hkdfSha3_256(ikm, salt, 'test', 128).length).toBe(128);
    });

    test('is deterministic', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'deterministic-test';

      const key1 = hkdfSha3_256(ikm, salt, info);
      const key2 = hkdfSha3_256(ikm, salt, info);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('different IKM produces different keys', () => {
      const ikm1 = randomBytes(32);
      const ikm2 = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'test';

      const key1 = hkdfSha3_256(ikm1, salt, info);
      const key2 = hkdfSha3_256(ikm2, salt, info);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('different salt produces different keys', () => {
      const ikm = randomBytes(32);
      const salt1 = randomBytes(32);
      const salt2 = randomBytes(32);
      const info = 'test';

      const key1 = hkdfSha3_256(ikm, salt1, info);
      const key2 = hkdfSha3_256(ikm, salt2, info);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('different info produces different keys', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);

      const key1 = hkdfSha3_256(ikm, salt, 'info-1');
      const key2 = hkdfSha3_256(ikm, salt, 'info-2');

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('handles undefined salt', () => {
      const ikm = randomBytes(32);
      const key = hkdfSha3_256(ikm, undefined, 'test');

      expect(key.length).toBe(32);
    });

    test('handles empty IKM', () => {
      const ikm = new Uint8Array(0);
      const key = hkdfSha3_256(ikm, undefined, 'test');

      expect(key.length).toBe(32);
    });

    test('handles empty info', () => {
      const ikm = randomBytes(32);
      const key = hkdfSha3_256(ikm, undefined, '');

      expect(key.length).toBe(32);
    });

    test('handles large IKM', () => {
      const ikm = randomBytes(10000);
      const key = hkdfSha3_256(ikm, undefined, 'test');

      expect(key.length).toBe(32);
    });
  });

  describe('hkdfSha384', () => {
    test('derives key of default length (32 bytes)', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const key = hkdfSha384(ikm, salt, 'test-info');

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('derives key of custom length', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);

      expect(hkdfSha384(ikm, salt, 'test', 16).length).toBe(16);
      expect(hkdfSha384(ikm, salt, 'test', 48).length).toBe(48);
    });

    test('is deterministic', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'deterministic-test';

      const key1 = hkdfSha384(ikm, salt, info);
      const key2 = hkdfSha384(ikm, salt, info);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('produces different output than SHA3-256', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'cross-algorithm-test';

      const sha3Key = hkdfSha3_256(ikm, salt, info);
      const sha384Key = hkdfSha384(ikm, salt, info);

      expect(constantTimeEqual(sha3Key, sha384Key)).toBe(false);
    });

    test('handles undefined salt', () => {
      const ikm = randomBytes(32);
      const key = hkdfSha384(ikm, undefined, 'test');

      expect(key.length).toBe(32);
    });
  });

  describe('deriveKey', () => {
    test('default profile uses SHA3-256', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'profile-test';

      const profileKey = deriveKey({ ikm, salt, info }, 'default');
      const directKey = hkdfSha3_256(ikm, salt, info);

      expect(constantTimeEqual(profileKey, directKey)).toBe(true);
    });

    test('cnsa2 profile uses SHA-384', () => {
      const ikm = randomBytes(32);
      const salt = randomBytes(32);
      const info = 'profile-test';

      const profileKey = deriveKey({ ikm, salt, info }, 'cnsa2');
      const directKey = hkdfSha384(ikm, salt, info);

      expect(constantTimeEqual(profileKey, directKey)).toBe(true);
    });

    test('uses default length when not specified', () => {
      const ikm = randomBytes(32);
      const key = deriveKey({ ikm, info: 'test' });

      expect(key.length).toBe(DEFAULT_KEY_LENGTH);
    });

    test('respects custom length', () => {
      const ikm = randomBytes(32);
      const key = deriveKey({ ikm, info: 'test', length: 64 });

      expect(key.length).toBe(64);
    });

    test('uses default profile when not specified', () => {
      const ikm = randomBytes(32);
      const info = 'no-profile-test';

      const key1 = deriveKey({ ikm, info });
      const key2 = deriveKey({ ikm, info }, 'default');

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });
  });

  describe('deriveWrappingKey', () => {
    test('combines ECDH and KEM shared secrets', () => {
      const ecdhShared = randomBytes(32);
      const kemShared = randomBytes(32);

      const key = deriveWrappingKey(ecdhShared, kemShared);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('is deterministic', () => {
      const ecdhShared = randomBytes(32);
      const kemShared = randomBytes(32);

      const key1 = deriveWrappingKey(ecdhShared, kemShared);
      const key2 = deriveWrappingKey(ecdhShared, kemShared);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('different ECDH produces different key', () => {
      const ecdh1 = randomBytes(32);
      const ecdh2 = randomBytes(32);
      const kem = randomBytes(32);

      const key1 = deriveWrappingKey(ecdh1, kem);
      const key2 = deriveWrappingKey(ecdh2, kem);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('different KEM produces different key', () => {
      const ecdh = randomBytes(32);
      const kem1 = randomBytes(32);
      const kem2 = randomBytes(32);

      const key1 = deriveWrappingKey(ecdh, kem1);
      const key2 = deriveWrappingKey(ecdh, kem2);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('salt affects derivation', () => {
      const ecdh = randomBytes(32);
      const kem = randomBytes(32);
      const salt1 = randomBytes(32);
      const salt2 = randomBytes(32);

      const key1 = deriveWrappingKey(ecdh, kem, salt1);
      const key2 = deriveWrappingKey(ecdh, kem, salt2);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('respects profile', () => {
      const ecdh = randomBytes(32);
      const kem = randomBytes(32);

      const defaultKey = deriveWrappingKey(ecdh, kem, undefined, 'default');
      const cnsa2Key = deriveWrappingKey(ecdh, kem, undefined, 'cnsa2');

      expect(constantTimeEqual(defaultKey, cnsa2Key)).toBe(false);
    });

    test('order of secrets matters', () => {
      const secret1 = randomBytes(32);
      const secret2 = randomBytes(32);

      const key1 = deriveWrappingKey(secret1, secret2);
      const key2 = deriveWrappingKey(secret2, secret1);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });
  });

  describe('deriveCipherKey', () => {
    test('derives from single entropy piece', () => {
      const entropy = [toBytes('my secret phrase')];
      const key = deriveCipherKey(entropy);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    test('derives from multiple entropy pieces', () => {
      const entropy = [
        toBytes('founding phrase'),
        randomBytes(32), // file hash
        randomBytes(32), // URL hash
      ];
      const key = deriveCipherKey(entropy);

      expect(key.length).toBe(32);
    });

    test('is deterministic', () => {
      const entropy = [toBytes('test'), randomBytes(32)];
      const entropy2 = [toBytes('test'), entropy[1]!];

      const key1 = deriveCipherKey(entropy);
      const key2 = deriveCipherKey(entropy2);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('order of entropy pieces matters', () => {
      const piece1 = toBytes('first');
      const piece2 = toBytes('second');

      const key1 = deriveCipherKey([piece1, piece2]);
      const key2 = deriveCipherKey([piece2, piece1]);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('different entropy produces different keys', () => {
      const key1 = deriveCipherKey([toBytes('phrase one')]);
      const key2 = deriveCipherKey([toBytes('phrase two')]);

      expect(constantTimeEqual(key1, key2)).toBe(false);
    });

    test('handles empty array', () => {
      const key = deriveCipherKey([]);

      expect(key.length).toBe(32);
    });

    test('handles empty entropy piece', () => {
      const key = deriveCipherKey([new Uint8Array(0)]);

      expect(key.length).toBe(32);
    });

    test('respects profile', () => {
      const entropy = [toBytes('test')];

      const defaultKey = deriveCipherKey(entropy, 'default');
      const cnsa2Key = deriveCipherKey(entropy, 'cnsa2');

      expect(constantTimeEqual(defaultKey, cnsa2Key)).toBe(false);
    });
  });

  describe('deriveChunkKey', () => {
    test('derives key for chunk 0', () => {
      const fileKey = randomBytes(32);
      const chunkKey = deriveChunkKey(fileKey, 0);

      expect(chunkKey).toBeInstanceOf(Uint8Array);
      expect(chunkKey.length).toBe(32);
    });

    test('different chunks produce different keys', () => {
      const fileKey = randomBytes(32);

      const chunk0 = deriveChunkKey(fileKey, 0);
      const chunk1 = deriveChunkKey(fileKey, 1);
      const chunk2 = deriveChunkKey(fileKey, 2);

      expect(constantTimeEqual(chunk0, chunk1)).toBe(false);
      expect(constantTimeEqual(chunk1, chunk2)).toBe(false);
      expect(constantTimeEqual(chunk0, chunk2)).toBe(false);
    });

    test('is deterministic', () => {
      const fileKey = randomBytes(32);

      const key1 = deriveChunkKey(fileKey, 42);
      const key2 = deriveChunkKey(fileKey, 42);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('different file keys produce different chunk keys', () => {
      const fileKey1 = randomBytes(32);
      const fileKey2 = randomBytes(32);

      const chunk1 = deriveChunkKey(fileKey1, 0);
      const chunk2 = deriveChunkKey(fileKey2, 0);

      expect(constantTimeEqual(chunk1, chunk2)).toBe(false);
    });

    test('handles large chunk indices', () => {
      const fileKey = randomBytes(32);

      const chunk1 = deriveChunkKey(fileKey, 1000000);
      const chunk2 = deriveChunkKey(fileKey, 0xffffffff);

      expect(chunk1.length).toBe(32);
      expect(chunk2.length).toBe(32);
      expect(constantTimeEqual(chunk1, chunk2)).toBe(false);
    });

    test('respects profile', () => {
      const fileKey = randomBytes(32);

      const defaultKey = deriveChunkKey(fileKey, 0, 'default');
      const cnsa2Key = deriveChunkKey(fileKey, 0, 'cnsa2');

      expect(constantTimeEqual(defaultKey, cnsa2Key)).toBe(false);
    });

    test('consecutive indices are independent', () => {
      const fileKey = randomBytes(32);
      const keys: string[] = [];

      // Derive many consecutive chunk keys
      for (let i = 0; i < 100; i++) {
        keys.push(toHex(deriveChunkKey(fileKey, i)));
      }

      // All should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(100);
    });
  });
});
