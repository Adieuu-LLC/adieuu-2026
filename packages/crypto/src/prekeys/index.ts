/**
 * Pre-Key Module
 *
 * Provides generation, signing/verification, and hybrid key exchange
 * for signed pre-keys and one-time pre-keys.
 *
 * Pre-keys enable recipient-side forward secrecy:
 * - Signed pre-keys (SPK): Medium-term keys, rotated periodically, signed by identity key
 * - One-time pre-keys (OTPK): Consumed once per message, deleted after decryption
 *
 * Key exchange modes:
 * - SPK + OTPK: DH1(ephemeral, SPK.ecdh) + KEM1(SPK.kem) + DH2(ephemeral, OTPK.ecdh) + KEM2(OTPK.kem)
 * - SPK only:   DH1(ephemeral, SPK.ecdh) + KEM1(SPK.kem)
 *
 * Designed as a hybrid X3DH-equivalent, so adding a Double Ratchet later
 * is a clean additive step (the shared secret would seed the ratchet).
 *
 * @module crypto/prekeys
 */

import { x25519 } from '@noble/curves/ed25519';
import { ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem';
import { generateECDHKeyPair, generateKEMKeyPair } from '../keys/generate';
import { sign, verify } from '../sign/ed25519';
import { encrypt as symmetricEncrypt, decrypt as symmetricDecrypt } from '../encrypt/symmetric';
import { deriveKey, KDF_INFO } from '../kdf/hkdf';
import { randomBytes, concatBytes, toBytes } from '../utils';
import type {
  CryptoProfile,
  ECDHKeyPair,
  KEMKeyPair,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/** HKDF info string for pre-key exchange key derivation */
export const PREKEY_KDF_INFO = 'adieuu-prekey-v1';

/** Domain separator for signed pre-key signatures */
export const SPK_SIGNATURE_DOMAIN = 'adieuu-spk-v1';

// ============================================================================
// Types
// ============================================================================

/** A generated signed pre-key with both public and private components. */
export interface GeneratedSignedPreKey {
  keyId: string;
  ecdh: ECDHKeyPair;
  kem: KEMKeyPair;
  signature: Uint8Array;
}

/** A generated one-time pre-key with both public and private components. */
export interface GeneratedOneTimePreKey {
  keyId: string;
  ecdh: ECDHKeyPair;
  kem: KEMKeyPair;
}

/** Public components of a signed pre-key (for the sender). */
export interface SignedPreKeyPublic {
  keyId: string;
  ecdhPublicKey: Uint8Array;
  kemPublicKey: Uint8Array;
  signature: Uint8Array;
}

/** Public components of a one-time pre-key (for the sender). */
export interface OneTimePreKeyPublic {
  keyId: string;
  ecdhPublicKey: Uint8Array;
  kemPublicKey: Uint8Array;
}

/** Result of a pre-key exchange (sender side). */
export interface PreKeyExchangeResult {
  /** Derived shared secret for wrapping the session key */
  sharedSecret: Uint8Array;
  /** Ephemeral X25519 public key (sent to recipient) */
  ephemeralPublicKey: Uint8Array;
  /** ML-KEM ciphertext for the signed pre-key */
  spkKemCiphertext: Uint8Array;
  /** ML-KEM ciphertext for the one-time pre-key (if used) */
  otpkKemCiphertext?: Uint8Array;
}

/** Result of wrapping a session key with pre-key exchange. */
export interface PreKeyWrappedKey {
  ephemeralPublicKey: Uint8Array;
  spkKemCiphertext: Uint8Array;
  otpkKemCiphertext?: Uint8Array;
  wrappedSessionKey: Uint8Array;
  wrappingNonce: Uint8Array;
}

// ============================================================================
// Pre-Key Generation
// ============================================================================

/**
 * Generates a signed pre-key.
 *
 * Creates an X25519 + ML-KEM key pair and signs the public keys
 * with the identity's Ed25519 signing key. The signature proves
 * authenticity -- a compromised server cannot substitute its own SPK.
 *
 * @param signingPrivateKey - Identity's Ed25519 private key (32 bytes)
 * @param profile - Crypto profile ('default' or 'cnsa2')
 * @returns Generated signed pre-key with all components
 */
export function generateSignedPreKey(
  signingPrivateKey: Uint8Array,
  profile: CryptoProfile = 'default'
): GeneratedSignedPreKey {
  const keyId = crypto.randomUUID();
  const ecdh = generateECDHKeyPair();
  const kem = generateKEMKeyPair(profile);

  const dataToSign = concatBytes(
    toBytes(SPK_SIGNATURE_DOMAIN),
    toBytes(keyId),
    ecdh.publicKey,
    kem.publicKey
  );
  const signature = sign(signingPrivateKey, dataToSign);

  return { keyId, ecdh, kem, signature };
}

/**
 * Verifies a signed pre-key's signature.
 *
 * Senders MUST call this before using a signed pre-key to prevent
 * a compromised server from substituting a malicious key.
 *
 * @param spk - Signed pre-key public components
 * @param signingPublicKey - Identity's Ed25519 public key (32 bytes)
 * @returns true if signature is valid
 */
export function verifySignedPreKey(
  spk: SignedPreKeyPublic,
  signingPublicKey: Uint8Array
): boolean {
  const dataToVerify = concatBytes(
    toBytes(SPK_SIGNATURE_DOMAIN),
    toBytes(spk.keyId),
    spk.ecdhPublicKey,
    spk.kemPublicKey
  );
  return verify(signingPublicKey, dataToVerify, spk.signature);
}

/**
 * Generates a batch of one-time pre-keys.
 *
 * Each OTPK is consumed exactly once by a sender. After the recipient
 * decrypts the message, the OTPK private key should be deleted to
 * achieve forward secrecy.
 *
 * @param count - Number of OTPKs to generate
 * @param profile - Crypto profile
 * @returns Array of generated one-time pre-keys
 */
export function generateOneTimePreKeys(
  count: number,
  profile: CryptoProfile = 'default'
): GeneratedOneTimePreKey[] {
  const keys: GeneratedOneTimePreKey[] = [];
  for (let i = 0; i < count; i++) {
    keys.push({
      keyId: crypto.randomUUID(),
      ecdh: generateECDHKeyPair(),
      kem: generateKEMKeyPair(profile),
    });
  }
  return keys;
}

// ============================================================================
// Pre-Key Exchange (Sender Side)
// ============================================================================

/**
 * Performs a hybrid pre-key exchange (sender side).
 *
 * Combines X25519 ECDH and ML-KEM with the recipient's pre-keys
 * to derive a shared secret. When both SPK and OTPK are available:
 *
 *   DH1 = X25519(ephemeral, SPK.ecdh)
 *   KEM1 = ML-KEM.Encapsulate(SPK.kem)
 *   DH2 = X25519(ephemeral, OTPK.ecdh)
 *   KEM2 = ML-KEM.Encapsulate(OTPK.kem)
 *   sharedSecret = HKDF(DH1 || KEM1 || DH2 || KEM2, info="adieuu-prekey-v1")
 *
 * When only SPK is available:
 *   sharedSecret = HKDF(DH1 || KEM1, info="adieuu-prekey-v1")
 *
 * @param signedPreKey - Recipient's signed pre-key public components
 * @param oneTimePreKey - Recipient's one-time pre-key (optional)
 * @param profile - Crypto profile
 * @returns Exchange result with shared secret and ciphertexts
 */
export function preKeyExchange(
  signedPreKey: SignedPreKeyPublic,
  oneTimePreKey?: OneTimePreKeyPublic,
  profile: CryptoProfile = 'default'
): PreKeyExchangeResult {
  const kem = profile === 'cnsa2' ? ml_kem1024 : ml_kem768;

  const ephemeralPrivate = randomBytes(32);
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivate);

  // DH1: ephemeral <-> SPK ECDH
  const dh1 = x25519.getSharedSecret(ephemeralPrivate, signedPreKey.ecdhPublicKey);

  // KEM1: encapsulate with SPK KEM
  const kem1Result = kem.encapsulate(signedPreKey.kemPublicKey);
  const spkKemCiphertext = kem1Result.cipherText;
  const kem1Shared = kem1Result.sharedSecret;

  let ikm: Uint8Array;
  let otpkKemCiphertext: Uint8Array | undefined;

  if (oneTimePreKey) {
    // DH2: ephemeral <-> OTPK ECDH
    const dh2 = x25519.getSharedSecret(ephemeralPrivate, oneTimePreKey.ecdhPublicKey);

    // KEM2: encapsulate with OTPK KEM
    const kem2Result = kem.encapsulate(oneTimePreKey.kemPublicKey);
    otpkKemCiphertext = kem2Result.cipherText;
    const kem2Shared = kem2Result.sharedSecret;

    ikm = concatBytes(dh1, kem1Shared, dh2, kem2Shared);
  } else {
    ikm = concatBytes(dh1, kem1Shared);
  }

  const sharedSecret = deriveKey(
    { ikm, info: PREKEY_KDF_INFO, length: 32 },
    profile
  );

  return {
    sharedSecret,
    ephemeralPublicKey,
    spkKemCiphertext,
    otpkKemCiphertext,
  };
}

/**
 * Wraps a session key using pre-key exchange.
 *
 * This is the pre-key-aware replacement for `wrapSessionKey()` in the
 * hybrid encryption module.
 *
 * @param sessionKey - Random session key to wrap (32 bytes)
 * @param signedPreKey - Recipient's signed pre-key
 * @param oneTimePreKey - Recipient's one-time pre-key (optional)
 * @param profile - Crypto profile
 * @returns Wrapped key with all ciphertexts needed for decapsulation
 */
export function wrapSessionKeyWithPreKeys(
  sessionKey: Uint8Array,
  signedPreKey: SignedPreKeyPublic,
  oneTimePreKey?: OneTimePreKeyPublic,
  profile: CryptoProfile = 'default'
): PreKeyWrappedKey {
  if (sessionKey.length !== 32) {
    throw new Error('Session key must be 32 bytes');
  }

  const exchange = preKeyExchange(signedPreKey, oneTimePreKey, profile);

  const { ciphertext: wrappedSessionKey, nonce: wrappingNonce } = symmetricEncrypt(
    exchange.sharedSecret,
    sessionKey,
    profile
  );

  return {
    ephemeralPublicKey: exchange.ephemeralPublicKey,
    spkKemCiphertext: exchange.spkKemCiphertext,
    otpkKemCiphertext: exchange.otpkKemCiphertext,
    wrappedSessionKey,
    wrappingNonce,
  };
}

// ============================================================================
// Pre-Key Decapsulation (Recipient Side)
// ============================================================================

/**
 * Decapsulates a pre-key exchange (recipient side).
 *
 * Reverses the sender's pre-key exchange to derive the same shared secret.
 *
 * @param senderEphemeralPublic - Sender's ephemeral X25519 public key
 * @param spkEcdhPrivate - Recipient's SPK X25519 private key
 * @param spkKemPrivate - Recipient's SPK ML-KEM private key
 * @param spkKemCiphertext - KEM ciphertext for SPK
 * @param otpkEcdhPrivate - Recipient's OTPK X25519 private key (optional)
 * @param otpkKemPrivate - Recipient's OTPK ML-KEM private key (optional)
 * @param otpkKemCiphertext - KEM ciphertext for OTPK (optional)
 * @param profile - Crypto profile
 * @returns Derived shared secret (same as sender computed)
 */
export function preKeyDecapsulate(
  senderEphemeralPublic: Uint8Array,
  spkEcdhPrivate: Uint8Array,
  spkKemPrivate: Uint8Array,
  spkKemCiphertext: Uint8Array,
  otpkEcdhPrivate?: Uint8Array,
  otpkKemPrivate?: Uint8Array,
  otpkKemCiphertext?: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const kemAlgo = profile === 'cnsa2' ? ml_kem1024 : ml_kem768;

  // DH1: SPK ECDH
  const dh1 = x25519.getSharedSecret(spkEcdhPrivate, senderEphemeralPublic);

  // KEM1: decapsulate SPK KEM
  const kem1Shared = kemAlgo.decapsulate(spkKemCiphertext, spkKemPrivate);

  let ikm: Uint8Array;

  if (otpkEcdhPrivate && otpkKemPrivate && otpkKemCiphertext) {
    // DH2: OTPK ECDH
    const dh2 = x25519.getSharedSecret(otpkEcdhPrivate, senderEphemeralPublic);

    // KEM2: decapsulate OTPK KEM
    const kem2Shared = kemAlgo.decapsulate(otpkKemCiphertext, otpkKemPrivate);

    ikm = concatBytes(dh1, kem1Shared, dh2, kem2Shared);
  } else {
    ikm = concatBytes(dh1, kem1Shared);
  }

  return deriveKey(
    { ikm, info: PREKEY_KDF_INFO, length: 32 },
    profile
  );
}

/**
 * Unwraps a session key using pre-key decapsulation.
 *
 * This is the pre-key-aware replacement for `unwrapSessionKey()`.
 *
 * @param wrapped - Wrapped key from sender
 * @param spkEcdhPrivate - Recipient's SPK X25519 private key
 * @param spkKemPrivate - Recipient's SPK ML-KEM private key
 * @param otpkEcdhPrivate - Recipient's OTPK X25519 private key (optional)
 * @param otpkKemPrivate - Recipient's OTPK ML-KEM private key (optional)
 * @param profile - Crypto profile
 * @returns Unwrapped session key (32 bytes)
 */
export function unwrapSessionKeyWithPreKeys(
  wrapped: PreKeyWrappedKey,
  spkEcdhPrivate: Uint8Array,
  spkKemPrivate: Uint8Array,
  otpkEcdhPrivate?: Uint8Array,
  otpkKemPrivate?: Uint8Array,
  profile: CryptoProfile = 'default'
): Uint8Array {
  const sharedSecret = preKeyDecapsulate(
    wrapped.ephemeralPublicKey,
    spkEcdhPrivate,
    spkKemPrivate,
    wrapped.spkKemCiphertext,
    otpkEcdhPrivate,
    otpkKemPrivate,
    wrapped.otpkKemCiphertext,
    profile
  );

  return symmetricDecrypt(
    sharedSecret,
    wrapped.wrappedSessionKey,
    wrapped.wrappingNonce,
    profile
  );
}
