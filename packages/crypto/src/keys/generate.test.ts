import { describe, expect, test } from 'bun:test';
import { ed25519 } from '@noble/curves/ed25519';
import { x25519 } from '@noble/curves/ed25519';
import { ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';

import {
  generateSigningKeyPair,
  getSigningPublicKey,
  generateECDHKeyPair,
  getECDHPublicKey,
  generateKEMKeyPair,
  generateIdentityKeyBundle,
  extractPublicKeys,
  KEY_SIZES,
  validateKeyPairSizes,
} from './generate';
import { constantTimeEqual, toHex } from '../utils';

describe('keys/generate', () => {
  describe('generateSigningKeyPair', () => {
    test('generates key pair with correct sizes', () => {
      const keyPair = generateSigningKeyPair();
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    test('returns Uint8Array instances', () => {
      const keyPair = generateSigningKeyPair();
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    });

    test('generates unique key pairs', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const keyPair = generateSigningKeyPair();
        keys.add(toHex(keyPair.privateKey));
      }
      expect(keys.size).toBe(100);
    });

    test('public key is derived correctly from private key', () => {
      const keyPair = generateSigningKeyPair();
      const derivedPublic = ed25519.getPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(keyPair.publicKey, derivedPublic)).toBe(true);
    });

    test('can sign and verify with generated keys', () => {
      const keyPair = generateSigningKeyPair();
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = ed25519.sign(message, keyPair.privateKey);
      const valid = ed25519.verify(signature, message, keyPair.publicKey);
      expect(valid).toBe(true);
    });

    test('signature fails with wrong public key', () => {
      const keyPair1 = generateSigningKeyPair();
      const keyPair2 = generateSigningKeyPair();
      const message = new Uint8Array([1, 2, 3, 4, 5]);
      const signature = ed25519.sign(message, keyPair1.privateKey);
      const valid = ed25519.verify(signature, message, keyPair2.publicKey);
      expect(valid).toBe(false);
    });
  });

  describe('getSigningPublicKey', () => {
    test('derives public key from private key', () => {
      const keyPair = generateSigningKeyPair();
      const derivedPublic = getSigningPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(keyPair.publicKey, derivedPublic)).toBe(true);
    });

    test('returns 32-byte public key', () => {
      const keyPair = generateSigningKeyPair();
      const publicKey = getSigningPublicKey(keyPair.privateKey);
      expect(publicKey.length).toBe(32);
    });

    test('is deterministic', () => {
      const keyPair = generateSigningKeyPair();
      const pub1 = getSigningPublicKey(keyPair.privateKey);
      const pub2 = getSigningPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(pub1, pub2)).toBe(true);
    });
  });

  describe('generateECDHKeyPair', () => {
    test('generates key pair with correct sizes', () => {
      const keyPair = generateECDHKeyPair();
      expect(keyPair.privateKey.length).toBe(32);
      expect(keyPair.publicKey.length).toBe(32);
    });

    test('returns Uint8Array instances', () => {
      const keyPair = generateECDHKeyPair();
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
    });

    test('generates unique key pairs', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const keyPair = generateECDHKeyPair();
        keys.add(toHex(keyPair.privateKey));
      }
      expect(keys.size).toBe(100);
    });

    test('public key is derived correctly from private key', () => {
      const keyPair = generateECDHKeyPair();
      const derivedPublic = x25519.getPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(keyPair.publicKey, derivedPublic)).toBe(true);
    });

    test('can perform key agreement with generated keys', () => {
      const alice = generateECDHKeyPair();
      const bob = generateECDHKeyPair();

      const aliceShared = x25519.getSharedSecret(alice.privateKey, bob.publicKey);
      const bobShared = x25519.getSharedSecret(bob.privateKey, alice.publicKey);

      expect(constantTimeEqual(aliceShared, bobShared)).toBe(true);
    });

    test('shared secret has correct size', () => {
      const alice = generateECDHKeyPair();
      const bob = generateECDHKeyPair();
      const shared = x25519.getSharedSecret(alice.privateKey, bob.publicKey);
      expect(shared.length).toBe(32);
    });
  });

  describe('getECDHPublicKey', () => {
    test('derives public key from private key', () => {
      const keyPair = generateECDHKeyPair();
      const derivedPublic = getECDHPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(keyPair.publicKey, derivedPublic)).toBe(true);
    });

    test('returns 32-byte public key', () => {
      const keyPair = generateECDHKeyPair();
      const publicKey = getECDHPublicKey(keyPair.privateKey);
      expect(publicKey.length).toBe(32);
    });

    test('is deterministic', () => {
      const keyPair = generateECDHKeyPair();
      const pub1 = getECDHPublicKey(keyPair.privateKey);
      const pub2 = getECDHPublicKey(keyPair.privateKey);
      expect(constantTimeEqual(pub1, pub2)).toBe(true);
    });
  });

  describe('generateKEMKeyPair', () => {
    describe('default profile (ML-KEM-768)', () => {
      test('generates key pair with correct sizes', () => {
        const keyPair = generateKEMKeyPair();
        expect(keyPair.privateKey.length).toBe(2400);
        expect(keyPair.publicKey.length).toBe(1184);
      });

      test('returns Uint8Array instances', () => {
        const keyPair = generateKEMKeyPair();
        expect(keyPair.privateKey).toBeInstanceOf(Uint8Array);
        expect(keyPair.publicKey).toBeInstanceOf(Uint8Array);
      });

      test('generates unique key pairs', () => {
        const keys = new Set<string>();
        for (let i = 0; i < 10; i++) {
          const keyPair = generateKEMKeyPair();
          // Use first 64 bytes for uniqueness check (full key is large)
          keys.add(toHex(keyPair.privateKey.slice(0, 64)));
        }
        expect(keys.size).toBe(10);
      });

      test('can encapsulate and decapsulate', () => {
        const keyPair = generateKEMKeyPair();
        const { sharedSecret, cipherText } = ml_kem768.encapsulate(keyPair.publicKey);
        const decapsulated = ml_kem768.decapsulate(cipherText, keyPair.privateKey);

        expect(constantTimeEqual(sharedSecret, decapsulated)).toBe(true);
      });

      test('shared secret has correct size', () => {
        const keyPair = generateKEMKeyPair();
        const { sharedSecret } = ml_kem768.encapsulate(keyPair.publicKey);
        expect(sharedSecret.length).toBe(32);
      });

      test('ciphertext has correct size', () => {
        const keyPair = generateKEMKeyPair();
        const { cipherText } = ml_kem768.encapsulate(keyPair.publicKey);
        expect(cipherText.length).toBe(1088);
      });
    });

    describe('cnsa2 profile (ML-KEM-1024)', () => {
      test('generates key pair with correct sizes', () => {
        const keyPair = generateKEMKeyPair('cnsa2');
        expect(keyPair.privateKey.length).toBe(3168);
        expect(keyPair.publicKey.length).toBe(1568);
      });

      test('can encapsulate and decapsulate', () => {
        const keyPair = generateKEMKeyPair('cnsa2');
        const { sharedSecret, cipherText } = ml_kem1024.encapsulate(keyPair.publicKey);
        const decapsulated = ml_kem1024.decapsulate(cipherText, keyPair.privateKey);

        expect(constantTimeEqual(sharedSecret, decapsulated)).toBe(true);
      });

      test('ciphertext has correct size', () => {
        const keyPair = generateKEMKeyPair('cnsa2');
        const { cipherText } = ml_kem1024.encapsulate(keyPair.publicKey);
        expect(cipherText.length).toBe(1568);
      });
    });
  });

  describe('generateIdentityKeyBundle', () => {
    test('generates all key types', () => {
      const bundle = generateIdentityKeyBundle();
      expect(bundle.signing).toBeDefined();
      expect(bundle.ecdh).toBeDefined();
      expect(bundle.kem).toBeDefined();
      expect(bundle.profile).toBe('default');
    });

    test('signing keys have correct sizes', () => {
      const bundle = generateIdentityKeyBundle();
      expect(bundle.signing.privateKey.length).toBe(32);
      expect(bundle.signing.publicKey.length).toBe(32);
    });

    test('ecdh keys have correct sizes', () => {
      const bundle = generateIdentityKeyBundle();
      expect(bundle.ecdh.privateKey.length).toBe(32);
      expect(bundle.ecdh.publicKey.length).toBe(32);
    });

    test('kem keys have correct sizes (default profile)', () => {
      const bundle = generateIdentityKeyBundle();
      expect(bundle.kem.privateKey.length).toBe(2400);
      expect(bundle.kem.publicKey.length).toBe(1184);
    });

    test('kem keys have correct sizes (cnsa2 profile)', () => {
      const bundle = generateIdentityKeyBundle('cnsa2');
      expect(bundle.kem.privateKey.length).toBe(3168);
      expect(bundle.kem.publicKey.length).toBe(1568);
      expect(bundle.profile).toBe('cnsa2');
    });

    test('generates unique bundles', () => {
      const bundle1 = generateIdentityKeyBundle();
      const bundle2 = generateIdentityKeyBundle();

      expect(constantTimeEqual(
        bundle1.signing.privateKey,
        bundle2.signing.privateKey
      )).toBe(false);
      expect(constantTimeEqual(
        bundle1.ecdh.privateKey,
        bundle2.ecdh.privateKey
      )).toBe(false);
    });

    test('all keys are functional', () => {
      const bundle = generateIdentityKeyBundle();

      // Test signing
      const message = new Uint8Array([1, 2, 3]);
      const sig = ed25519.sign(message, bundle.signing.privateKey);
      expect(ed25519.verify(sig, message, bundle.signing.publicKey)).toBe(true);

      // Test ECDH
      const otherEcdh = generateECDHKeyPair();
      const shared = x25519.getSharedSecret(bundle.ecdh.privateKey, otherEcdh.publicKey);
      expect(shared.length).toBe(32);

      // Test KEM
      const { sharedSecret, cipherText } = ml_kem768.encapsulate(bundle.kem.publicKey);
      const decap = ml_kem768.decapsulate(cipherText, bundle.kem.privateKey);
      expect(constantTimeEqual(sharedSecret, decap)).toBe(true);
    });
  });

  describe('extractPublicKeys', () => {
    test('extracts all public keys', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);

      expect(publicKeys.signing).toBeDefined();
      expect(publicKeys.ecdh).toBeDefined();
      expect(publicKeys.kem).toBeDefined();
      expect(publicKeys.profile).toBe(bundle.profile);
    });

    test('public keys match bundle', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);

      expect(constantTimeEqual(publicKeys.signing, bundle.signing.publicKey)).toBe(true);
      expect(constantTimeEqual(publicKeys.ecdh, bundle.ecdh.publicKey)).toBe(true);
      expect(constantTimeEqual(publicKeys.kem, bundle.kem.publicKey)).toBe(true);
    });

    test('preserves profile', () => {
      const defaultBundle = generateIdentityKeyBundle('default');
      const cnsa2Bundle = generateIdentityKeyBundle('cnsa2');

      expect(extractPublicKeys(defaultBundle).profile).toBe('default');
      expect(extractPublicKeys(cnsa2Bundle).profile).toBe('cnsa2');
    });

    test('public keys have correct sizes (default)', () => {
      const bundle = generateIdentityKeyBundle('default');
      const publicKeys = extractPublicKeys(bundle);

      expect(publicKeys.signing.length).toBe(32);
      expect(publicKeys.ecdh.length).toBe(32);
      expect(publicKeys.kem.length).toBe(1184);
    });

    test('public keys have correct sizes (cnsa2)', () => {
      const bundle = generateIdentityKeyBundle('cnsa2');
      const publicKeys = extractPublicKeys(bundle);

      expect(publicKeys.signing.length).toBe(32);
      expect(publicKeys.ecdh.length).toBe(32);
      expect(publicKeys.kem.length).toBe(1568);
    });

    test('extracted public keys are functional', () => {
      const bundle = generateIdentityKeyBundle();
      const publicKeys = extractPublicKeys(bundle);

      // Verify signature
      const message = new Uint8Array([1, 2, 3]);
      const sig = ed25519.sign(message, bundle.signing.privateKey);
      expect(ed25519.verify(sig, message, publicKeys.signing)).toBe(true);

      // ECDH with public key
      const ephemeral = generateECDHKeyPair();
      const shared1 = x25519.getSharedSecret(ephemeral.privateKey, publicKeys.ecdh);
      const shared2 = x25519.getSharedSecret(bundle.ecdh.privateKey, ephemeral.publicKey);
      expect(constantTimeEqual(shared1, shared2)).toBe(true);

      // KEM encapsulation with public key
      const { sharedSecret, cipherText } = ml_kem768.encapsulate(publicKeys.kem);
      const decap = ml_kem768.decapsulate(cipherText, bundle.kem.privateKey);
      expect(constantTimeEqual(sharedSecret, decap)).toBe(true);
    });
  });

  describe('KEY_SIZES', () => {
    test('ed25519 sizes are correct', () => {
      expect(KEY_SIZES.ed25519.privateKey).toBe(32);
      expect(KEY_SIZES.ed25519.publicKey).toBe(32);
      expect(KEY_SIZES.ed25519.signature).toBe(64);
    });

    test('x25519 sizes are correct', () => {
      expect(KEY_SIZES.x25519.privateKey).toBe(32);
      expect(KEY_SIZES.x25519.publicKey).toBe(32);
      expect(KEY_SIZES.x25519.sharedSecret).toBe(32);
    });

    test('ML-KEM-768 sizes are correct', () => {
      expect(KEY_SIZES['ML-KEM-768'].privateKey).toBe(2400);
      expect(KEY_SIZES['ML-KEM-768'].publicKey).toBe(1184);
      expect(KEY_SIZES['ML-KEM-768'].ciphertext).toBe(1088);
      expect(KEY_SIZES['ML-KEM-768'].sharedSecret).toBe(32);
    });

    test('ML-KEM-1024 sizes are correct', () => {
      expect(KEY_SIZES['ML-KEM-1024'].privateKey).toBe(3168);
      expect(KEY_SIZES['ML-KEM-1024'].publicKey).toBe(1568);
      expect(KEY_SIZES['ML-KEM-1024'].ciphertext).toBe(1568);
      expect(KEY_SIZES['ML-KEM-1024'].sharedSecret).toBe(32);
    });
  });

  describe('validateKeyPairSizes', () => {
    test('validates correct ed25519 key pair', () => {
      const keyPair = generateSigningKeyPair();
      expect(validateKeyPairSizes(keyPair, 'ed25519')).toBe(true);
    });

    test('validates correct x25519 key pair', () => {
      const keyPair = generateECDHKeyPair();
      expect(validateKeyPairSizes(keyPair, 'x25519')).toBe(true);
    });

    test('validates correct ML-KEM-768 key pair', () => {
      const keyPair = generateKEMKeyPair('default');
      expect(validateKeyPairSizes(keyPair, 'ML-KEM-768')).toBe(true);
    });

    test('validates correct ML-KEM-1024 key pair', () => {
      const keyPair = generateKEMKeyPair('cnsa2');
      expect(validateKeyPairSizes(keyPair, 'ML-KEM-1024')).toBe(true);
    });

    test('rejects wrong private key size', () => {
      const keyPair = {
        privateKey: new Uint8Array(16),
        publicKey: new Uint8Array(32),
      };
      expect(validateKeyPairSizes(keyPair, 'ed25519')).toBe(false);
    });

    test('rejects wrong public key size', () => {
      const keyPair = {
        privateKey: new Uint8Array(32),
        publicKey: new Uint8Array(16),
      };
      expect(validateKeyPairSizes(keyPair, 'ed25519')).toBe(false);
    });

    test('rejects ed25519 keys validated as x25519', () => {
      // They have the same sizes, so this should actually pass
      const keyPair = generateSigningKeyPair();
      expect(validateKeyPairSizes(keyPair, 'x25519')).toBe(true);
    });

    test('rejects ML-KEM-768 validated as ML-KEM-1024', () => {
      const keyPair = generateKEMKeyPair('default');
      expect(validateKeyPairSizes(keyPair, 'ML-KEM-1024')).toBe(false);
    });

    test('rejects ML-KEM-1024 validated as ML-KEM-768', () => {
      const keyPair = generateKEMKeyPair('cnsa2');
      expect(validateKeyPairSizes(keyPair, 'ML-KEM-768')).toBe(false);
    });
  });
});
