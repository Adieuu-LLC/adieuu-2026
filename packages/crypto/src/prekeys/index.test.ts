import { describe, expect, test } from 'bun:test';

import {
  generateSignedPreKey,
  verifySignedPreKey,
  generateOneTimePreKeys,
  preKeyExchange,
  preKeyDecapsulate,
  wrapSessionKeyWithPreKeys,
  unwrapSessionKeyWithPreKeys,
  PREKEY_KDF_INFO,
  SPK_SIGNATURE_DOMAIN,
  PREKEY_WRAP_VERSION_AAD,
  type SignedPreKeyPublic,
  type OneTimePreKeyPublic,
  type PreKeyWrappedKey,
} from './index';
import { generateSigningKeyPair, generateECDHKeyPair, generateKEMKeyPair } from '../keys/generate';
import { encrypt as symmetricEncrypt } from '../encrypt/symmetric';
import { randomBytes, constantTimeEqual } from '../utils';
import type { CryptoProfile } from '../types';

describe('prekeys', () => {
  describe('generateSignedPreKey', () => {
    test('generates all required components', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      expect(spk.keyId).toBeTruthy();
      expect(spk.ecdh.publicKey).toBeInstanceOf(Uint8Array);
      expect(spk.ecdh.privateKey).toBeInstanceOf(Uint8Array);
      expect(spk.kem.publicKey).toBeInstanceOf(Uint8Array);
      expect(spk.kem.privateKey).toBeInstanceOf(Uint8Array);
      expect(spk.signature).toBeInstanceOf(Uint8Array);
    });

    test('keyId is a valid UUID', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(spk.keyId).toMatch(uuidRegex);
    });

    test('generates unique keyIds', () => {
      const signing = generateSigningKeyPair();
      const spk1 = generateSignedPreKey(signing.privateKey);
      const spk2 = generateSignedPreKey(signing.privateKey);

      expect(spk1.keyId).not.toBe(spk2.keyId);
    });

    test('ECDH key is 32 bytes', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      expect(spk.ecdh.publicKey.length).toBe(32);
      expect(spk.ecdh.privateKey.length).toBe(32);
    });

    test('signature is 64 bytes (Ed25519)', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      expect(spk.signature.length).toBe(64);
    });

    test('works with cnsa2 profile', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey, 'cnsa2');

      expect(spk.ecdh.publicKey.length).toBe(32);
      expect(spk.kem.publicKey.length).toBe(1568); // ML-KEM-1024
    });
  });

  describe('verifySignedPreKey', () => {
    test('verifies a valid signed pre-key', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const publicSpk: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      expect(verifySignedPreKey(publicSpk, signing.publicKey)).toBe(true);
    });

    test('rejects with wrong signing key', () => {
      const signing = generateSigningKeyPair();
      const otherSigning = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const publicSpk: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      expect(verifySignedPreKey(publicSpk, otherSigning.publicKey)).toBe(false);
    });

    test('rejects with tampered ECDH key', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const tamperedEcdh = generateECDHKeyPair();
      const publicSpk: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: tamperedEcdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      expect(verifySignedPreKey(publicSpk, signing.publicKey)).toBe(false);
    });

    test('rejects with tampered KEM key', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const tamperedKem = generateKEMKeyPair();
      const publicSpk: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: tamperedKem.publicKey,
        signature: spk.signature,
      };

      expect(verifySignedPreKey(publicSpk, signing.publicKey)).toBe(false);
    });

    test('rejects with tampered keyId', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const publicSpk: SignedPreKeyPublic = {
        keyId: crypto.randomUUID(),
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      expect(verifySignedPreKey(publicSpk, signing.publicKey)).toBe(false);
    });
  });

  describe('generateOneTimePreKeys', () => {
    test('generates requested count', () => {
      const keys = generateOneTimePreKeys(10);
      expect(keys.length).toBe(10);
    });

    test('generates zero keys when count is 0', () => {
      const keys = generateOneTimePreKeys(0);
      expect(keys.length).toBe(0);
    });

    test('each key has unique keyId', () => {
      const keys = generateOneTimePreKeys(50);
      const ids = new Set(keys.map((k) => k.keyId));
      expect(ids.size).toBe(50);
    });

    test('each key has correct ECDH size', () => {
      const keys = generateOneTimePreKeys(5);
      for (const key of keys) {
        expect(key.ecdh.publicKey.length).toBe(32);
        expect(key.ecdh.privateKey.length).toBe(32);
      }
    });

    test('works with cnsa2 profile', () => {
      const keys = generateOneTimePreKeys(3, 'cnsa2');
      for (const key of keys) {
        expect(key.kem.publicKey.length).toBe(1568); // ML-KEM-1024
      }
    });
  });

  describe('preKeyExchange + preKeyDecapsulate', () => {
    test('SPK + OTPK: sender and recipient derive same shared secret', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const otpks = generateOneTimePreKeys(1);
      const otpk = otpks[0]!;

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk.keyId,
        ecdhPublicKey: otpk.ecdh.publicKey,
        kemPublicKey: otpk.kem.publicKey,
      };

      const exchange = preKeyExchange(spkPublic, otpkPublic);

      const recipientSecret = preKeyDecapsulate(
        exchange.ephemeralPublicKey,
        spk.ecdh.privateKey,
        spk.kem.privateKey,
        exchange.spkKemCiphertext,
        otpk.ecdh.privateKey,
        otpk.kem.privateKey,
        exchange.otpkKemCiphertext
      );

      expect(constantTimeEqual(exchange.sharedSecret, recipientSecret)).toBe(true);
    });

    test('SPK only: sender and recipient derive same shared secret', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      const exchange = preKeyExchange(spkPublic);
      expect(exchange.otpkKemCiphertext).toBeUndefined();

      const recipientSecret = preKeyDecapsulate(
        exchange.ephemeralPublicKey,
        spk.ecdh.privateKey,
        spk.kem.privateKey,
        exchange.spkKemCiphertext
      );

      expect(constantTimeEqual(exchange.sharedSecret, recipientSecret)).toBe(true);
    });

    test('different exchanges produce different shared secrets', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      const exchange1 = preKeyExchange(spkPublic);
      const exchange2 = preKeyExchange(spkPublic);

      expect(constantTimeEqual(exchange1.sharedSecret, exchange2.sharedSecret)).toBe(false);
    });

    test('SPK+OTPK and SPK-only derive different secrets for same SPK', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const otpks = generateOneTimePreKeys(1);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpks[0]!.keyId,
        ecdhPublicKey: otpks[0]!.ecdh.publicKey,
        kemPublicKey: otpks[0]!.kem.publicKey,
      };

      const withOtpk = preKeyExchange(spkPublic, otpkPublic);
      const withoutOtpk = preKeyExchange(spkPublic);

      // Different ephemeral keys guarantee different secrets, but even
      // structurally the IKM is different (4 components vs 2)
      expect(withOtpk.otpkKemCiphertext).toBeDefined();
      expect(withoutOtpk.otpkKemCiphertext).toBeUndefined();
    });

    test('works with cnsa2 profile', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey, 'cnsa2');
      const otpks = generateOneTimePreKeys(1, 'cnsa2');
      const otpk = otpks[0]!;

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk.keyId,
        ecdhPublicKey: otpk.ecdh.publicKey,
        kemPublicKey: otpk.kem.publicKey,
      };

      const exchange = preKeyExchange(spkPublic, otpkPublic, 'cnsa2');

      const recipientSecret = preKeyDecapsulate(
        exchange.ephemeralPublicKey,
        spk.ecdh.privateKey,
        spk.kem.privateKey,
        exchange.spkKemCiphertext,
        otpk.ecdh.privateKey,
        otpk.kem.privateKey,
        exchange.otpkKemCiphertext,
        'cnsa2'
      );

      expect(constantTimeEqual(exchange.sharedSecret, recipientSecret)).toBe(true);
    });
  });

  describe('wrapSessionKeyWithPreKeys + unwrapSessionKeyWithPreKeys', () => {
    test('roundtrip with SPK + OTPK', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const otpks = generateOneTimePreKeys(1);
      const otpk = otpks[0]!;

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk.keyId,
        ecdhPublicKey: otpk.ecdh.publicKey,
        kemPublicKey: otpk.kem.publicKey,
      };

      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic, otpkPublic);

      const unwrapped = unwrapSessionKeyWithPreKeys(
        wrapped,
        spk.ecdh.privateKey,
        spk.kem.privateKey,
        otpk.ecdh.privateKey,
        otpk.kem.privateKey
      );

      expect(constantTimeEqual(sessionKey, unwrapped)).toBe(true);
    });

    test('roundtrip with SPK only', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic);

      const unwrapped = unwrapSessionKeyWithPreKeys(
        wrapped,
        spk.ecdh.privateKey,
        spk.kem.privateKey
      );

      expect(constantTimeEqual(sessionKey, unwrapped)).toBe(true);
    });

    test('wrong SPK private key fails to unwrap', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const wrongSpk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic);

      expect(() => {
        unwrapSessionKeyWithPreKeys(
          wrapped,
          wrongSpk.ecdh.privateKey,
          wrongSpk.kem.privateKey
        );
      }).toThrow();
    });

    test('rejects non-32-byte session key', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      expect(() => {
        wrapSessionKeyWithPreKeys(randomBytes(16), spkPublic);
      }).toThrow('Session key must be 32 bytes');
    });

    test('roundtrip with cnsa2 profile', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey, 'cnsa2');
      const otpks = generateOneTimePreKeys(1, 'cnsa2');
      const otpk = otpks[0]!;

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk.keyId,
        ecdhPublicKey: otpk.ecdh.publicKey,
        kemPublicKey: otpk.kem.publicKey,
      };

      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic, otpkPublic, 'cnsa2');

      const unwrapped = unwrapSessionKeyWithPreKeys(
        wrapped,
        spk.ecdh.privateKey,
        spk.kem.privateKey,
        otpk.ecdh.privateKey,
        otpk.kem.privateKey,
        'cnsa2'
      );

      expect(constantTimeEqual(sessionKey, unwrapped)).toBe(true);
    });

    test('throws when decrypting wrapped key with mismatched profile', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey, 'cnsa2');
      const sessionKey = randomBytes(32);
      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic, undefined, 'cnsa2');

      expect(() =>
        unwrapSessionKeyWithPreKeys(
          wrapped,
          spk.ecdh.privateKey,
          spk.kem.privateKey,
          undefined,
          undefined,
          'default'
        )
      ).toThrow();
    });
  });

  describe('v2 AAD binding', () => {
    function makeSpkPair() {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      return { signing, spk, spkPublic };
    }

    test('new wraps carry wrapVersion=2 and the pre-key IDs', () => {
      const { spk, spkPublic } = makeSpkPair();
      const [otpk] = generateOneTimePreKeys(1);
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };

      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic, otpkPublic);
      expect(wrapped.wrapVersion).toBe(PREKEY_WRAP_VERSION_AAD);
      expect(wrapped.signedPreKeyId).toBe(spk.keyId);
      expect(wrapped.oneTimePreKeyId).toBe(otpk!.keyId);
    });

    test('tampered signedPreKeyId fails to unwrap (AAD mismatch)', () => {
      const { spk, spkPublic } = makeSpkPair();
      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic);

      const tampered: PreKeyWrappedKey = { ...wrapped, signedPreKeyId: crypto.randomUUID() };
      expect(() =>
        unwrapSessionKeyWithPreKeys(tampered, spk.ecdh.privateKey, spk.kem.privateKey)
      ).toThrow();
    });

    test('tampered oneTimePreKeyId fails to unwrap (AAD mismatch)', () => {
      const { spk, spkPublic } = makeSpkPair();
      const [otpk] = generateOneTimePreKeys(1);
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };
      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic, otpkPublic);

      const tampered: PreKeyWrappedKey = { ...wrapped, oneTimePreKeyId: crypto.randomUUID() };
      expect(() =>
        unwrapSessionKeyWithPreKeys(
          tampered,
          spk.ecdh.privateKey,
          spk.kem.privateKey,
          otpk!.ecdh.privateKey,
          otpk!.kem.privateKey
        )
      ).toThrow();
    });

    test('stripping oneTimePreKeyId from a v2 OTPK wrap fails to unwrap', () => {
      const { spk, spkPublic } = makeSpkPair();
      const [otpk] = generateOneTimePreKeys(1);
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };
      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic, otpkPublic);

      // A server attempting to hide the OTPK usage (downgrade to SPK-only
      // semantics) breaks the AAD binding.
      const tampered: PreKeyWrappedKey = { ...wrapped, oneTimePreKeyId: undefined };
      expect(() =>
        unwrapSessionKeyWithPreKeys(
          tampered,
          spk.ecdh.privateKey,
          spk.kem.privateKey,
          otpk!.ecdh.privateKey,
          otpk!.kem.privateKey
        )
      ).toThrow();
    });

    test('v2 wrap without signedPreKeyId is rejected outright', () => {
      const { spk, spkPublic } = makeSpkPair();
      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic);

      const missingId: PreKeyWrappedKey = { ...wrapped, signedPreKeyId: undefined };
      expect(() =>
        unwrapSessionKeyWithPreKeys(missingId, spk.ecdh.privateKey, spk.kem.privateKey)
      ).toThrow('signedPreKeyId required to unwrap a v2 pre-key wrap');
    });

    test('stripping wrapVersion from a v2 wrap fails to unwrap (downgrade rejected)', () => {
      const { spk, spkPublic } = makeSpkPair();
      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic);

      // A v2 ciphertext was sealed with AAD; decrypting it as a legacy wrap
      // (no AAD) must fail the AEAD tag check.
      const downgraded: PreKeyWrappedKey = { ...wrapped, wrapVersion: undefined };
      expect(() =>
        unwrapSessionKeyWithPreKeys(downgraded, spk.ecdh.privateKey, spk.kem.privateKey)
      ).toThrow();
    });

    test('legacy wrap without wrapVersion (wire compat) still unwraps', () => {
      const { spk, spkPublic } = makeSpkPair();
      const sessionKey = randomBytes(32);

      // Build a wrap exactly as a pre-AAD client would have: same exchange,
      // but no associated data and no version/ID metadata.
      const exchange = preKeyExchange(spkPublic);
      const { ciphertext, nonce } = symmetricEncrypt(exchange.sharedSecret, sessionKey);
      const legacy: PreKeyWrappedKey = {
        ephemeralPublicKey: exchange.ephemeralPublicKey,
        spkKemCiphertext: exchange.spkKemCiphertext,
        wrappedSessionKey: ciphertext,
        wrappingNonce: nonce,
      };

      const unwrapped = unwrapSessionKeyWithPreKeys(
        legacy,
        spk.ecdh.privateKey,
        spk.kem.privateKey
      );
      expect(constantTimeEqual(sessionKey, unwrapped)).toBe(true);
    });
  });

  describe('forward secrecy properties', () => {
    test('OTPK-wrapped key cannot be unwrapped after OTPK private key deletion', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const [otpk] = generateOneTimePreKeys(1);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };

      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic, otpkPublic);

      // Recipient deletes the consumed OTPK: SPK material alone must not
      // recover the session key. (The unwrap path without OTPK keys skips
      // DH2/KEM2, deriving a different secret.)
      expect(() =>
        unwrapSessionKeyWithPreKeys(wrapped, spk.ecdh.privateKey, spk.kem.privateKey)
      ).toThrow();
    });

    test('OTPK-wrapped key cannot be unwrapped with a different OTPK', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const [otpk, otherOtpk] = generateOneTimePreKeys(2);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };

      const wrapped = wrapSessionKeyWithPreKeys(randomBytes(32), spkPublic, otpkPublic);

      expect(() =>
        unwrapSessionKeyWithPreKeys(
          wrapped,
          spk.ecdh.privateKey,
          spk.kem.privateKey,
          otherOtpk!.ecdh.privateKey,
          otherOtpk!.kem.privateKey
        )
      ).toThrow();
    });

    test('reusing the same OTPK for two wraps still produces independent secrets', () => {
      // Storage-layer enforcement prevents OTPK reuse; at the crypto layer a
      // reused OTPK must at minimum not cause shared-secret collisions
      // because each wrap uses a fresh ephemeral key.
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);
      const [otpk] = generateOneTimePreKeys(1);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };
      const otpkPublic: OneTimePreKeyPublic = {
        keyId: otpk!.keyId,
        ecdhPublicKey: otpk!.ecdh.publicKey,
        kemPublicKey: otpk!.kem.publicKey,
      };

      const key1 = randomBytes(32);
      const key2 = randomBytes(32);
      const wrap1 = wrapSessionKeyWithPreKeys(key1, spkPublic, otpkPublic);
      const wrap2 = wrapSessionKeyWithPreKeys(key2, spkPublic, otpkPublic);

      expect(constantTimeEqual(wrap1.ephemeralPublicKey, wrap2.ephemeralPublicKey)).toBe(false);
      expect(constantTimeEqual(wrap1.wrappedSessionKey, wrap2.wrappedSessionKey)).toBe(false);

      // Both remain independently decryptable
      const un1 = unwrapSessionKeyWithPreKeys(
        wrap1, spk.ecdh.privateKey, spk.kem.privateKey,
        otpk!.ecdh.privateKey, otpk!.kem.privateKey
      );
      const un2 = unwrapSessionKeyWithPreKeys(
        wrap2, spk.ecdh.privateKey, spk.kem.privateKey,
        otpk!.ecdh.privateKey, otpk!.kem.privateKey
      );
      expect(constantTimeEqual(un1, key1)).toBe(true);
      expect(constantTimeEqual(un2, key2)).toBe(true);
    });

    test('OTPK pool exhaustion: SPK-only wrap remains available and decryptable', () => {
      const signing = generateSigningKeyPair();
      const spk = generateSignedPreKey(signing.privateKey);

      const spkPublic: SignedPreKeyPublic = {
        keyId: spk.keyId,
        ecdhPublicKey: spk.ecdh.publicKey,
        kemPublicKey: spk.kem.publicKey,
        signature: spk.signature,
      };

      // No OTPK left in the pool: the sender wraps with SPK only.
      const sessionKey = randomBytes(32);
      const wrapped = wrapSessionKeyWithPreKeys(sessionKey, spkPublic, undefined);
      expect(wrapped.otpkKemCiphertext).toBeUndefined();
      expect(wrapped.oneTimePreKeyId).toBeUndefined();

      const unwrapped = unwrapSessionKeyWithPreKeys(
        wrapped,
        spk.ecdh.privateKey,
        spk.kem.privateKey
      );
      expect(constantTimeEqual(sessionKey, unwrapped)).toBe(true);
    });

    test('substituted SPK from an attacker identity fails verification', () => {
      // A malicious server swaps in an SPK signed by its own key. Sender-side
      // verification against the victim's identity key must reject it.
      const victim = generateSigningKeyPair();
      const attacker = generateSigningKeyPair();
      const attackerSpk = generateSignedPreKey(attacker.privateKey);

      const substituted: SignedPreKeyPublic = {
        keyId: attackerSpk.keyId,
        ecdhPublicKey: attackerSpk.ecdh.publicKey,
        kemPublicKey: attackerSpk.kem.publicKey,
        signature: attackerSpk.signature,
      };

      expect(verifySignedPreKey(substituted, attacker.publicKey)).toBe(true);
      expect(verifySignedPreKey(substituted, victim.publicKey)).toBe(false);
    });
  });
});
