/**
 * Tests for DM cryptographic utilities.
 */

import { describe, it, expect } from 'bun:test';
import {
  deriveConversationId,
  validateConversationId,
  deriveSenderHintKey,
  deriveReadStateKey,
  deriveSenderHintNonce,
} from './index';

describe('deriveConversationId', () => {
  it('should produce a 64-character hex string', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId = deriveConversationId(id1, id2);

    expect(convId).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(convId)).toBe(true);
  });

  it('should be symmetric (order-independent)', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId1 = deriveConversationId(id1, id2);
    const convId2 = deriveConversationId(id2, id1);

    expect(convId1).toBe(convId2);
  });

  it('should be deterministic', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    const convId1 = deriveConversationId(id1, id2);
    const convId2 = deriveConversationId(id1, id2);

    expect(convId1).toBe(convId2);
  });

  it('should produce different IDs for different identity pairs', () => {
    const alice = '507f1f77bcf86cd799439011';
    const bob = '507f1f77bcf86cd799439012';
    const carol = '507f1f77bcf86cd799439013';

    const aliceBob = deriveConversationId(alice, bob);
    const aliceCarol = deriveConversationId(alice, carol);
    const bobCarol = deriveConversationId(bob, carol);

    expect(aliceBob).not.toBe(aliceCarol);
    expect(aliceBob).not.toBe(bobCarol);
    expect(aliceCarol).not.toBe(bobCarol);
  });

  it('should handle same identity twice (edge case)', () => {
    const id = '507f1f77bcf86cd799439011';

    const convId = deriveConversationId(id, id);

    expect(convId).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(convId)).toBe(true);
  });
});

describe('validateConversationId', () => {
  it('should return true for valid conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const convId = deriveConversationId(id1, id2);

    expect(validateConversationId(convId, id1, id2)).toBe(true);
    expect(validateConversationId(convId, id2, id1)).toBe(true);
  });

  it('should return false for invalid conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const id3 = '507f1f77bcf86cd799439013';
    const convId = deriveConversationId(id1, id2);

    expect(validateConversationId(convId, id1, id3)).toBe(false);
    expect(validateConversationId(convId, id2, id3)).toBe(false);
  });

  it('should return false for tampered conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';
    const convId = deriveConversationId(id1, id2);

    const tamperedId = 'a' + convId.slice(1);

    expect(validateConversationId(tamperedId, id1, id2)).toBe(false);
  });

  it('should return false for empty conversation ID', () => {
    const id1 = '507f1f77bcf86cd799439011';
    const id2 = '507f1f77bcf86cd799439012';

    expect(validateConversationId('', id1, id2)).toBe(false);
  });
});

describe('deriveSenderHintKey', () => {
  const conversationId = deriveConversationId(
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012'
  );

  it('should produce a 32-byte key', () => {
    const key = deriveSenderHintKey(conversationId);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('should be deterministic', () => {
    const key1 = deriveSenderHintKey(conversationId);
    const key2 = deriveSenderHintKey(conversationId);
    expect(key1).toEqual(key2);
  });

  it('should produce different keys for different conversations', () => {
    const convId2 = deriveConversationId(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013'
    );

    const key1 = deriveSenderHintKey(conversationId);
    const key2 = deriveSenderHintKey(convId2);

    expect(key1).not.toEqual(key2);
  });

  it('should produce different keys for different profiles', () => {
    const keyDefault = deriveSenderHintKey(conversationId, 'default');
    const keyCnsa2 = deriveSenderHintKey(conversationId, 'cnsa2');

    expect(keyDefault).not.toEqual(keyCnsa2);
  });

  it('should produce different keys than deriveReadStateKey', () => {
    const senderHintKey = deriveSenderHintKey(conversationId);
    const readStateKey = deriveReadStateKey(conversationId);

    expect(senderHintKey).not.toEqual(readStateKey);
  });
});

describe('deriveReadStateKey', () => {
  const conversationId = deriveConversationId(
    '507f1f77bcf86cd799439011',
    '507f1f77bcf86cd799439012'
  );

  it('should produce a 32-byte key', () => {
    const key = deriveReadStateKey(conversationId);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('should be deterministic', () => {
    const key1 = deriveReadStateKey(conversationId);
    const key2 = deriveReadStateKey(conversationId);
    expect(key1).toEqual(key2);
  });

  it('should produce different keys for different conversations', () => {
    const convId2 = deriveConversationId(
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439013'
    );

    const key1 = deriveReadStateKey(conversationId);
    const key2 = deriveReadStateKey(convId2);

    expect(key1).not.toEqual(key2);
  });

  it('should produce different keys for different profiles', () => {
    const keyDefault = deriveReadStateKey(conversationId, 'default');
    const keyCnsa2 = deriveReadStateKey(conversationId, 'cnsa2');

    expect(keyDefault).not.toEqual(keyCnsa2);
  });
});

describe('deriveSenderHintNonce', () => {
  it('should produce a 12-byte nonce', () => {
    const nonce = deriveSenderHintNonce('1n2b3c4d-abcdef12');
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(12);
  });

  it('should be deterministic', () => {
    const clientMessageId = '1n2b3c4d-abcdef12';
    const nonce1 = deriveSenderHintNonce(clientMessageId);
    const nonce2 = deriveSenderHintNonce(clientMessageId);
    expect(nonce1).toEqual(nonce2);
  });

  it('should produce different nonces for different message IDs', () => {
    const nonce1 = deriveSenderHintNonce('1n2b3c4d-abcdef12');
    const nonce2 = deriveSenderHintNonce('1n2b3c4d-abcdef13');
    expect(nonce1).not.toEqual(nonce2);
  });

  it('should handle various clientMessageId formats', () => {
    const formats = [
      'abc123-xyz789',
      '1234567890-ABCD',
      'a-b',
      'verylongmessageid123456789012345678901234567890',
    ];

    for (const id of formats) {
      const nonce = deriveSenderHintNonce(id);
      expect(nonce.length).toBe(12);
    }
  });

  it('should produce sufficiently different nonces (no obvious patterns)', () => {
    const nonces = [];
    for (let i = 0; i < 10; i++) {
      nonces.push(deriveSenderHintNonce(`msg-${i}-${Date.now()}`));
    }

    for (let i = 0; i < nonces.length; i++) {
      for (let j = i + 1; j < nonces.length; j++) {
        expect(nonces[i]).not.toEqual(nonces[j]);
      }
    }
  });
});
