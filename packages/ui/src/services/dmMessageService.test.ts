/**
 * Tests for DM message encryption and decryption service.
 */

import { describe, it, expect } from 'bun:test';
import {
  encryptDmMessage,
  decryptDmMessage,
  generateClientMessageId,
  deriveConversationId,
  encryptSenderId,
  decryptSenderHint,
  type EncryptMessageInput,
  type DecryptMessageInput,
  type RecipientPublicKeys,
} from './dmMessageService';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  toBase64,
} from '@adieuu/crypto';

describe('DM Message Service', () => {
  const aliceSigningKeys = generateSigningKeyPair();
  const aliceEcdhKeys = generateECDHKeyPair();
  const aliceKemKeys = generateKEMKeyPair('default');

  const bobSigningKeys = generateSigningKeyPair();
  const bobEcdhKeys = generateECDHKeyPair();
  const bobKemKeys = generateKEMKeyPair('default');

  const aliceIdentityId = '507f1f77bcf86cd799439011';
  const bobIdentityId = '507f1f77bcf86cd799439012';

  describe('encryptDmMessage', () => {
    it('should encrypt a message and return all required fields', () => {
      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };

      const input: EncryptMessageInput = {
        text: 'Hello, Bob!',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const result = encryptDmMessage(input);

      expect(result.ciphertext).toBeDefined();
      expect(result.ciphertext.length).toBeGreaterThan(0);
      expect(result.nonce).toBeDefined();
      expect(result.signature).toBeDefined();
      expect(result.wrappedKeys).toHaveLength(1);
      expect(result.cryptoProfile).toBe('default');

      const wrappedKey = result.wrappedKeys[0];
      expect(wrappedKey?.identityId).toBe(bobIdentityId);
      expect(wrappedKey?.deviceId).toBe('bob-device-1');
      expect(wrappedKey?.ephemeralPublicKey).toBeDefined();
      expect(wrappedKey?.kemCiphertext).toBeDefined();
      expect(wrappedKey?.wrappedSessionKey).toBeDefined();
      expect(wrappedKey?.wrappingNonce).toBeDefined();
    });

    it('should wrap session key for multiple recipients', () => {
      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };
      const alicePublicKeys: RecipientPublicKeys = {
        ecdh: aliceEcdhKeys.publicKey,
        kem: aliceKemKeys.publicKey,
        profile: 'default',
      };

      const input: EncryptMessageInput = {
        text: 'Hello, everyone!',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
          {
            identityId: aliceIdentityId,
            deviceId: 'alice-device-1',
            publicKeys: alicePublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      };

      const result = encryptDmMessage(input);

      expect(result.wrappedKeys).toHaveLength(2);
      expect(result.wrappedKeys.map((wk) => wk.identityId)).toContain(bobIdentityId);
      expect(result.wrappedKeys.map((wk) => wk.identityId)).toContain(aliceIdentityId);
    });
  });

  describe('decryptDmMessage', () => {
    it('should decrypt a message encrypted for the recipient', () => {
      const originalText = 'Secret message for Bob';

      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };

      const encryptInput: EncryptMessageInput = {
        text: originalText,
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const encrypted = encryptDmMessage(encryptInput);

      const decryptInput: DecryptMessageInput = {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: encrypted.wrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        recipientDeviceId: 'bob-device-1',
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
      };

      const decrypted = decryptDmMessage(decryptInput);

      expect(decrypted.text).toBe(originalText);
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
      expect(decrypted.fromDeviceId).toBe('alice-device-1');
      expect(decrypted.version).toBe(1);
    });

    it('should fail to decrypt with wrong recipient keys', () => {
      const wrongEcdhKeys = generateECDHKeyPair();
      const wrongKemKeys = generateKEMKeyPair('default');

      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };

      const encryptInput: EncryptMessageInput = {
        text: 'Secret message',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      };

      const encrypted = encryptDmMessage(encryptInput);

      const decryptInput: DecryptMessageInput = {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: encrypted.wrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        ecdhPrivateKey: wrongEcdhKeys.privateKey,
        kemPrivateKey: wrongKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
      };

      expect(() => decryptDmMessage(decryptInput)).toThrow();
    });

    it('should fail to decrypt with wrong sender signing key', () => {
      const wrongSigningKeys = generateSigningKeyPair();

      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };

      const encryptInput: EncryptMessageInput = {
        text: 'Secret message',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      };

      const encrypted = encryptDmMessage(encryptInput);

      const decryptInput: DecryptMessageInput = {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: encrypted.wrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(wrongSigningKeys.publicKey),
      };

      expect(() => decryptDmMessage(decryptInput)).toThrow('Message signature verification failed');
    });

    it('should fail when message not encrypted for recipient', () => {
      const carolIdentityId = '507f1f77bcf86cd799439013';

      const bobPublicKeys: RecipientPublicKeys = {
        ecdh: bobEcdhKeys.publicKey,
        kem: bobKemKeys.publicKey,
        profile: 'default',
      };

      const encryptInput: EncryptMessageInput = {
        text: 'Secret message',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      };

      const encrypted = encryptDmMessage(encryptInput);

      const decryptInput: DecryptMessageInput = {
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: encrypted.wrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: carolIdentityId,
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
      };

      expect(() => decryptDmMessage(decryptInput)).toThrow('Message not encrypted for this identity/device');
    });
  });

  describe('generateClientMessageId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateClientMessageId();
      const id2 = generateClientMessageId();
      const id3 = generateClientMessageId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should produce non-empty strings', () => {
      const id = generateClientMessageId();

      expect(id.length).toBeGreaterThan(0);
      expect(typeof id).toBe('string');
    });
  });

  describe('deriveConversationId', () => {
    it('should be symmetric', () => {
      const convId1 = deriveConversationId(aliceIdentityId, bobIdentityId);
      const convId2 = deriveConversationId(bobIdentityId, aliceIdentityId);

      expect(convId1).toBe(convId2);
    });

    it('should produce a 64-char hex string', () => {
      const convId = deriveConversationId(aliceIdentityId, bobIdentityId);

      expect(convId).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(convId)).toBe(true);
    });
  });

  describe('encryptSenderId / decryptSenderHint', () => {
    const conversationId = deriveConversationId(aliceIdentityId, bobIdentityId);

    it('should encrypt and decrypt sender ID correctly', () => {
      const clientMessageId = generateClientMessageId();
      const senderId = aliceIdentityId;

      const encrypted = encryptSenderId(conversationId, senderId, clientMessageId);
      const decrypted = decryptSenderHint(conversationId, encrypted, clientMessageId);

      expect(decrypted).toBe(senderId);
    });

    it('should produce base64 output', () => {
      const clientMessageId = generateClientMessageId();
      const encrypted = encryptSenderId(conversationId, aliceIdentityId, clientMessageId);

      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should produce different ciphertext for different messages', () => {
      const messageId1 = generateClientMessageId();
      const messageId2 = generateClientMessageId();

      const encrypted1 = encryptSenderId(conversationId, aliceIdentityId, messageId1);
      const encrypted2 = encryptSenderId(conversationId, aliceIdentityId, messageId2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should fail to decrypt with wrong conversation ID', () => {
      const clientMessageId = generateClientMessageId();
      const wrongConversationId = deriveConversationId(aliceIdentityId, '507f1f77bcf86cd799439099');

      const encrypted = encryptSenderId(conversationId, aliceIdentityId, clientMessageId);

      expect(() => decryptSenderHint(wrongConversationId, encrypted, clientMessageId)).toThrow();
    });

    it('should fail to decrypt with wrong client message ID', () => {
      const clientMessageId = generateClientMessageId();
      const wrongMessageId = generateClientMessageId();

      const encrypted = encryptSenderId(conversationId, aliceIdentityId, clientMessageId);

      expect(() => decryptSenderHint(conversationId, encrypted, wrongMessageId)).toThrow();
    });

    it('should work with both crypto profiles', () => {
      const clientMessageId = generateClientMessageId();

      const encryptedDefault = encryptSenderId(
        conversationId,
        aliceIdentityId,
        clientMessageId,
        'default'
      );
      const decryptedDefault = decryptSenderHint(
        conversationId,
        encryptedDefault,
        clientMessageId,
        'default'
      );
      expect(decryptedDefault).toBe(aliceIdentityId);

      const encryptedCnsa2 = encryptSenderId(
        conversationId,
        aliceIdentityId,
        clientMessageId,
        'cnsa2'
      );
      const decryptedCnsa2 = decryptSenderHint(
        conversationId,
        encryptedCnsa2,
        clientMessageId,
        'cnsa2'
      );
      expect(decryptedCnsa2).toBe(aliceIdentityId);

      expect(encryptedDefault).not.toBe(encryptedCnsa2);
    });

    it('should handle longer identity IDs', () => {
      const clientMessageId = generateClientMessageId();
      const longSenderId = '507f1f77bcf86cd799439011abcdef123456';

      const encrypted = encryptSenderId(conversationId, longSenderId, clientMessageId);
      const decrypted = decryptSenderHint(conversationId, encrypted, clientMessageId);

      expect(decrypted).toBe(longSenderId);
    });
  });
});
