import { describe, expect, test } from 'bun:test';

import {
  encryptWithCipher,
  decryptWithCipher,
  encryptLayered,
  decryptLayered,
  serializeCipherPayload,
  deserializeCipherPayload,
  serializeLayeredPayload,
  deserializeLayeredPayload,
  getRequiredCipherIds,
  canDecrypt,
  getLayerCount,
} from './compose';
import { deriveCommunityCipher, createTextEntropy } from './derive';
import { toBytes, fromBytes, constantTimeEqual } from '../utils';
import type { CommunityCipher, CipherEncryptedPayload } from './types';

describe('ciphers/compose', () => {
  // Helper to create test ciphers
  function createTestCipher(phrase: string): CommunityCipher {
    return deriveCommunityCipher([createTextEntropy(phrase)]);
  }

  describe('encryptWithCipher', () => {
    test('encrypts data with cipher', () => {
      const cipher = createTestCipher('test cipher');
      const plaintext = toBytes('Hello, Space!');

      const encrypted = encryptWithCipher(cipher, plaintext);

      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array);
      expect(encrypted.cipherId).toBe(cipher.cipherId);
    });

    test('includes epoch ID when provided', () => {
      const cipher = createTestCipher('test cipher');
      const plaintext = toBytes('Message');

      const encrypted = encryptWithCipher(cipher, plaintext, 'epoch-1');

      expect(encrypted.epochId).toBe('epoch-1');
    });

    test('produces different ciphertext each time (random nonce)', () => {
      const cipher = createTestCipher('test cipher');
      const plaintext = toBytes('Same message');

      const encrypted1 = encryptWithCipher(cipher, plaintext);
      const encrypted2 = encryptWithCipher(cipher, plaintext);

      expect(constantTimeEqual(encrypted1.ciphertext, encrypted2.ciphertext)).toBe(false);
      expect(constantTimeEqual(encrypted1.nonce, encrypted2.nonce)).toBe(false);
    });
  });

  describe('decryptWithCipher', () => {
    test('decrypts data encrypted with same cipher', () => {
      const cipher = createTestCipher('test cipher');
      const plaintext = toBytes('Secret message');

      const encrypted = encryptWithCipher(cipher, plaintext);
      const decrypted = decryptWithCipher(cipher, encrypted);

      expect(constantTimeEqual(decrypted, plaintext)).toBe(true);
    });

    test('throws on cipher ID mismatch', () => {
      const cipher1 = createTestCipher('cipher 1');
      const cipher2 = createTestCipher('cipher 2');
      const plaintext = toBytes('Message');

      const encrypted = encryptWithCipher(cipher1, plaintext);

      expect(() => decryptWithCipher(cipher2, encrypted)).toThrow(
        'Cipher ID mismatch - wrong cipher for this payload'
      );
    });

    test('throws on tampered ciphertext', () => {
      const cipher = createTestCipher('test cipher');
      const plaintext = toBytes('Message');

      const encrypted = encryptWithCipher(cipher, plaintext);
      encrypted.ciphertext[0] ^= 0xff; // Tamper with first byte

      expect(() => decryptWithCipher(cipher, encrypted)).toThrow();
    });
  });

  describe('encryptLayered', () => {
    test('encrypts with single cipher', () => {
      const cipher = createTestCipher('single layer');
      const plaintext = toBytes('Single layer message');

      const encrypted = encryptLayered([cipher], plaintext);

      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonces).toHaveLength(1);
      expect(encrypted.cipherIds).toHaveLength(1);
      expect(encrypted.cipherIds[0]).toBe(cipher.cipherId);
    });

    test('encrypts with double layer (Space + Channel)', () => {
      const spaceCipher = createTestCipher('space');
      const channelCipher = createTestCipher('channel');
      const plaintext = toBytes('Double encrypted');

      const encrypted = encryptLayered([spaceCipher, channelCipher], plaintext);

      expect(encrypted.nonces).toHaveLength(2);
      expect(encrypted.cipherIds).toHaveLength(2);
      expect(encrypted.cipherIds[0]).toBe(spaceCipher.cipherId);
      expect(encrypted.cipherIds[1]).toBe(channelCipher.cipherId);
    });

    test('encrypts with triple layer', () => {
      const cipher1 = createTestCipher('layer 1');
      const cipher2 = createTestCipher('layer 2');
      const cipher3 = createTestCipher('layer 3');
      const plaintext = toBytes('Triple encrypted');

      const encrypted = encryptLayered([cipher1, cipher2, cipher3], plaintext);

      expect(encrypted.nonces).toHaveLength(3);
      expect(encrypted.cipherIds).toHaveLength(3);
    });

    test('throws on empty cipher array', () => {
      expect(() => encryptLayered([], toBytes('message'))).toThrow(
        'At least one cipher is required'
      );
    });

    test('includes epoch IDs when provided', () => {
      const cipher1 = createTestCipher('cipher 1');
      const cipher2 = createTestCipher('cipher 2');

      const encrypted = encryptLayered(
        [cipher1, cipher2],
        toBytes('message'),
        ['epoch-1', 'epoch-2']
      );

      expect(encrypted.epochIds).toEqual(['epoch-1', 'epoch-2']);
    });
  });

  describe('decryptLayered', () => {
    test('decrypts single layer', () => {
      const cipher = createTestCipher('single');
      const plaintext = toBytes('Single layer');

      const encrypted = encryptLayered([cipher], plaintext);
      const decrypted = decryptLayered([cipher], encrypted);

      expect(fromBytes(decrypted)).toBe('Single layer');
    });

    test('decrypts double layer', () => {
      const spaceCipher = createTestCipher('space secret');
      const channelCipher = createTestCipher('channel secret');
      const plaintext = toBytes('Moderator-only message');

      const encrypted = encryptLayered([spaceCipher, channelCipher], plaintext);
      const decrypted = decryptLayered([spaceCipher, channelCipher], encrypted);

      expect(fromBytes(decrypted)).toBe('Moderator-only message');
    });

    test('decrypts triple layer', () => {
      const cipher1 = createTestCipher('level 1');
      const cipher2 = createTestCipher('level 2');
      const cipher3 = createTestCipher('level 3');
      const plaintext = toBytes('Top secret');

      const encrypted = encryptLayered([cipher1, cipher2, cipher3], plaintext);
      const decrypted = decryptLayered([cipher1, cipher2, cipher3], encrypted);

      expect(fromBytes(decrypted)).toBe('Top secret');
    });

    test('throws on cipher count mismatch', () => {
      const cipher1 = createTestCipher('cipher 1');
      const cipher2 = createTestCipher('cipher 2');
      const plaintext = toBytes('message');

      const encrypted = encryptLayered([cipher1, cipher2], plaintext);

      expect(() => decryptLayered([cipher1], encrypted)).toThrow('Cipher count mismatch');
    });

    test('throws on cipher ID mismatch', () => {
      const cipher1 = createTestCipher('cipher 1');
      const cipher2 = createTestCipher('cipher 2');
      const wrongCipher = createTestCipher('wrong');
      const plaintext = toBytes('message');

      const encrypted = encryptLayered([cipher1, cipher2], plaintext);

      expect(() => decryptLayered([cipher1, wrongCipher], encrypted)).toThrow(
        'Cipher ID mismatch at layer 1'
      );
    });

    test('wrong order fails decryption', () => {
      const cipher1 = createTestCipher('first');
      const cipher2 = createTestCipher('second');
      const plaintext = toBytes('message');

      const encrypted = encryptLayered([cipher1, cipher2], plaintext);

      // Wrong order - should fail at cipher ID check
      expect(() => decryptLayered([cipher2, cipher1], encrypted)).toThrow('Cipher ID mismatch');
    });
  });

  describe('serialization', () => {
    describe('serializeCipherPayload / deserializeCipherPayload', () => {
      test('round-trips cipher payload', () => {
        const cipher = createTestCipher('serialize test');
        const plaintext = toBytes('Message to serialize');

        const encrypted = encryptWithCipher(cipher, plaintext, 'epoch-1');
        const serialized = serializeCipherPayload(encrypted);

        // Verify serialized format
        expect(typeof serialized.ciphertext).toBe('string');
        expect(typeof serialized.nonce).toBe('string');
        expect(serialized.cipherId).toBe(cipher.cipherId);
        expect(serialized.epochId).toBe('epoch-1');

        // Deserialize and decrypt
        const deserialized = deserializeCipherPayload(serialized);
        const decrypted = decryptWithCipher(cipher, deserialized);

        expect(fromBytes(decrypted)).toBe('Message to serialize');
      });
    });

    describe('serializeLayeredPayload / deserializeLayeredPayload', () => {
      test('round-trips layered payload', () => {
        const cipher1 = createTestCipher('layer 1');
        const cipher2 = createTestCipher('layer 2');
        const plaintext = toBytes('Layered message');

        const encrypted = encryptLayered([cipher1, cipher2], plaintext, ['e1', 'e2']);
        const serialized = serializeLayeredPayload(encrypted);

        // Verify serialized format
        expect(typeof serialized.ciphertext).toBe('string');
        expect(serialized.nonces).toHaveLength(2);
        expect(serialized.nonces.every((n) => typeof n === 'string')).toBe(true);
        expect(serialized.cipherIds).toHaveLength(2);
        expect(serialized.epochIds).toEqual(['e1', 'e2']);

        // Deserialize and decrypt
        const deserialized = deserializeLayeredPayload(serialized);
        const decrypted = decryptLayered([cipher1, cipher2], deserialized);

        expect(fromBytes(decrypted)).toBe('Layered message');
      });
    });
  });

  describe('getRequiredCipherIds', () => {
    test('returns single ID for simple payload', () => {
      const cipher = createTestCipher('test');
      const encrypted = encryptWithCipher(cipher, toBytes('msg'));

      const required = getRequiredCipherIds(encrypted);

      expect(required).toEqual([cipher.cipherId]);
    });

    test('returns all IDs for layered payload', () => {
      const cipher1 = createTestCipher('c1');
      const cipher2 = createTestCipher('c2');
      const cipher3 = createTestCipher('c3');
      const encrypted = encryptLayered([cipher1, cipher2, cipher3], toBytes('msg'));

      const required = getRequiredCipherIds(encrypted);

      expect(required).toEqual([cipher1.cipherId, cipher2.cipherId, cipher3.cipherId]);
    });
  });

  describe('canDecrypt', () => {
    test('returns true when all ciphers available', () => {
      const cipher1 = createTestCipher('c1');
      const cipher2 = createTestCipher('c2');
      const encrypted = encryptLayered([cipher1, cipher2], toBytes('msg'));

      expect(canDecrypt([cipher1, cipher2], encrypted)).toBe(true);
      expect(canDecrypt([cipher2, cipher1], encrypted)).toBe(true); // Order doesn't matter for check
    });

    test('returns false when missing ciphers', () => {
      const cipher1 = createTestCipher('c1');
      const cipher2 = createTestCipher('c2');
      const encrypted = encryptLayered([cipher1, cipher2], toBytes('msg'));

      expect(canDecrypt([cipher1], encrypted)).toBe(false);
      expect(canDecrypt([], encrypted)).toBe(false);
    });

    test('returns true with extra ciphers available', () => {
      const cipher1 = createTestCipher('c1');
      const cipher2 = createTestCipher('c2');
      const extra = createTestCipher('extra');
      const encrypted = encryptLayered([cipher1, cipher2], toBytes('msg'));

      expect(canDecrypt([cipher1, cipher2, extra], encrypted)).toBe(true);
    });
  });

  describe('getLayerCount', () => {
    test('returns 1 for simple payload', () => {
      const cipher = createTestCipher('test');
      const encrypted = encryptWithCipher(cipher, toBytes('msg'));

      expect(getLayerCount(encrypted)).toBe(1);
    });

    test('returns correct count for layered payload', () => {
      const cipher1 = createTestCipher('c1');
      const cipher2 = createTestCipher('c2');
      const cipher3 = createTestCipher('c3');

      expect(getLayerCount(encryptLayered([cipher1], toBytes('m')))).toBe(1);
      expect(getLayerCount(encryptLayered([cipher1, cipher2], toBytes('m')))).toBe(2);
      expect(getLayerCount(encryptLayered([cipher1, cipher2, cipher3], toBytes('m')))).toBe(3);
    });
  });

  describe('real-world scenarios', () => {
    test('Space with general and moderator channels', () => {
      // Space-level cipher (all members)
      const spaceCipher = createTestCipher('space founding phrase');

      // Moderator channel cipher (additional entropy)
      const modCipher = createTestCipher('moderator secret');

      // General channel message (space cipher only)
      const generalMessage = toBytes('Welcome to the space!');
      const generalEncrypted = encryptWithCipher(spaceCipher, generalMessage);

      // All members can decrypt general
      const generalDecrypted = decryptWithCipher(spaceCipher, generalEncrypted);
      expect(fromBytes(generalDecrypted)).toBe('Welcome to the space!');

      // Moderator channel message (double encrypted)
      const modMessage = toBytes('This user is causing issues');
      const modEncrypted = encryptLayered([spaceCipher, modCipher], modMessage);

      // Only mods with both ciphers can decrypt
      const modDecrypted = decryptLayered([spaceCipher, modCipher], modEncrypted);
      expect(fromBytes(modDecrypted)).toBe('This user is causing issues');

      // Regular member without mod cipher cannot decrypt
      expect(canDecrypt([spaceCipher], modEncrypted)).toBe(false);
    });

    test('epoch rotation scenario', () => {
      // Epoch 1 cipher
      const epoch1Cipher = createTestCipher('original entropy');

      // Old message encrypted with epoch 1
      const oldMessage = toBytes('Historical message');
      const oldEncrypted = encryptWithCipher(epoch1Cipher, oldMessage, 'epoch-1');

      // Epoch 2 cipher (after rotation)
      const epoch2Cipher = createTestCipher('new entropy after rotation');

      // New message encrypted with epoch 2
      const newMessage = toBytes('Current message');
      const newEncrypted = encryptWithCipher(epoch2Cipher, newMessage, 'epoch-2');

      // Member with both ciphers can read both
      expect(fromBytes(decryptWithCipher(epoch1Cipher, oldEncrypted))).toBe('Historical message');
      expect(fromBytes(decryptWithCipher(epoch2Cipher, newEncrypted))).toBe('Current message');

      // New member with only epoch 2 can only read new messages
      expect(canDecrypt([epoch2Cipher], newEncrypted)).toBe(true);
      expect(canDecrypt([epoch2Cipher], oldEncrypted)).toBe(false);
    });

    test('message transport via serialization', () => {
      const cipher = createTestCipher('network test');
      const plaintext = toBytes('Message going over the network');

      // Sender encrypts and serializes
      const encrypted = encryptWithCipher(cipher, plaintext);
      const forTransport = serializeCipherPayload(encrypted);
      const json = JSON.stringify(forTransport);

      // Simulate network transfer
      const received = JSON.parse(json);

      // Receiver deserializes and decrypts
      const deserialized = deserializeCipherPayload(received);
      const decrypted = decryptWithCipher(cipher, deserialized);

      expect(fromBytes(decrypted)).toBe('Message going over the network');
    });

    test('different profiles work correctly', () => {
      const defaultCipher = deriveCommunityCipher([createTextEntropy('test')], 'default');
      const cnsa2Cipher = deriveCommunityCipher([createTextEntropy('test cnsa2')], 'cnsa2');
      const plaintext = toBytes('Profile test');

      // Both profiles can encrypt/decrypt independently
      const defaultEncrypted = encryptWithCipher(defaultCipher, plaintext);
      const cnsa2Encrypted = encryptWithCipher(cnsa2Cipher, plaintext);

      expect(fromBytes(decryptWithCipher(defaultCipher, defaultEncrypted))).toBe('Profile test');
      expect(fromBytes(decryptWithCipher(cnsa2Cipher, cnsa2Encrypted))).toBe('Profile test');
    });
  });
});
