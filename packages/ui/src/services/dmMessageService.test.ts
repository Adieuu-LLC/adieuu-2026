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
  type PreKeyRecipientData,
  type PreKeyPrivateKeys,
} from './dmMessageService';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
} from '@adieuu/crypto';
import { z } from '@adieuu/shared/schemas';

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

  describe('encryptDmMessage with pre-key wrapping (forward secrecy)', () => {
    const bobSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');
    const bobOtpks = generateOneTimePreKeys(2, 'default');

    const bobSpkPublic: SignedPreKeyPublic = {
      keyId: bobSpk.keyId,
      ecdhPublicKey: bobSpk.ecdh.publicKey,
      kemPublicKey: bobSpk.kem.publicKey,
      signature: bobSpk.signature,
    };

    const bobOtpkPublic: OneTimePreKeyPublic = {
      keyId: bobOtpks[0]!.keyId,
      ecdhPublicKey: bobOtpks[0]!.ecdh.publicKey,
      kemPublicKey: bobOtpks[0]!.kem.publicKey,
    };

    it('should produce preKeyType "spk" when using SPK only', () => {
      const preKeyData: PreKeyRecipientData = {
        signedPreKey: bobSpkPublic,
        signedPreKeyId: bobSpk.keyId,
      };

      const input: EncryptMessageInput = {
        text: 'FS message (SPK only)',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const result = encryptDmMessage(input);

      expect(result.wrappedKeys).toHaveLength(1);
      const wk = result.wrappedKeys[0]!;
      expect(wk.preKeyType).toBe('spk');
      expect(wk.signedPreKeyId).toBe(bobSpk.keyId);
      expect(wk.oneTimePreKeyId).toBeUndefined();
      expect(wk.oneTimeKemCiphertext).toBeUndefined();
      expect(wk.deviceId).toBe('bob-device-1');
    });

    it('should produce preKeyType "otpk" when using SPK + OTPK', () => {
      const preKeyData: PreKeyRecipientData = {
        signedPreKey: bobSpkPublic,
        signedPreKeyId: bobSpk.keyId,
        oneTimePreKey: bobOtpkPublic,
        oneTimePreKeyId: bobOtpks[0]!.keyId,
      };

      const input: EncryptMessageInput = {
        text: 'FS message (SPK + OTPK)',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const result = encryptDmMessage(input);

      expect(result.wrappedKeys).toHaveLength(1);
      const wk = result.wrappedKeys[0]!;
      expect(wk.preKeyType).toBe('otpk');
      expect(wk.signedPreKeyId).toBe(bobSpk.keyId);
      expect(wk.oneTimePreKeyId).toBe(bobOtpks[0]!.keyId);
      expect(wk.oneTimeKemCiphertext).toBeDefined();
      expect(wk.oneTimeKemCiphertext!.length).toBeGreaterThan(0);
    });

    it('should support mixed wrapping (pre-key for recipient, static for sender)', () => {
      const preKeyData: PreKeyRecipientData = {
        signedPreKey: bobSpkPublic,
        signedPreKeyId: bobSpk.keyId,
        oneTimePreKey: bobOtpkPublic,
        oneTimePreKeyId: bobOtpks[0]!.keyId,
      };

      const input: EncryptMessageInput = {
        text: 'Mixed wrapping message',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData,
          },
          {
            identityId: aliceIdentityId,
            deviceId: 'alice-device-1',
            publicKeys: {
              ecdh: aliceEcdhKeys.publicKey,
              kem: aliceKemKeys.publicKey,
              profile: 'default',
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const result = encryptDmMessage(input);

      expect(result.wrappedKeys).toHaveLength(2);

      const bobWk = result.wrappedKeys.find((wk) => wk.identityId === bobIdentityId)!;
      expect(bobWk.preKeyType).toBe('otpk');
      expect(bobWk.signedPreKeyId).toBe(bobSpk.keyId);
      expect(bobWk.oneTimePreKeyId).toBe(bobOtpks[0]!.keyId);
      expect(bobWk.oneTimeKemCiphertext).toBeDefined();

      const aliceWk = result.wrappedKeys.find((wk) => wk.identityId === aliceIdentityId)!;
      expect(aliceWk.preKeyType).toBe('static');
      expect(aliceWk.signedPreKeyId).toBeUndefined();
      expect(aliceWk.oneTimePreKeyId).toBeUndefined();
      expect(aliceWk.oneTimeKemCiphertext).toBeUndefined();
    });

    it('should produce different ephemeral keys for each pre-key wrapped recipient', () => {
      const carolSigningKeys = generateSigningKeyPair();
      const carolSpk = generateSignedPreKey(carolSigningKeys.privateKey, 'default');
      const carolEcdhKeys = generateECDHKeyPair();
      const carolKemKeys = generateKEMKeyPair('default');

      const input: EncryptMessageInput = {
        text: 'Multi-recipient FS',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
          {
            identityId: '507f1f77bcf86cd799439013',
            deviceId: 'carol-device-1',
            publicKeys: {
              ecdh: carolEcdhKeys.publicKey,
              kem: carolKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: {
                keyId: carolSpk.keyId,
                ecdhPublicKey: carolSpk.ecdh.publicKey,
                kemPublicKey: carolSpk.kem.publicKey,
                signature: carolSpk.signature,
              },
              signedPreKeyId: carolSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      };

      const result = encryptDmMessage(input);

      expect(result.wrappedKeys).toHaveLength(2);
      expect(result.wrappedKeys[0]!.ephemeralPublicKey).not.toBe(
        result.wrappedKeys[1]!.ephemeralPublicKey
      );
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

  describe('decryptDmMessage with pre-key wrapping (forward secrecy)', () => {
    const bobSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');
    const bobOtpks = generateOneTimePreKeys(2, 'default');

    const bobSpkPublic: SignedPreKeyPublic = {
      keyId: bobSpk.keyId,
      ecdhPublicKey: bobSpk.ecdh.publicKey,
      kemPublicKey: bobSpk.kem.publicKey,
      signature: bobSpk.signature,
    };

    const bobOtpkPublic: OneTimePreKeyPublic = {
      keyId: bobOtpks[0]!.keyId,
      ecdhPublicKey: bobOtpks[0]!.ecdh.publicKey,
      kemPublicKey: bobOtpks[0]!.kem.publicKey,
    };

    it('should encrypt and decrypt round-trip with SPK only', () => {
      const originalText = 'FS message with SPK only';

      const encrypted = encryptDmMessage({
        text: originalText,
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      expect(encrypted.wrappedKeys[0]!.preKeyType).toBe('spk');

      const preKeyPrivateKeys: PreKeyPrivateKeys = {
        spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
        spkKemPrivateKey: bobSpk.kem.privateKey,
      };

      const decrypted = decryptDmMessage({
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
        preKeyPrivateKeys,
      });

      expect(decrypted.text).toBe(originalText);
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
      expect(decrypted.fromDeviceId).toBe('alice-device-1');
    });

    it('should encrypt and decrypt round-trip with SPK + OTPK', () => {
      const originalText = 'FS message with SPK + OTPK';

      const encrypted = encryptDmMessage({
        text: originalText,
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
              oneTimePreKey: bobOtpkPublic,
              oneTimePreKeyId: bobOtpks[0]!.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      expect(encrypted.wrappedKeys[0]!.preKeyType).toBe('otpk');

      const preKeyPrivateKeys: PreKeyPrivateKeys = {
        spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
        spkKemPrivateKey: bobSpk.kem.privateKey,
        otpkEcdhPrivateKey: bobOtpks[0]!.ecdh.privateKey,
        otpkKemPrivateKey: bobOtpks[0]!.kem.privateKey,
      };

      const decrypted = decryptDmMessage({
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
        preKeyPrivateKeys,
      });

      expect(decrypted.text).toBe(originalText);
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
    });

    it('should decrypt mixed wrapping (FS for recipient, static for sender)', () => {
      const originalText = 'Mixed wrapping round-trip';

      const encrypted = encryptDmMessage({
        text: originalText,
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
          {
            identityId: aliceIdentityId,
            deviceId: 'alice-device-1',
            publicKeys: {
              ecdh: aliceEcdhKeys.publicKey,
              kem: aliceKemKeys.publicKey,
              profile: 'default',
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      // Bob decrypts with pre-key private keys
      const bobDecrypted = decryptDmMessage({
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
        preKeyPrivateKeys: {
          spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
          spkKemPrivateKey: bobSpk.kem.privateKey,
        },
      });

      expect(bobDecrypted.text).toBe(originalText);

      // Alice decrypts with static device keys (no preKeyPrivateKeys)
      const aliceDecrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: encrypted.wrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: aliceIdentityId,
        recipientDeviceId: 'alice-device-1',
        ecdhPrivateKey: aliceEcdhKeys.privateKey,
        kemPrivateKey: aliceKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
      });

      expect(aliceDecrypted.text).toBe(originalText);
    });

    it('should fail to decrypt FS message without pre-key private keys', () => {
      const encrypted = encryptDmMessage({
        text: 'FS message',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      });

      expect(() =>
        decryptDmMessage({
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          recipientIdentityId: bobIdentityId,
          recipientDeviceId: 'bob-device-1',
          ecdhPrivateKey: bobEcdhKeys.privateKey,
          kemPrivateKey: bobKemKeys.privateKey,
          senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        })
      ).toThrow('Pre-key private keys required');
    });

    it('should fail to decrypt FS message with wrong pre-key private keys', () => {
      const wrongSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');

      const encrypted = encryptDmMessage({
        text: 'FS message',
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
      });

      expect(() =>
        decryptDmMessage({
          ciphertext: encrypted.ciphertext,
          nonce: encrypted.nonce,
          wrappedKeys: encrypted.wrappedKeys,
          signature: encrypted.signature,
          recipientIdentityId: bobIdentityId,
          recipientDeviceId: 'bob-device-1',
          ecdhPrivateKey: bobEcdhKeys.privateKey,
          kemPrivateKey: bobKemKeys.privateKey,
          senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
          preKeyPrivateKeys: {
            spkEcdhPrivateKey: wrongSpk.ecdh.privateKey,
            spkKemPrivateKey: wrongSpk.kem.privateKey,
          },
        })
      ).toThrow('Failed to unwrap session key with pre-keys');
    });
  });

  describe('signature stability through API round-trip (Zod parsing)', () => {
    // This schema mirrors the WrappedKeySchema in apps/api/src/routes/dm/controller.ts.
    // Zod v3 .parse() creates a new object with properties in schema definition order,
    // which can reorder properties relative to the input object.
    const WrappedKeySchema = z.object({
      identityId: z.string().length(24),
      deviceId: z.string(),
      ephemeralPublicKey: z.string().min(1),
      kemCiphertext: z.string().min(1),
      wrappedSessionKey: z.string().min(1),
      wrappingNonce: z.string().min(1),
      preKeyType: z.enum(['otpk', 'spk', 'static']),
      oneTimePreKeyId: z.string().uuid().optional(),
      signedPreKeyId: z.string().uuid().optional(),
      oneTimeKemCiphertext: z.string().min(1).optional(),
    });

    const bobSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');
    const bobOtpks = generateOneTimePreKeys(2, 'default');

    const bobSpkPublic: SignedPreKeyPublic = {
      keyId: bobSpk.keyId,
      ecdhPublicKey: bobSpk.ecdh.publicKey,
      kemPublicKey: bobSpk.kem.publicKey,
      signature: bobSpk.signature,
    };

    const bobOtpkPublic: OneTimePreKeyPublic = {
      keyId: bobOtpks[0]!.keyId,
      ecdhPublicKey: bobOtpks[0]!.ecdh.publicKey,
      kemPublicKey: bobOtpks[0]!.kem.publicKey,
    };

    it('should verify signature after Zod round-trip with OTPK wrapping', () => {
      const encrypted = encryptDmMessage({
        text: 'FS message through API',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
              oneTimePreKey: bobOtpkPublic,
              oneTimePreKeyId: bobOtpks[0]!.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      // Simulate API round-trip: Zod parses the wrappedKeys, potentially reordering properties
      const zodParsedWrappedKeys = encrypted.wrappedKeys.map((wk) =>
        WrappedKeySchema.parse(wk)
      );

      const preKeyPrivateKeys: PreKeyPrivateKeys = {
        spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
        spkKemPrivateKey: bobSpk.kem.privateKey,
        otpkEcdhPrivateKey: bobOtpks[0]!.ecdh.privateKey,
        otpkKemPrivateKey: bobOtpks[0]!.kem.privateKey,
      };

      const decrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: zodParsedWrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        recipientDeviceId: 'bob-device-1',
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
        preKeyPrivateKeys,
      });

      expect(decrypted.text).toBe('FS message through API');
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
    });

    it('should verify signature after Zod round-trip with SPK-only wrapping', () => {
      const encrypted = encryptDmMessage({
        text: 'SPK-only through API',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      const zodParsedWrappedKeys = encrypted.wrappedKeys.map((wk) =>
        WrappedKeySchema.parse(wk)
      );

      const preKeyPrivateKeys: PreKeyPrivateKeys = {
        spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
        spkKemPrivateKey: bobSpk.kem.privateKey,
      };

      const decrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: zodParsedWrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        recipientDeviceId: 'bob-device-1',
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
        preKeyPrivateKeys,
      });

      expect(decrypted.text).toBe('SPK-only through API');
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
    });

    it('should verify signature after Zod round-trip with static wrapping', () => {
      const encrypted = encryptDmMessage({
        text: 'Static through API',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      const zodParsedWrappedKeys = encrypted.wrappedKeys.map((wk) =>
        WrappedKeySchema.parse(wk)
      );

      const decrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: zodParsedWrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        recipientDeviceId: 'bob-device-1',
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
      });

      expect(decrypted.text).toBe('Static through API');
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
    });

    it('should verify signature after Zod round-trip with mixed wrapping', () => {
      const encrypted = encryptDmMessage({
        text: 'Mixed wrapping through API',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
              oneTimePreKey: bobOtpkPublic,
              oneTimePreKeyId: bobOtpks[0]!.keyId,
            },
          },
          {
            identityId: aliceIdentityId,
            deviceId: 'alice-device-1',
            publicKeys: {
              ecdh: aliceEcdhKeys.publicKey,
              kem: aliceKemKeys.publicKey,
              profile: 'default',
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      const zodParsedWrappedKeys = encrypted.wrappedKeys.map((wk) =>
        WrappedKeySchema.parse(wk)
      );

      // Bob decrypts (FS path)
      const bobDecrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: zodParsedWrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: bobIdentityId,
        recipientDeviceId: 'bob-device-1',
        ecdhPrivateKey: bobEcdhKeys.privateKey,
        kemPrivateKey: bobKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
        preKeyPrivateKeys: {
          spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
          spkKemPrivateKey: bobSpk.kem.privateKey,
          otpkEcdhPrivateKey: bobOtpks[0]!.ecdh.privateKey,
          otpkKemPrivateKey: bobOtpks[0]!.kem.privateKey,
        },
      });

      expect(bobDecrypted.text).toBe('Mixed wrapping through API');

      // Alice decrypts (static path)
      const aliceDecrypted = decryptDmMessage({
        ciphertext: encrypted.ciphertext,
        nonce: encrypted.nonce,
        wrappedKeys: zodParsedWrappedKeys,
        signature: encrypted.signature,
        recipientIdentityId: aliceIdentityId,
        recipientDeviceId: 'alice-device-1',
        ecdhPrivateKey: aliceEcdhKeys.privateKey,
        kemPrivateKey: aliceKemKeys.privateKey,
        senderSigningPublicKey: toBase64(aliceSigningKeys.publicKey),
        cryptoProfile: 'default',
      });

      expect(aliceDecrypted.text).toBe('Mixed wrapping through API');
    });
  });

  describe('forward secrecy guarantee: key deletion makes messages undecryptable', () => {
    const bobSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');
    const bobOtpks = generateOneTimePreKeys(2, 'default');

    const bobSpkPublic: SignedPreKeyPublic = {
      keyId: bobSpk.keyId,
      ecdhPublicKey: bobSpk.ecdh.publicKey,
      kemPublicKey: bobSpk.kem.publicKey,
      signature: bobSpk.signature,
    };

    const bobOtpkPublic: OneTimePreKeyPublic = {
      keyId: bobOtpks[0]!.keyId,
      ecdhPublicKey: bobOtpks[0]!.ecdh.publicKey,
      kemPublicKey: bobOtpks[0]!.kem.publicKey,
    };

    it('should fail to decrypt after SPK private key deletion (simulated rotation)', () => {
      const encrypted = encryptDmMessage({
        text: 'FS message before rotation',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      // Simulate key rotation: generate a completely new SPK (old private keys are gone)
      const rotatedSpk = generateSignedPreKey(bobSigningKeys.privateKey, 'default');

      expect(() =>
        decryptDmMessage({
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
          preKeyPrivateKeys: {
            spkEcdhPrivateKey: rotatedSpk.ecdh.privateKey,
            spkKemPrivateKey: rotatedSpk.kem.privateKey,
          },
        })
      ).toThrow('Failed to unwrap session key with pre-keys');
    });

    it('should fail to decrypt OTPK message when OTPK private keys are missing', () => {
      const encrypted = encryptDmMessage({
        text: 'FS message with OTPK',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
            preKeyData: {
              signedPreKey: bobSpkPublic,
              signedPreKeyId: bobSpk.keyId,
              oneTimePreKey: bobOtpkPublic,
              oneTimePreKeyId: bobOtpks[0]!.keyId,
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      // Attempt decrypt with correct SPK but without OTPK private keys (deleted after first use)
      expect(() =>
        decryptDmMessage({
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
          preKeyPrivateKeys: {
            spkEcdhPrivateKey: bobSpk.ecdh.privateKey,
            spkKemPrivateKey: bobSpk.kem.privateKey,
          },
        })
      ).toThrow('Failed to unwrap session key with pre-keys');
    });

    it('should always decrypt static messages regardless of pre-key state', () => {
      const encrypted = encryptDmMessage({
        text: 'Static message survives rotation',
        fromIdentityId: aliceIdentityId,
        fromDeviceId: 'alice-device-1',
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: {
              ecdh: bobEcdhKeys.publicKey,
              kem: bobKemKeys.publicKey,
              profile: 'default',
            },
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      expect(encrypted.wrappedKeys[0]!.preKeyType).toBe('static');

      // Decrypt works with static device keys even if pre-keys have been rotated/deleted
      const decrypted = decryptDmMessage({
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
      });

      expect(decrypted.text).toBe('Static message survives rotation');
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
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
