/**
 * Tests for DM reaction encryption (emoji payload).
 */

import { describe, it, expect } from 'bun:test';
import { encryptReaction, decryptReaction } from './dmReactionService';
import type { RecipientPublicKeys } from './dmMessageService';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  toBase64,
} from '@adieuu/crypto';

describe('dmReactionService', () => {
  const aliceSigningKeys = generateSigningKeyPair();
  const aliceEcdhKeys = generateECDHKeyPair();
  const aliceKemKeys = generateKEMKeyPair('default');

  const bobEcdhKeys = generateECDHKeyPair();
  const bobKemKeys = generateKEMKeyPair('default');

  const aliceIdentityId = '507f1f77bcf86cd799439011';
  const bobIdentityId = '507f1f77bcf86cd799439012';

  it('round-trips Unicode emoji including multi-code-unit sequences', () => {
    const bobPublicKeys: RecipientPublicKeys = {
      ecdh: bobEcdhKeys.publicKey,
      kem: bobKemKeys.publicKey,
      profile: 'default',
    };

    for (const emoji of ['👍', '😀', '🧑‍🚀']) {
      const encrypted = encryptReaction({
        emoji,
        fromIdentityId: aliceIdentityId,
        recipientKeys: [
          {
            identityId: bobIdentityId,
            deviceId: 'bob-device-1',
            publicKeys: bobPublicKeys,
          },
        ],
        signingPrivateKey: aliceSigningKeys.privateKey,
        cryptoProfile: 'default',
      });

      const decrypted = decryptReaction({
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

      expect(decrypted.emoji).toBe(emoji);
      expect(decrypted.fromIdentityId).toBe(aliceIdentityId);
      expect(decrypted.version).toBe(1);
    }
  });
});
