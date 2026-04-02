import { describe, expect, test } from 'bun:test';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  fromBase64,
  verify,
  concatBytes,
  toBytes,
} from '@adieuu/crypto';
import type { SerializedWrappedKey, PublicReaction } from '@adieuu/shared';
import { encryptReaction, decryptReaction } from './reactionCryptoService';
import type { RecipientKeys } from './conversationCryptoService';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRecipient(opts?: { preKeys?: boolean; otpk?: boolean }) {
  const signing = generateSigningKeyPair();
  const ecdh = generateECDHKeyPair();
  const kem = generateKEMKeyPair();
  const identityId = `identity-${crypto.randomUUID().slice(0, 8)}`;
  const deviceId = `device-${crypto.randomUUID().slice(0, 8)}`;

  const result: {
    recipient: RecipientKeys;
    ecdhPrivateKey: Uint8Array;
    kemPrivateKey: Uint8Array;
    spkEcdhPrivate?: Uint8Array;
    spkKemPrivate?: Uint8Array;
    otpkEcdhPrivate?: Uint8Array;
    otpkKemPrivate?: Uint8Array;
  } = {
    recipient: {
      identityId,
      signingPublicKey: toBase64(signing.publicKey),
      preferredCryptoProfile: 'default',
      devices: [{
        deviceId,
        name: deviceId,
        ecdhPublicKey: toBase64(ecdh.publicKey),
        kemPublicKey: toBase64(kem.publicKey),
      }],
    },
    ecdhPrivateKey: ecdh.privateKey,
    kemPrivateKey: kem.privateKey,
  };

  if (opts?.preKeys) {
    const spk = generateSignedPreKey(signing.privateKey);
    const preKeyEntry = {
      deviceId,
      signedPreKey: {
        keyId: spk.keyId,
        ecdhPublicKey: toBase64(spk.ecdh.publicKey),
        kemPublicKey: toBase64(spk.kem.publicKey),
        signature: toBase64(spk.signature),
      },
      oneTimePreKey: null as { keyId: string; ecdhPublicKey: string; kemPublicKey: string } | null,
    };
    result.spkEcdhPrivate = spk.ecdh.privateKey;
    result.spkKemPrivate = spk.kem.privateKey;

    if (opts.otpk) {
      const [otpk] = generateOneTimePreKeys(1);
      preKeyEntry.oneTimePreKey = {
        keyId: otpk!.keyId,
        ecdhPublicKey: toBase64(otpk!.ecdh.publicKey),
        kemPublicKey: toBase64(otpk!.kem.publicKey),
      };
      result.otpkEcdhPrivate = otpk!.ecdh.privateKey;
      result.otpkKemPrivate = otpk!.kem.privateKey;
    }
    result.recipient.preKeys = [preKeyEntry];
  }

  return result;
}

function makeSender() {
  const signing = generateSigningKeyPair();
  return {
    signingPrivateKey: signing.privateKey,
    signingPublicKey: toBase64(signing.publicKey),
    identityId: `sender-${crypto.randomUUID().slice(0, 8)}`,
  };
}

function toPublicReaction(
  encrypted: ReturnType<typeof encryptReaction>,
  fromIdentityId: string
): PublicReaction {
  return {
    id: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    fromIdentityId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    wrappedKeys: encrypted.wrappedKeys,
    signature: encrypted.signature,
    cryptoProfile: encrypted.cryptoProfile,
    clientReactionId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reactionCryptoService', () => {
  describe('encryptReaction', () => {
    test('produces valid EncryptedMessage with wrapped keys for all recipient devices', () => {
      const sender = makeSender();
      const r1 = makeRecipient();
      const r2 = makeRecipient();

      const result = encryptReaction(
        '\u2764\uFE0F', sender.identityId,
        [r1.recipient, r2.recipient], sender.signingPrivateKey
      );

      expect(result.ciphertext).toBeTruthy();
      expect(result.nonce).toBeTruthy();
      expect(result.wrappedKeys.length).toBe(2);
      expect(result.signature).toBeTruthy();
    });

    test('payload contains DecryptedReactionContent structure', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      const decrypted = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(decrypted.emoji).toBe('\uD83D\uDE00');
      expect(decrypted.fromIdentityId).toBe(sender.identityId);
    });

    test('SPK+OTPK pre-key path produces otpk preKeyType', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient({ preKeys: true, otpk: true });

      const result = encryptReaction(
        '\uD83D\uDC4D', sender.identityId,
        [recipient], sender.signingPrivateKey
      );

      expect(result.wrappedKeys[0]?.preKeyType).toBe('otpk');
    });

    test('static key fallback path produces static preKeyType', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();

      const result = encryptReaction(
        '\uD83D\uDE02', sender.identityId,
        [recipient], sender.signingPrivateKey
      );

      expect(result.wrappedKeys[0]?.preKeyType).toBe('static');
    });

    test('signature uses adieuu-reaction-v1 domain', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();

      const result = encryptReaction(
        '\u2764\uFE0F', sender.identityId,
        [recipient], sender.signingPrivateKey
      );

      const dataToVerify = concatBytes(
        toBytes('adieuu-reaction-v1'),
        fromBase64(result.ciphertext),
        fromBase64(result.nonce),
        toBytes(JSON.stringify(result.wrappedKeys))
      );

      const sigPub = fromBase64(sender.signingPublicKey);
      expect(verify(sigPub, dataToVerify, fromBase64(result.signature))).toBe(true);

      // Verify it does NOT match message domain
      const wrongDomain = concatBytes(
        toBytes('adieuu-msg-v1'),
        fromBase64(result.ciphertext),
        fromBase64(result.nonce),
        toBytes(JSON.stringify(result.wrappedKeys))
      );
      expect(verify(sigPub, wrongDomain, fromBase64(result.signature))).toBe(false);
    });

    test('multi-recipient wrapping assigns correct identityIds', () => {
      const sender = makeSender();
      const r1 = makeRecipient();
      const r2 = makeRecipient();

      const result = encryptReaction(
        '\uD83D\uDE80', sender.identityId,
        [r1.recipient, r2.recipient], sender.signingPrivateKey
      );

      const ids = result.wrappedKeys.map((wk) => wk.identityId);
      expect(ids).toContain(r1.recipient.identityId);
      expect(ids).toContain(r2.recipient.identityId);
    });
  });

  describe('decryptReaction', () => {
    test('round-trip: encrypt then decrypt recovers emoji', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83C\uDF89', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.emoji).toBe('\uD83C\uDF89');
    });

    test('verified flag is true for valid signatures', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.verified).toBe(true);
    });

    test('verified is false when fromIdentityId mismatches reaction sender', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, 'different-sender-id');

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.verified).toBe(false);
    });

    test('throws when no wrapped key found for identity', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      expect(() => {
        decryptReaction(
          reaction, 'wrong-identity',
          r.ecdhPrivateKey, r.kemPrivateKey,
          sender.signingPublicKey
        );
      }).toThrow('No wrapped key found for this identity');
    });

    test('decryption with pre-key private keys (SPK+OTPK)', () => {
      const sender = makeSender();
      const r = makeRecipient({ preKeys: true, otpk: true });

      const encrypted = encryptReaction(
        '\uD83D\uDC4D', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey,
        {
          spkEcdhPrivate: r.spkEcdhPrivate!,
          spkKemPrivate: r.spkKemPrivate!,
          otpkEcdhPrivate: r.otpkEcdhPrivate!,
          otpkKemPrivate: r.otpkKemPrivate!,
        }
      );

      expect(result.emoji).toBe('\uD83D\uDC4D');
      expect(result.verified).toBe(true);
    });

    test('decryption with static device keys', () => {
      const sender = makeSender();
      const r = makeRecipient();

      const encrypted = encryptReaction(
        '\uD83D\uDE80', sender.identityId,
        [r.recipient], sender.signingPrivateKey
      );
      const reaction = toPublicReaction(encrypted, sender.identityId);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.emoji).toBe('\uD83D\uDE80');
      expect(result.verified).toBe(true);
    });
  });
});
