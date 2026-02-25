/**
 * E2E Key Service
 *
 * Handles generation, encryption, and decryption of E2E encryption keys.
 * This service manages the identity signing key bundle and device key generation.
 *
 * SECURITY ARCHITECTURE:
 * - Signing key is encrypted with Argon2id(passphrase) and stored server-side
 * - Device keys (ECDH + KEM) are generated locally per-device
 * - Signing key is cached in memory only (never persisted locally)
 *
 * @module services/e2eKeyService
 */

import {
  generateSigningKeyPair,
  generateECDHKeyPair,
  generateKEMKeyPair,
  deriveKeyFromPassword,
  encryptChaCha20Poly1305,
  decryptChaCha20Poly1305,
  randomBytes,
  toBase64,
  fromBase64,
  clearBytes,
  ARGON2_DEFAULTS,
  type CryptoProfile,
} from '@adieuu/crypto';

/**
 * Input for E2E key initialization during identity creation.
 */
export interface E2EInitInput {
  /** Identity ID (hex string) */
  identityId: string;
  /** User's identity passphrase */
  passphrase: string;
  /** Human-readable device name */
  deviceName: string;
  /** Crypto profile to use (default: 'default') */
  cryptoProfile?: CryptoProfile;
  /** Whether to use a separate passphrase for the bundle */
  useSeparatePassphrase?: boolean;
  /** Separate bundle passphrase (required if useSeparatePassphrase is true) */
  bundlePassphrase?: string;
}

/**
 * Result of E2E key initialization.
 */
export interface E2EInitResult {
  /** Signing public key (base64) */
  signingPublicKey: string;
  /** Encrypted signing key bundle for server storage */
  encryptedBundle: {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    useSeparatePassphrase: boolean;
  };
  /** Device registration data */
  device: {
    deviceId: string;
    name: string;
    ecdhPublicKey: string;
    kemPublicKey: string;
  };
  /** Signing private key for memory cache (will be cleared after use) */
  signingPrivateKey: Uint8Array;
  /** Device private keys for IndexedDB storage */
  devicePrivateKeys: {
    ecdh: Uint8Array;
    kem: Uint8Array;
  };
}

/**
 * Result of device key generation for new device login.
 */
export interface DeviceKeysResult {
  /** Unique device identifier */
  deviceId: string;
  /** Human-readable device name */
  name: string;
  /** X25519 public key (base64) */
  ecdhPublicKey: string;
  /** ML-KEM public key (base64) */
  kemPublicKey: string;
  /** Private keys for local storage */
  privateKeys: {
    ecdh: Uint8Array;
    kem: Uint8Array;
  };
}

/**
 * Bundle decryption result.
 */
export interface DecryptedBundle {
  /** Signing private key */
  signingPrivateKey: Uint8Array;
}

/**
 * Custom error class for E2E key service errors.
 */
export class E2EKeyError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'E2EKeyError';
  }
}

/**
 * Generates all keys needed for E2E encryption initialization.
 *
 * This is called during identity creation to:
 * 1. Generate Ed25519 signing key pair (identity-level)
 * 2. Generate X25519 ECDH key pair (device-level)
 * 3. Generate ML-KEM key pair (device-level, post-quantum)
 * 4. Encrypt signing private key with Argon2id-derived key
 *
 * @param input - Initialization parameters
 * @returns Generated keys and encrypted bundle
 * @throws E2EKeyError if key generation or encryption fails
 */
export async function generateE2EKeys(input: E2EInitInput): Promise<E2EInitResult> {
  const profile = input.cryptoProfile ?? 'default';

  // Validate separate passphrase input
  if (input.useSeparatePassphrase && !input.bundlePassphrase) {
    throw new E2EKeyError(
      'Bundle passphrase required when using separate passphrase',
      'MISSING_BUNDLE_PASSPHRASE'
    );
  }

  // 1. Generate signing key pair (Ed25519)
  const signingKeyPair = generateSigningKeyPair();

  // 2. Generate device keys
  const ecdhKeyPair = generateECDHKeyPair();
  const kemKeyPair = generateKEMKeyPair(profile);

  // 3. Encrypt signing private key with Argon2id
  const bundlePassphrase = input.useSeparatePassphrase
    ? input.bundlePassphrase!
    : input.passphrase;

  const salt = randomBytes(16);
  let derivedKey: Uint8Array;

  try {
    derivedKey = await deriveKeyFromPassword({
      password: bundlePassphrase,
      salt,
      memoryCost: ARGON2_DEFAULTS.memoryCost,
      timeCost: ARGON2_DEFAULTS.timeCost,
      parallelism: ARGON2_DEFAULTS.parallelism,
      outputLength: 32,
    });
  } catch (err) {
    throw new E2EKeyError(
      'Failed to derive encryption key from passphrase',
      'KEY_DERIVATION_FAILED'
    );
  }

  // Encrypt the signing private key
  const { ciphertext, nonce } = encryptChaCha20Poly1305(
    derivedKey,
    signingKeyPair.privateKey
  );

  // Clear the derived key from memory
  clearBytes(derivedKey);

  // 4. Generate device ID
  const deviceId = crypto.randomUUID();

  return {
    signingPublicKey: toBase64(signingKeyPair.publicKey),
    encryptedBundle: {
      encryptedBundle: toBase64(ciphertext),
      salt: toBase64(salt),
      nonce: toBase64(nonce),
      useSeparatePassphrase: input.useSeparatePassphrase ?? false,
    },
    device: {
      deviceId,
      name: input.deviceName,
      ecdhPublicKey: toBase64(ecdhKeyPair.publicKey),
      kemPublicKey: toBase64(kemKeyPair.publicKey),
    },
    signingPrivateKey: signingKeyPair.privateKey,
    devicePrivateKeys: {
      ecdh: ecdhKeyPair.privateKey,
      kem: kemKeyPair.privateKey,
    },
  };
}

/**
 * Generates device keys for a new device login.
 *
 * Called when logging into an identity from a device that doesn't have
 * existing device keys in IndexedDB.
 *
 * @param deviceName - Human-readable device name
 * @param cryptoProfile - Crypto profile to use
 * @returns Generated device keys
 */
export function generateDeviceKeys(
  deviceName: string,
  cryptoProfile: CryptoProfile = 'default'
): DeviceKeysResult {
  const ecdhKeyPair = generateECDHKeyPair();
  const kemKeyPair = generateKEMKeyPair(cryptoProfile);
  const deviceId = crypto.randomUUID();

  return {
    deviceId,
    name: deviceName,
    ecdhPublicKey: toBase64(ecdhKeyPair.publicKey),
    kemPublicKey: toBase64(kemKeyPair.publicKey),
    privateKeys: {
      ecdh: ecdhKeyPair.privateKey,
      kem: kemKeyPair.privateKey,
    },
  };
}

/**
 * Decrypts a key bundle retrieved from the server.
 *
 * Uses Argon2id to derive the decryption key from the passphrase,
 * then decrypts the signing private key using ChaCha20-Poly1305.
 *
 * @param encryptedBundle - Encrypted bundle data from server
 * @param passphrase - Passphrase (identity or separate bundle passphrase)
 * @returns Decrypted signing private key
 * @throws E2EKeyError if decryption fails (wrong passphrase or corrupted data)
 */
export async function decryptKeyBundle(
  encryptedBundle: {
    encryptedBundle: string;
    salt: string;
    nonce: string;
  },
  passphrase: string
): Promise<DecryptedBundle> {
  // Decode bundle data
  let salt: Uint8Array;
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;

  try {
    salt = fromBase64(encryptedBundle.salt);
    nonce = fromBase64(encryptedBundle.nonce);
    ciphertext = fromBase64(encryptedBundle.encryptedBundle);
  } catch {
    throw new E2EKeyError('Invalid bundle data format', 'INVALID_BUNDLE_DATA');
  }

  // Validate sizes
  if (salt.length < 8) {
    throw new E2EKeyError('Invalid salt size', 'INVALID_SALT_SIZE');
  }
  if (nonce.length !== 12) {
    throw new E2EKeyError('Invalid nonce size', 'INVALID_NONCE_SIZE');
  }

  // Derive decryption key
  let derivedKey: Uint8Array;
  try {
    derivedKey = await deriveKeyFromPassword({
      password: passphrase,
      salt,
      memoryCost: ARGON2_DEFAULTS.memoryCost,
      timeCost: ARGON2_DEFAULTS.timeCost,
      parallelism: ARGON2_DEFAULTS.parallelism,
      outputLength: 32,
    });
  } catch {
    throw new E2EKeyError(
      'Failed to derive decryption key',
      'KEY_DERIVATION_FAILED'
    );
  }

  // Decrypt the signing private key
  let signingPrivateKey: Uint8Array;
  try {
    signingPrivateKey = decryptChaCha20Poly1305(derivedKey, ciphertext, nonce);
  } catch {
    throw new E2EKeyError(
      'Failed to decrypt bundle. Check your passphrase.',
      'DECRYPTION_FAILED'
    );
  } finally {
    // Clear derived key from memory
    clearBytes(derivedKey);
  }

  // Validate decrypted key size (Ed25519 private key is 32 bytes)
  if (signingPrivateKey.length !== 32) {
    clearBytes(signingPrivateKey);
    throw new E2EKeyError(
      'Decrypted key has invalid size',
      'INVALID_KEY_SIZE'
    );
  }

  return {
    signingPrivateKey,
  };
}

/**
 * Gets a default device name based on the platform.
 *
 * Attempts to detect the device type from the user agent.
 *
 * @returns Human-readable device name
 */
export function getDefaultDeviceName(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown Device';
  }

  const ua = navigator.userAgent.toLowerCase();

  // Check for mobile platforms
  if (/iphone|ipad|ipod/.test(ua)) {
    return /ipad/.test(ua) ? 'iPad' : 'iPhone';
  }
  if (/android/.test(ua)) {
    return /mobile/.test(ua) ? 'Android Phone' : 'Android Tablet';
  }

  // Check for desktop platforms
  if (/macintosh|mac os x/.test(ua)) {
    return 'Mac';
  }
  if (/windows/.test(ua)) {
    return 'Windows PC';
  }
  if (/linux/.test(ua)) {
    return 'Linux';
  }

  // Fallback based on context
  if (/electron/.test(ua)) {
    return 'Desktop App';
  }

  return 'Web Browser';
}
