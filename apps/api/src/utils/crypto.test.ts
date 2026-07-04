import { afterAll, describe, expect, test, mock } from 'bun:test';

mock.module('../config', () => ({
  config: {
    security: {
      otpSecret: 'test-otp-secret-for-testing',
      sessionSecret: 'test-session-secret-for-testing',
    },
  },
}));

import {
  hashOtp,
  hashIdentifier,
  hashIp,
  constantTimeCompare,
  hmacSign,
  hmacVerify,
  encrypt,
  decrypt,
  verifyDmMessageSignature,
  verifyMessageSignatureV2,
  verifyReactionSignatureV2,
} from './crypto';

describe('crypto utilities (security-critical)', () => {
  afterAll(() => {
    mock.restore();
  });

  describe('hashOtp', () => {
    test('binds hash to identifier', () => {
      const hashA = hashOtp('123456', 'user@example.com');
      const hashB = hashOtp('123456', 'other@example.com');
      expect(hashA).not.toBe(hashB);
    });

    test('is deterministic for same otp and identifier', () => {
      expect(hashOtp('123456', 'user@example.com')).toBe(
        hashOtp('123456', 'user@example.com')
      );
    });
  });

  describe('hashIdentifier and hashIp', () => {
    test('hashIdentifier does not contain raw identifier', () => {
      const identifier = 'user@example.com';
      const hash = hashIdentifier(identifier);
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain('@');
      expect(hash).not.toContain('user');
    });

    test('hashIp is deterministic and hides raw ip', () => {
      const hash = hashIp('192.168.1.1');
      expect(hash).toHaveLength(64);
      expect(hash).not.toContain('192');
      expect(hashIp('192.168.1.1')).toBe(hash);
    });
  });

  describe('constantTimeCompare', () => {
    test('returns true for equal strings', () => {
      expect(constantTimeCompare('abc', 'abc')).toBe(true);
    });

    test('returns false for different strings of same length', () => {
      expect(constantTimeCompare('abc', 'abd')).toBe(false);
    });

    test('returns false for different lengths without throwing', () => {
      expect(constantTimeCompare('abc', 'abcd')).toBe(false);
    });
  });

  describe('hmacSign and hmacVerify', () => {
    test('round-trips valid signatures', () => {
      const data = 'user@example.com:123456';
      const signature = hmacSign(data);
      expect(hmacVerify(data, signature)).toBe(true);
    });

    test('rejects tampered data', () => {
      const signature = hmacSign('original-data');
      expect(hmacVerify('tampered-data', signature)).toBe(false);
    });

    test('rejects tampered signature', () => {
      const signature = hmacSign('data');
      const tampered = signature.slice(0, -1) + (signature.endsWith('a') ? 'b' : 'a');
      expect(hmacVerify('data', tampered)).toBe(false);
    });
  });

  describe('encrypt and decrypt', () => {
    test('round-trips plaintext', () => {
      const plaintext = 'user@example.com:123456';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    test('returns null for tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      const tampered = encrypted.slice(0, -4) + 'XXXX';
      expect(decrypt(tampered)).toBeNull();
    });

    test('returns null for invalid base64 payload', () => {
      expect(decrypt('not-valid')).toBeNull();
    });
  });

  describe('verifyDmMessageSignature', () => {
    test('accepts valid Ed25519 signature', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } =
        await import('@adieuu/crypto');
      const { MESSAGE_SIGN_DOMAIN_V1 } = await import('@adieuu/shared');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const wrappedKeys = [{ deviceId: 'dev1', wrappedKey: 'key' }];
      // v1 client preimage: domain || ciphertext || nonce || JSON(wrappedKeys)
      const signatureData = concatBytes(
        toBytes(MESSAGE_SIGN_DOMAIN_V1),
        fromBase64(ciphertext),
        fromBase64(nonce),
        toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);

      expect(
        verifyDmMessageSignature(
          toBase64(publicKey),
          ciphertext,
          nonce,
          wrappedKeys,
          toBase64(signature)
        )
      ).toBe(true);
    });

    test('rejects invalid signature', async () => {
      const { generateSigningKeyPair, sign, toBase64, concatBytes, toBytes, fromBase64 } =
        await import('@adieuu/crypto');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const wrappedKeys: unknown[] = [];
      const signatureData = concatBytes(
        fromBase64(ciphertext),
        fromBase64(nonce),
        toBytes(JSON.stringify(wrappedKeys))
      );
      const signature = sign(privateKey, signatureData);
      const { publicKey: wrongPublicKey } = generateSigningKeyPair();

      expect(
        verifyDmMessageSignature(
          toBase64(wrongPublicKey),
          ciphertext,
          nonce,
          wrappedKeys,
          toBase64(signature)
        )
      ).toBe(false);
    });

    test('rejects malformed base64 inputs', () => {
      expect(
        verifyDmMessageSignature('!!!', 'cipher', 'nonce', [], 'signature')
      ).toBe(false);
    });
  });

  describe('verifyMessageSignatureV2 (context-bound ingest verification)', () => {
    const context = {
      conversationId: 'c'.repeat(24),
      fromIdentityId: 'f'.repeat(24),
      clientMessageId: '1e0e7c1c-9ad9-4a79-a1f4-98b915cb2f7b',
    };

    async function makeSignedMessage() {
      const { generateSigningKeyPair, sign, toBase64, toBytes } = await import('@adieuu/crypto');
      const { buildMessageSignaturePreimageV2 } = await import('@adieuu/shared');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const wrappedKeys = [{
        identityId: 'a'.repeat(24),
        ephemeralPublicKey: 'eph==',
        kemCiphertext: 'kem==',
        wrappedSessionKey: 'wsk==',
        wrappingNonce: 'wn==',
        preKeyType: 'static' as const,
      }];
      const preimage = buildMessageSignaturePreimageV2(context, ciphertext, nonce, wrappedKeys);
      const signature = toBase64(sign(privateKey, toBytes(preimage)));
      return { publicKeyB64: toBase64(publicKey), ciphertext, nonce, wrappedKeys, signature };
    }

    test('accepts a valid v2 signature', async () => {
      const msg = await makeSignedMessage();
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64, context, msg.ciphertext, msg.nonce, msg.wrappedKeys, msg.signature
        )
      ).toBe(true);
    });

    test('rejects when replayed into a different conversation', async () => {
      const msg = await makeSignedMessage();
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64,
          { ...context, conversationId: 'd'.repeat(24) },
          msg.ciphertext, msg.nonce, msg.wrappedKeys, msg.signature
        )
      ).toBe(false);
    });

    test('rejects when attributed to a different sender', async () => {
      const msg = await makeSignedMessage();
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64,
          { ...context, fromIdentityId: 'e'.repeat(24) },
          msg.ciphertext, msg.nonce, msg.wrappedKeys, msg.signature
        )
      ).toBe(false);
    });

    test('rejects when the clientMessageId is swapped', async () => {
      const msg = await makeSignedMessage();
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64,
          { ...context, clientMessageId: '00000000-0000-4000-8000-000000000000' },
          msg.ciphertext, msg.nonce, msg.wrappedKeys, msg.signature
        )
      ).toBe(false);
    });

    test('rejects tampered wrapped keys', async () => {
      const msg = await makeSignedMessage();
      const tamperedKeys = [{ ...msg.wrappedKeys[0]!, wrappedSessionKey: 'tampered==' }];
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64, context, msg.ciphertext, msg.nonce, tamperedKeys, msg.signature
        )
      ).toBe(false);
    });

    test('accepts re-ordered wrapped-key object fields (canonical serialization)', async () => {
      const msg = await makeSignedMessage();
      // Simulates zod re-ordering/re-building objects during request parsing.
      const wk = msg.wrappedKeys[0]!;
      const reordered = [{
        preKeyType: wk.preKeyType,
        wrappingNonce: wk.wrappingNonce,
        wrappedSessionKey: wk.wrappedSessionKey,
        kemCiphertext: wk.kemCiphertext,
        ephemeralPublicKey: wk.ephemeralPublicKey,
        identityId: wk.identityId,
      }];
      expect(
        verifyMessageSignatureV2(
          msg.publicKeyB64, context, msg.ciphertext, msg.nonce, reordered, msg.signature
        )
      ).toBe(true);
    });

    test('rejects a v1-style signature presented as v2', async () => {
      const { generateSigningKeyPair, sign, toBase64, toBytes, fromBase64, concatBytes } =
        await import('@adieuu/crypto');
      const { MESSAGE_SIGN_DOMAIN_V1 } = await import('@adieuu/shared');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('cipher').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      // Legacy v1 preimage: domain || ciphertext || nonce || JSON(wrappedKeys), no context.
      const v1Preimage = concatBytes(
        toBytes(MESSAGE_SIGN_DOMAIN_V1),
        fromBase64(ciphertext),
        fromBase64(nonce),
        toBytes(JSON.stringify([]))
      );
      const signature = toBase64(sign(privateKey, v1Preimage));
      expect(
        verifyMessageSignatureV2(toBase64(publicKey), context, ciphertext, nonce, [], signature)
      ).toBe(false);
    });

    test('returns false (not throw) on malformed inputs', () => {
      expect(
        verifyMessageSignatureV2('!!!', context, 'ct', 'n', [], 'not-base64!!!')
      ).toBe(false);
    });
  });

  describe('verifyReactionSignatureV2', () => {
    const context = {
      conversationId: 'c'.repeat(24),
      messageId: 'a'.repeat(24),
      fromIdentityId: 'f'.repeat(24),
      clientReactionId: '9a4a4c3e-9c53-49d2-9f6c-2f0e6d3f6b11',
    };

    async function makeSignedReaction() {
      const { generateSigningKeyPair, sign, toBase64, toBytes } = await import('@adieuu/crypto');
      const { buildReactionSignaturePreimageV2 } = await import('@adieuu/shared');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('reaction').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      const preimage = buildReactionSignaturePreimageV2(context, ciphertext, nonce, []);
      const signature = toBase64(sign(privateKey, toBytes(preimage)));
      return { publicKeyB64: toBase64(publicKey), ciphertext, nonce, signature };
    }

    test('accepts a valid v2 reaction signature', async () => {
      const r = await makeSignedReaction();
      expect(
        verifyReactionSignatureV2(r.publicKeyB64, context, r.ciphertext, r.nonce, [], r.signature)
      ).toBe(true);
    });

    test('rejects when replayed onto a different message', async () => {
      const r = await makeSignedReaction();
      expect(
        verifyReactionSignatureV2(
          r.publicKeyB64,
          { ...context, messageId: 'b'.repeat(24) },
          r.ciphertext, r.nonce, [], r.signature
        )
      ).toBe(false);
    });

    test('rejects a message-domain signature presented as a reaction', async () => {
      const { generateSigningKeyPair, sign, toBase64, toBytes } = await import('@adieuu/crypto');
      const { buildMessageSignaturePreimageV2 } = await import('@adieuu/shared');
      const { publicKey, privateKey } = generateSigningKeyPair();
      const ciphertext = Buffer.from('reaction').toString('base64');
      const nonce = Buffer.from('nonce').toString('base64');
      // Sign with the MESSAGE domain using compatible context fields.
      const msgPreimage = buildMessageSignaturePreimageV2(
        {
          conversationId: context.conversationId,
          fromIdentityId: context.fromIdentityId,
          clientMessageId: context.clientReactionId,
        },
        ciphertext,
        nonce,
        []
      );
      const signature = toBase64(sign(privateKey, toBytes(msgPreimage)));
      expect(
        verifyReactionSignatureV2(toBase64(publicKey), context, ciphertext, nonce, [], signature)
      ).toBe(false);
    });
  });
});
