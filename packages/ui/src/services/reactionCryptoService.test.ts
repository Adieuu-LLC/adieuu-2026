import { describe, expect, test } from 'bun:test';
import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  toBase64,
  fromBase64,
  sign,
  verify,
  concatBytes,
  toBytes,
  randomBytes,
} from '@adieuu/crypto';
import type { PublicReaction, ReactionSignatureContext } from '@adieuu/shared';
import {
  REACTION_SIGN_DOMAIN_V1,
  buildReactionSignaturePreimageV2,
  buildMessageSignaturePreimageV2,
} from '@adieuu/shared';
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

function makeContext(fromIdentityId: string): ReactionSignatureContext {
  return {
    conversationId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    fromIdentityId,
    clientReactionId: crypto.randomUUID(),
  };
}

/**
 * Build the server-shaped PublicReaction. The context fields must match those
 * used at encryption time for v2 verification to succeed. `fromIdentityId`
 * can be overridden to simulate server-side sender substitution.
 */
function toPublicReaction(
  encrypted: ReturnType<typeof encryptReaction>,
  context: ReactionSignatureContext,
  fromIdentityIdOverride?: string
): PublicReaction {
  return {
    id: crypto.randomUUID(),
    messageId: context.messageId,
    conversationId: context.conversationId,
    fromIdentityId: fromIdentityIdOverride ?? context.fromIdentityId,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    wrappedKeys: encrypted.wrappedKeys,
    signature: encrypted.signature,
    cryptoProfile: encrypted.cryptoProfile,
    clientReactionId: context.clientReactionId,
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
        [r1.recipient, r2.recipient], sender.signingPrivateKey,
        makeContext(sender.identityId)
      );

      expect(result.ciphertext).toBeTruthy();
      expect(result.nonce).toBeTruthy();
      expect(result.wrappedKeys.length).toBe(2);
      expect(result.signature).toBeTruthy();
    });

    test('payload contains DecryptedReactionContent structure', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

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
        [recipient], sender.signingPrivateKey,
        makeContext(sender.identityId)
      );

      expect(result.wrappedKeys[0]?.preKeyType).toBe('otpk');
    });

    test('static key fallback path produces static preKeyType', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();

      const result = encryptReaction(
        '\uD83D\uDE02', sender.identityId,
        [recipient], sender.signingPrivateKey,
        makeContext(sender.identityId)
      );

      expect(result.wrappedKeys[0]?.preKeyType).toBe('static');
    });

    test('falls back to static wrapping when signed pre-key signature is invalid', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient({ preKeys: true });
      recipient.preKeys![0]!.signedPreKey.signature = toBase64(randomBytes(64));

      const result = encryptReaction(
        '\uD83D\uDE02',
        sender.identityId,
        [recipient],
        sender.signingPrivateKey,
        makeContext(sender.identityId)
      );
      // Device is not skipped: it gets a static wrap and the failure is reported.
      expect(result.wrappedKeys.length).toBe(1);
      expect(result.wrappedKeys[0]?.preKeyType).toBe('static');
      expect(result.spkVerificationFailedDeviceIds).toEqual([
        recipient.devices[0]!.deviceId,
      ]);
    });

    test('signature uses the v2 reaction domain and does not verify under other domains', () => {
      const sender = makeSender();
      const { recipient } = makeRecipient();
      const context = makeContext(sender.identityId);

      const result = encryptReaction(
        '\u2764\uFE0F', sender.identityId,
        [recipient], sender.signingPrivateKey,
        context
      );

      const sigPub = fromBase64(sender.signingPublicKey);

      const preimageV2 = buildReactionSignaturePreimageV2(
        context,
        result.ciphertext,
        result.nonce,
        result.wrappedKeys
      );
      expect(verify(sigPub, toBytes(preimageV2), fromBase64(result.signature))).toBe(true);

      // Must NOT verify under the legacy v1 reaction domain
      const v1Preimage = concatBytes(
        toBytes(REACTION_SIGN_DOMAIN_V1),
        fromBase64(result.ciphertext),
        fromBase64(result.nonce),
        toBytes(JSON.stringify(result.wrappedKeys))
      );
      expect(verify(sigPub, v1Preimage, fromBase64(result.signature))).toBe(false);

      // Must NOT verify as a message signature (domain separation)
      const msgPreimage = buildMessageSignaturePreimageV2(
        {
          conversationId: context.conversationId,
          fromIdentityId: context.fromIdentityId,
          clientMessageId: context.clientReactionId,
        },
        result.ciphertext,
        result.nonce,
        result.wrappedKeys
      );
      expect(verify(sigPub, toBytes(msgPreimage), fromBase64(result.signature))).toBe(false);
    });

    test('multi-recipient wrapping assigns correct identityIds', () => {
      const sender = makeSender();
      const r1 = makeRecipient();
      const r2 = makeRecipient();

      const result = encryptReaction(
        '\uD83D\uDE80', sender.identityId,
        [r1.recipient, r2.recipient], sender.signingPrivateKey,
        makeContext(sender.identityId)
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
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83C\uDF89', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

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
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.verified).toBe(true);
    });

    test('legacy v1-signed reaction still verifies', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

      // Replace the v2 signature with a legacy v1 signature as an old client
      // would have produced it.
      const v1Preimage = concatBytes(
        toBytes(REACTION_SIGN_DOMAIN_V1),
        fromBase64(encrypted.ciphertext),
        fromBase64(encrypted.nonce),
        toBytes(JSON.stringify(encrypted.wrappedKeys))
      );
      reaction.signature = toBase64(sign(sender.signingPrivateKey, v1Preimage));

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );
      expect(result.emoji).toBe('\uD83D\uDE00');
      expect(result.verified).toBe(true);
    });

    test('replayed reaction onto a different message fails verification', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);
      reaction.messageId = crypto.randomUUID();

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );
      expect(result.verified).toBe(false);
    });

    test('verified is false when fromIdentityId mismatches reaction sender', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context, 'different-sender-id');

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
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE00', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

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
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDC4D', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

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

    test('throws when pre-key wrapped reaction is decrypted without pre-key private keys', () => {
      const sender = makeSender();
      const r = makeRecipient({ preKeys: true });
      const context = makeContext(sender.identityId);
      const encrypted = encryptReaction(
        '\uD83D\uDC4D',
        sender.identityId,
        [r.recipient],
        sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

      expect(() =>
        decryptReaction(
          reaction,
          r.recipient.identityId,
          r.ecdhPrivateKey,
          r.kemPrivateKey,
          sender.signingPublicKey
        )
      ).toThrow('Pre-key private keys required to decrypt this reaction');
    });

    test('decryption with static device keys', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);

      const encrypted = encryptReaction(
        '\uD83D\uDE80', sender.identityId,
        [r.recipient], sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);

      const result = decryptReaction(
        reaction, r.recipient.identityId,
        r.ecdhPrivateKey, r.kemPrivateKey,
        sender.signingPublicKey
      );

      expect(result.emoji).toBe('\uD83D\uDE80');
      expect(result.verified).toBe(true);
    });

    test('uses cachedSessionKey when provided', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);
      const encrypted = encryptReaction(
        '\uD83D\uDE80',
        sender.identityId,
        [r.recipient],
        sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);
      const first = decryptReaction(
        reaction,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey
      );

      const missingWrapped = { ...reaction, wrappedKeys: [] };
      const cached = decryptReaction(
        missingWrapped,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey,
        undefined,
        undefined,
        first.sessionKey
      );
      expect(cached.emoji).toBe('\uD83D\uDE80');
    });

    test('returns verified=false when signature is malformed but payload decrypts', () => {
      const sender = makeSender();
      const r = makeRecipient();
      const context = makeContext(sender.identityId);
      const encrypted = encryptReaction(
        '\uD83C\uDF89',
        sender.identityId,
        [r.recipient],
        sender.signingPrivateKey,
        context
      );
      const reaction = toPublicReaction(encrypted, context);
      reaction.signature = 'not-base64-signature';

      const result = decryptReaction(
        reaction,
        r.recipient.identityId,
        r.ecdhPrivateKey,
        r.kemPrivateKey,
        sender.signingPublicKey
      );
      expect(result.emoji).toBe('\uD83C\uDF89');
      expect(result.verified).toBe(false);
    });
  });
});
