/**
 * Tests for read state encryption and decryption service.
 */

import { describe, it, expect } from 'bun:test';
import {
  encryptLastReadId,
  decryptLastReadId,
  isMessageUnread,
  hasUnreadMessages,
} from './readStateService';
import { deriveConversationId } from '@adieuu/crypto';

describe('Read State Service', () => {
  const aliceId = '507f1f77bcf86cd799439011';
  const bobId = '507f1f77bcf86cd799439012';
  const conversationId = deriveConversationId(aliceId, bobId);
  const messageId1 = '65a1b2c3d4e5f6a7b8c9d0e1';
  const messageId2 = '65a1b2c3d4e5f6a7b8c9d0e2';
  const messageId3 = '65a1b2c3d4e5f6a7b8c9d0e3';

  describe('encryptLastReadId / decryptLastReadId', () => {
    it('should encrypt and decrypt message ID correctly', () => {
      const encrypted = encryptLastReadId(conversationId, messageId1);
      const decrypted = decryptLastReadId(conversationId, encrypted);

      expect(decrypted).toBe(messageId1);
    });

    it('should produce base64 output', () => {
      const encrypted = encryptLastReadId(conversationId, messageId1);

      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should produce different ciphertext each time (random nonce)', () => {
      const encrypted1 = encryptLastReadId(conversationId, messageId1);
      const encrypted2 = encryptLastReadId(conversationId, messageId1);

      expect(encrypted1).not.toBe(encrypted2);

      const decrypted1 = decryptLastReadId(conversationId, encrypted1);
      const decrypted2 = decryptLastReadId(conversationId, encrypted2);

      expect(decrypted1).toBe(messageId1);
      expect(decrypted2).toBe(messageId1);
    });

    it('should fail to decrypt with wrong conversation ID', () => {
      const wrongConversationId = deriveConversationId(aliceId, '507f1f77bcf86cd799439099');
      const encrypted = encryptLastReadId(conversationId, messageId1);

      expect(() => decryptLastReadId(wrongConversationId, encrypted)).toThrow();
    });

    it('should fail to decrypt tampered ciphertext', () => {
      const encrypted = encryptLastReadId(conversationId, messageId1);
      const bytes = atob(encrypted);
      const tampered = btoa(bytes.slice(0, -1) + String.fromCharCode(bytes.charCodeAt(bytes.length - 1) ^ 1));

      expect(() => decryptLastReadId(conversationId, tampered)).toThrow();
    });

    it('should fail to decrypt empty or too-short input', () => {
      expect(() => decryptLastReadId(conversationId, '')).toThrow();
      expect(() => decryptLastReadId(conversationId, btoa('short'))).toThrow();
    });

    it('should work with both crypto profiles', () => {
      const encryptedDefault = encryptLastReadId(conversationId, messageId1, 'default');
      const decryptedDefault = decryptLastReadId(conversationId, encryptedDefault, 'default');
      expect(decryptedDefault).toBe(messageId1);

      const encryptedCnsa2 = encryptLastReadId(conversationId, messageId1, 'cnsa2');
      const decryptedCnsa2 = decryptLastReadId(conversationId, encryptedCnsa2, 'cnsa2');
      expect(decryptedCnsa2).toBe(messageId1);

      expect(encryptedDefault).not.toBe(encryptedCnsa2);
    });

    it('should handle various message ID lengths', () => {
      const shortId = 'abc123';
      const longId = '65a1b2c3d4e5f6a7b8c9d0e1abcdef0123456789';

      const encryptedShort = encryptLastReadId(conversationId, shortId);
      const decryptedShort = decryptLastReadId(conversationId, encryptedShort);
      expect(decryptedShort).toBe(shortId);

      const encryptedLong = encryptLastReadId(conversationId, longId);
      const decryptedLong = decryptLastReadId(conversationId, encryptedLong);
      expect(decryptedLong).toBe(longId);
    });
  });

  describe('isMessageUnread', () => {
    it('should return true when lastReadMessageId is null', () => {
      expect(isMessageUnread(messageId1, null)).toBe(true);
    });

    it('should return true when messageId is newer', () => {
      expect(isMessageUnread(messageId2, messageId1)).toBe(true);
      expect(isMessageUnread(messageId3, messageId1)).toBe(true);
    });

    it('should return false when messageId equals lastReadMessageId', () => {
      expect(isMessageUnread(messageId1, messageId1)).toBe(false);
    });

    it('should return false when messageId is older', () => {
      expect(isMessageUnread(messageId1, messageId2)).toBe(false);
      expect(isMessageUnread(messageId1, messageId3)).toBe(false);
    });
  });

  describe('hasUnreadMessages', () => {
    it('should return false when lastMessageId is null', () => {
      expect(hasUnreadMessages(null, messageId1)).toBe(false);
      expect(hasUnreadMessages(null, null)).toBe(false);
    });

    it('should return true when lastReadMessageId is null', () => {
      expect(hasUnreadMessages(messageId1, null)).toBe(true);
    });

    it('should return true when lastMessageId is newer', () => {
      expect(hasUnreadMessages(messageId2, messageId1)).toBe(true);
    });

    it('should return false when caught up', () => {
      expect(hasUnreadMessages(messageId1, messageId1)).toBe(false);
      expect(hasUnreadMessages(messageId1, messageId2)).toBe(false);
    });
  });
});
