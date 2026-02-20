import { describe, expect, test } from 'bun:test';

import {
  generateSenderKey,
  deriveMessageKey,
  advanceAndDeriveMessageKey,
  createSenderKey,
  isValidChainIndex,
  validateAndUpdateChainIndex,
  SENDER_KEY_SIZE,
  SENDER_KEY_MESSAGE_INFO,
} from './senderkey';
import { randomBytes, constantTimeEqual } from '../utils';

describe('groups/senderkey', () => {
  describe('constants', () => {
    test('SENDER_KEY_SIZE is 32', () => {
      expect(SENDER_KEY_SIZE).toBe(32);
    });

    test('SENDER_KEY_MESSAGE_INFO is correct', () => {
      expect(SENDER_KEY_MESSAGE_INFO).toBe('adieuu-sender-key-message-v1');
    });
  });

  describe('generateSenderKey', () => {
    test('generates a sender key with correct size', () => {
      const senderKey = generateSenderKey();

      expect(senderKey.key).toBeInstanceOf(Uint8Array);
      expect(senderKey.key.length).toBe(SENDER_KEY_SIZE);
    });

    test('initializes chain index to 0 by default', () => {
      const senderKey = generateSenderKey();

      expect(senderKey.chainIndex).toBe(0);
    });

    test('accepts custom initial chain index', () => {
      const senderKey = generateSenderKey(100);

      expect(senderKey.chainIndex).toBe(100);
    });

    test('generates different keys each time', () => {
      const key1 = generateSenderKey();
      const key2 = generateSenderKey();

      expect(constantTimeEqual(key1.key, key2.key)).toBe(false);
    });
  });

  describe('deriveMessageKey', () => {
    test('derives a 32-byte message key', () => {
      const senderKey = generateSenderKey();
      const messageKey = deriveMessageKey(senderKey.key, 0);

      expect(messageKey).toBeInstanceOf(Uint8Array);
      expect(messageKey.length).toBe(32);
    });

    test('same inputs produce same output', () => {
      const senderKey = generateSenderKey();
      const key1 = deriveMessageKey(senderKey.key, 0);
      const key2 = deriveMessageKey(senderKey.key, 0);

      expect(constantTimeEqual(key1, key2)).toBe(true);
    });

    test('different chain indexes produce different keys', () => {
      const senderKey = generateSenderKey();
      const key0 = deriveMessageKey(senderKey.key, 0);
      const key1 = deriveMessageKey(senderKey.key, 1);
      const key2 = deriveMessageKey(senderKey.key, 2);

      expect(constantTimeEqual(key0, key1)).toBe(false);
      expect(constantTimeEqual(key1, key2)).toBe(false);
      expect(constantTimeEqual(key0, key2)).toBe(false);
    });

    test('different sender keys produce different message keys', () => {
      const senderKey1 = generateSenderKey();
      const senderKey2 = generateSenderKey();

      const messageKey1 = deriveMessageKey(senderKey1.key, 0);
      const messageKey2 = deriveMessageKey(senderKey2.key, 0);

      expect(constantTimeEqual(messageKey1, messageKey2)).toBe(false);
    });

    test('works with high chain indexes', () => {
      const senderKey = generateSenderKey();
      const key = deriveMessageKey(senderKey.key, 1000000);

      expect(key.length).toBe(32);
    });

    test('throws on invalid sender key size', () => {
      const shortKey = randomBytes(16);

      expect(() => deriveMessageKey(shortKey, 0)).toThrow('Sender key must be 32 bytes');
    });

    test('throws on negative chain index', () => {
      const senderKey = generateSenderKey();

      expect(() => deriveMessageKey(senderKey.key, -1)).toThrow(
        'Chain index must be a non-negative integer'
      );
    });

    test('throws on non-integer chain index', () => {
      const senderKey = generateSenderKey();

      expect(() => deriveMessageKey(senderKey.key, 1.5)).toThrow(
        'Chain index must be a non-negative integer'
      );
    });

    test('works with cnsa2 profile', () => {
      const senderKey = generateSenderKey();
      const messageKey = deriveMessageKey(senderKey.key, 0, 'cnsa2');

      expect(messageKey.length).toBe(32);
    });

    test('different profiles produce different keys', () => {
      const senderKey = generateSenderKey();
      const defaultKey = deriveMessageKey(senderKey.key, 0, 'default');
      const cnsa2Key = deriveMessageKey(senderKey.key, 0, 'cnsa2');

      expect(constantTimeEqual(defaultKey, cnsa2Key)).toBe(false);
    });
  });

  describe('advanceAndDeriveMessageKey', () => {
    test('derives message key and increments chain index', () => {
      const senderKey = generateSenderKey();
      const initialIndex = senderKey.chainIndex;

      const messageKey = advanceAndDeriveMessageKey(senderKey);

      expect(messageKey.length).toBe(32);
      expect(senderKey.chainIndex).toBe(initialIndex + 1);
    });

    test('produces same key as deriveMessageKey for same index', () => {
      const senderKey1 = generateSenderKey();
      const senderKey2 = createSenderKey(senderKey1.key, 0);

      const advancedKey = advanceAndDeriveMessageKey(senderKey1);
      const derivedKey = deriveMessageKey(senderKey2.key, 0);

      expect(constantTimeEqual(advancedKey, derivedKey)).toBe(true);
    });

    test('sequential calls produce different keys', () => {
      const senderKey = generateSenderKey();

      const key0 = advanceAndDeriveMessageKey(senderKey);
      const key1 = advanceAndDeriveMessageKey(senderKey);
      const key2 = advanceAndDeriveMessageKey(senderKey);

      expect(constantTimeEqual(key0, key1)).toBe(false);
      expect(constantTimeEqual(key1, key2)).toBe(false);
      expect(senderKey.chainIndex).toBe(3);
    });
  });

  describe('createSenderKey', () => {
    test('creates sender key with provided values', () => {
      const keyBytes = randomBytes(32);
      const senderKey = createSenderKey(keyBytes, 42);

      expect(senderKey.chainIndex).toBe(42);
      expect(constantTimeEqual(senderKey.key, keyBytes)).toBe(true);
    });

    test('copies key bytes to prevent mutation', () => {
      const keyBytes = randomBytes(32);
      const senderKey = createSenderKey(keyBytes, 0);

      // Mutate original
      keyBytes[0] = keyBytes[0]! ^ 0xff;

      // Sender key should be unaffected
      expect(senderKey.key[0]).not.toBe(keyBytes[0]);
    });

    test('throws on invalid key size', () => {
      const shortKey = randomBytes(16);

      expect(() => createSenderKey(shortKey, 0)).toThrow('Sender key must be 32 bytes');
    });
  });

  describe('isValidChainIndex', () => {
    test('returns true when received >= expected', () => {
      expect(isValidChainIndex(0, 0)).toBe(true);
      expect(isValidChainIndex(5, 5)).toBe(true);
      expect(isValidChainIndex(10, 5)).toBe(true);
      expect(isValidChainIndex(100, 0)).toBe(true);
    });

    test('returns false when received < expected (replay)', () => {
      expect(isValidChainIndex(0, 1)).toBe(false);
      expect(isValidChainIndex(5, 10)).toBe(false);
      expect(isValidChainIndex(99, 100)).toBe(false);
    });
  });

  describe('validateAndUpdateChainIndex', () => {
    test('returns true and updates for valid index', () => {
      const senderKey = createSenderKey(randomBytes(32), 5);

      const result = validateAndUpdateChainIndex(5, senderKey);

      expect(result).toBe(true);
      expect(senderKey.chainIndex).toBe(6);
    });

    test('handles gaps in chain index (out-of-order delivery)', () => {
      const senderKey = createSenderKey(randomBytes(32), 5);

      // Received message with index 10 (skipped 5-9)
      const result = validateAndUpdateChainIndex(10, senderKey);

      expect(result).toBe(true);
      expect(senderKey.chainIndex).toBe(11);
    });

    test('returns false for replay attack', () => {
      const senderKey = createSenderKey(randomBytes(32), 10);

      // Try to use already-seen index
      const result = validateAndUpdateChainIndex(5, senderKey);

      expect(result).toBe(false);
      expect(senderKey.chainIndex).toBe(10); // Unchanged
    });

    test('handles sequential messages', () => {
      const senderKey = createSenderKey(randomBytes(32), 0);

      expect(validateAndUpdateChainIndex(0, senderKey)).toBe(true);
      expect(senderKey.chainIndex).toBe(1);

      expect(validateAndUpdateChainIndex(1, senderKey)).toBe(true);
      expect(senderKey.chainIndex).toBe(2);

      expect(validateAndUpdateChainIndex(2, senderKey)).toBe(true);
      expect(senderKey.chainIndex).toBe(3);
    });
  });

  describe('message encryption simulation', () => {
    test('sender can encrypt, receiver can decrypt with same derived key', () => {
      // Sender generates their sender key
      const senderKey = generateSenderKey();

      // Sender encrypts a message (get the message key)
      const chainIndex = senderKey.chainIndex;
      const senderMessageKey = advanceAndDeriveMessageKey(senderKey);

      // Receiver has a copy of the sender key
      const receiverCopy = createSenderKey(senderKey.key, 0);

      // Receiver derives the same message key using the chain index from the message
      const receiverMessageKey = deriveMessageKey(receiverCopy.key, chainIndex);

      // Keys should match
      expect(constantTimeEqual(senderMessageKey, receiverMessageKey)).toBe(true);
    });

    test('multiple messages use different keys', () => {
      const senderKey = generateSenderKey();

      // Send 3 messages
      const messages = [
        { chainIndex: senderKey.chainIndex, key: advanceAndDeriveMessageKey(senderKey) },
        { chainIndex: senderKey.chainIndex, key: advanceAndDeriveMessageKey(senderKey) },
        { chainIndex: senderKey.chainIndex, key: advanceAndDeriveMessageKey(senderKey) },
      ];

      // All keys are unique
      expect(constantTimeEqual(messages[0]!.key, messages[1]!.key)).toBe(false);
      expect(constantTimeEqual(messages[1]!.key, messages[2]!.key)).toBe(false);

      // Chain indexes increment
      expect(messages[0]!.chainIndex).toBe(0);
      expect(messages[1]!.chainIndex).toBe(1);
      expect(messages[2]!.chainIndex).toBe(2);
    });
  });
});
