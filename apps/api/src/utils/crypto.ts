/**
 * Cryptographic Utilities Module
 * 
 * Provides secure random generation, hashing, and constant-time comparison
 * functions for authentication and security-critical operations.
 * 
 * All functions use cryptographically secure random number generation
 * and industry-standard hashing algorithms (SHA-256).
 * 
 * @module utils/crypto
 * 
 * @example
 * ```typescript
 * import { generateOtp, hashOtp, verifyOtp } from './crypto';
 * 
 * // Generate and hash an OTP
 * const otp = generateOtp(); // "123456"
 * const hash = hashOtp(otp, 'user@example.com');
 * 
 * // Later, verify the OTP
 * const isValid = constantTimeCompare(hashOtp(userInput, email), storedHash);
 * ```
 */

import { createHash, createHmac, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';
import { verify as ed25519Verify, fromBase64, toBytes, concatBytes } from '@adieuu/crypto';
import {
  MESSAGE_SIGN_DOMAIN_V1,
  buildMessageSignaturePreimageV2,
  buildReactionSignaturePreimageV2,
  type MessageSignatureContext,
  type ReactionSignatureContext,
  type SerializedWrappedKey,
} from '@adieuu/shared';
import { config } from '../config';

/**
 * Generates a cryptographically secure One-Time Password (OTP).
 * 
 * Uses `crypto.getRandomValues()` for secure random number generation.
 * The OTP is zero-padded to ensure consistent length.
 * 
 * @param length - Number of digits in the OTP (default: 6)
 * @returns A numeric string OTP of the specified length
 * 
 * @example
 * ```typescript
 * const otp = generateOtp();     // "847293" (6 digits)
 * const otp4 = generateOtp(4);   // "0847" (4 digits, zero-padded)
 * const otp8 = generateOtp(8);   // "84729341" (8 digits)
 * ```
 */
export function generateOtp(length = 6): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const max = Math.pow(10, length);
  const value = buffer[0] ?? 0;
  return (value % max).toString().padStart(length, '0');
}

/**
 * Generates a cryptographically secure session ID.
 * 
 * Creates a 256-bit (32-byte) random value encoded as a URL-safe
 * base64 string. Suitable for session tokens, CSRF tokens, etc.
 * 
 * @returns A base64url-encoded session ID (approximately 43 characters)
 * 
 * @example
 * ```typescript
 * const sessionId = generateSessionId();
 * // "kG7x_mN2pQ3rS4tU5vW6xY7zA8bC9dE0fG1hI2jK3lM"
 * ```
 */
export function generateSessionId(): string {
  const buffer = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(buffer);
  return bufferToBase64Url(buffer);
}

/**
 * Generates a cryptographically secure random token.
 * 
 * Creates a random value of the specified byte length, encoded as
 * a URL-safe base64 string. Useful for API keys, reset tokens, etc.
 * 
 * @param bytes - Number of random bytes to generate (default: 32 = 256 bits)
 * @returns A base64url-encoded token
 * 
 * @example
 * ```typescript
 * const token32 = generateSecureToken();     // 32 bytes = ~43 chars
 * const token16 = generateSecureToken(16);   // 16 bytes = ~22 chars
 * const token64 = generateSecureToken(64);   // 64 bytes = ~86 chars
 * ```
 */
export function generateSecureToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bufferToBase64Url(buffer);
}

/**
 * Hashes an OTP for secure storage.
 * 
 * Combines the OTP with the identifier and a server secret to create
 * a hash that:
 * - Prevents rainbow table attacks (secret adds entropy)
 * - Binds the OTP to a specific identifier (prevents replay)
 * - Uses SHA-256 for strong collision resistance
 * 
 * @param otp - The OTP to hash
 * @param identifier - The email or phone number (normalized)
 * @returns SHA-256 hash as a 64-character hex string
 * 
 * @example
 * ```typescript
 * const hash = hashOtp('123456', 'user@example.com');
 * // "a1b2c3d4..." (64 hex characters)
 * 
 * // Store the hash, not the OTP
 * await redis.set(`otp:${userId}`, hash);
 * ```
 */
export function hashOtp(otp: string, identifier: string): string {
  const data = `${otp}:${identifier}:${config.security.otpSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hashes an identifier for logging and rate limiting.
 * 
 * Creates a consistent hash of an email or phone number that can be
 * safely logged or used as a rate limit key without exposing PII.
 * 
 * @param identifier - Email or phone number to hash
 * @returns SHA-256 hash as a 64-character hex string
 * 
 * @example
 * ```typescript
 * const hash = hashIdentifier('user@example.com');
 * 
 * // Safe to log
 * logger.info('Login attempt', { identifierHash: hash });
 * 
 * // Use as rate limit key
 * await rateLimiter.check(`login:${hash}`);
 * ```
 */
export function hashIdentifier(identifier: string): string {
  const data = `${identifier}:${config.security.otpSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hashes an IP address for logging.
 * 
 * Creates a consistent hash of an IP address that can be safely
 * logged without exposing the raw IP (privacy consideration).
 * 
 * @param ip - IP address (IPv4 or IPv6)
 * @returns SHA-256 hash as a 64-character hex string
 * 
 * @example
 * ```typescript
 * const ipHash = hashIp('192.168.1.100');
 * 
 * // Safe to log and analyze
 * logger.info('Request from', { ipHash });
 * ```
 */
export function hashIp(ip: string): string {
  const data = `${ip}:${config.security.sessionSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Performs a constant-time string comparison.
 * 
 * Prevents timing attacks by ensuring the comparison takes the same
 * amount of time regardless of how many characters match. Essential
 * for comparing secrets, tokens, and hashes.
 * 
 * If strings have different lengths, a dummy comparison is performed
 * to maintain constant time, then false is returned.
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 * 
 * @example
 * ```typescript
 * // Secure hash comparison
 * const storedHash = await getStoredHash(userId);
 * const providedHash = hashOtp(userInput, email);
 * 
 * if (constantTimeCompare(providedHash, storedHash)) {
 *   // OTP is valid
 * }
 * ```
 */
export function constantTimeCompare(a: string, b: string): boolean {
  // Ensure both strings are the same length to prevent length-based timing attacks
  if (a.length !== b.length) {
    // Still perform comparison to maintain constant time
    const dummy = Buffer.from(a);
    timingSafeEqual(dummy, dummy);
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Converts a Uint8Array to a URL-safe base64 string.
 * 
 * Replaces standard base64 characters with URL-safe alternatives:
 * - '+' becomes '-'
 * - '/' becomes '_'
 * - '=' padding is removed
 * 
 * @param buffer - The byte array to encode
 * @returns URL-safe base64 encoded string
 * 
 * @internal
 */
function bufferToBase64Url(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Converts a URL-safe base64 string to a Uint8Array.
 * 
 * Reverses the base64url encoding by:
 * - Replacing '-' with '+'
 * - Replacing '_' with '/'
 * - Restoring '=' padding as needed
 * 
 * @param base64Url - URL-safe base64 encoded string
 * @returns Decoded byte array
 * 
 * @example
 * ```typescript
 * const sessionId = generateSessionId();
 * const bytes = base64UrlToBuffer(sessionId);
 * console.log(bytes.length); // 32
 * ```
 */
export function base64UrlToBuffer(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

/**
 * Creates an HMAC-SHA256 signature for data integrity verification.
 *
 * Uses the configured session secret as the HMAC key to create a
 * cryptographically secure signature that can verify data has not
 * been tampered with.
 *
 * @param data - The data to sign
 * @returns Base64url-encoded HMAC-SHA256 signature
 *
 * @example
 * ```typescript
 * // Sign a magic link token
 * const token = Buffer.from('user@example.com:123456').toString('base64url');
 * const signature = hmacSign(token);
 *
 * // Build the URL
 * const url = `https://app.example.com/auth/verify?t=${token}&s=${signature}`;
 * ```
 */
export function hmacSign(data: string): string {
  return createHmac('sha256', config.security.sessionSecret)
    .update(data)
    .digest('base64url');
}

/**
 * Verifies an HMAC-SHA256 signature using constant-time comparison.
 *
 * Prevents timing attacks by using `constantTimeCompare` internally.
 *
 * @param data - The original data that was signed
 * @param signature - The signature to verify
 * @returns true if the signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * // Verify a magic link
 * const token = url.searchParams.get('t');
 * const signature = url.searchParams.get('s');
 *
 * if (!hmacVerify(token, signature)) {
 *   return errors.badRequest('Invalid or tampered link');
 * }
 * ```
 */
export function hmacVerify(data: string, signature: string): boolean {
  const expected = hmacSign(data);
  return constantTimeCompare(expected, signature);
}

/**
 * Derives a 256-bit encryption key from the session secret.
 *
 * Uses SHA-256 to derive a consistent key from the secret.
 * This ensures the key is always the correct length for AES-256.
 *
 * @returns 32-byte key buffer
 * @internal
 */
function deriveEncryptionKey(): Buffer {
  return createHash('sha256')
    .update(config.security.sessionSecret)
    .digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 *
 * Uses authenticated encryption to provide both confidentiality and
 * integrity. The IV is randomly generated and prepended to the output.
 *
 * Output format: base64url(IV || ciphertext || authTag)
 * - IV: 12 bytes (96 bits, standard for GCM)
 * - authTag: 16 bytes (128 bits)
 *
 * @param plaintext - The string to encrypt
 * @returns Base64url-encoded encrypted data (IV + ciphertext + authTag)
 *
 * @example
 * ```typescript
 * const encrypted = encrypt('user@example.com:123456');
 * // "X8kL9mN2o3p4Q5r6S7t8U9v0W1x2Y3z4..."
 *
 * const decrypted = decrypt(encrypted);
 * // "user@example.com:123456"
 * ```
 */
export function encrypt(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = new Uint8Array(12); // 96-bit IV for GCM
  crypto.getRandomValues(iv);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Combine: IV || ciphertext || authTag
  const combined = Buffer.concat([Buffer.from(iv), encrypted, authTag]);
  return combined.toString('base64url');
}

/**
 * Decrypts a string that was encrypted with `encrypt()`.
 *
 * Verifies the authentication tag to ensure the data hasn't been
 * tampered with. Returns null if decryption fails (invalid data,
 * wrong key, or tampered ciphertext).
 *
 * @param encrypted - Base64url-encoded encrypted data from `encrypt()`
 * @returns The decrypted plaintext, or null if decryption fails
 *
 * @example
 * ```typescript
 * const decrypted = decrypt(encryptedToken);
 * if (decrypted === null) {
 *   return errors.badRequest('Invalid or tampered token');
 * }
 * const [identifier, otp] = decrypted.split(':');
 * ```
 */
export function decrypt(encrypted: string): string | null {
  try {
    const key = deriveEncryptionKey();
    const combined = Buffer.from(encrypted, 'base64url');

    // Extract: IV (12 bytes) || ciphertext || authTag (16 bytes)
    if (combined.length < 12 + 16) {
      return null; // Too short to be valid
    }

    const iv = combined.subarray(0, 12);
    const authTag = combined.subarray(combined.length - 16);
    const ciphertext = combined.subarray(12, combined.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  } catch {
    // Decryption failed (invalid data, wrong key, tampered, etc.)
    return null;
  }
}

/**
 * Domain separator for key bundle ID derivation.
 * Ensures bundle IDs are cryptographically distinct from other hash uses.
 */
const KEY_BUNDLE_DOMAIN = 'adieuu-key-bundle-v1';

/**
 * Domain separator for conversation media scan hash derivation.
 * Links scan copies to E2E media without revealing the uploader's identity.
 */
const CONV_SCAN_DOMAIN = 'adieuu-conv-scan-v1';

/**
 * Derives a bundle ID from an identity's ident hash.
 * 
 * The bundle ID is computed as: SHA3-256(ident || KEY_BUNDLE_DOMAIN)
 * This obfuscates the relationship between bundles and identities,
 * preventing correlation attacks on the key_bundles collection.
 * 
 * @param ident - The identity's ident hash (hex string)
 * @returns The derived bundle ID as a hex string
 * 
 * @example
 * ```typescript
 * const bundleId = deriveBundleId(identity.ident);
 * const bundle = await keyBundleRepo.findByBundleId(bundleId);
 * ```
 */
export function deriveBundleId(ident: string): string {
  const data = `${ident}${KEY_BUNDLE_DOMAIN}`;
  return createHash('sha3-256').update(data).digest('hex');
}

/**
 * Derives a scan hash for linking a conversation scan copy to its E2E media
 * upload without revealing the uploader's identity.
 *
 * The scan hash is computed as: SHA3-256(identityId || e2eMediaId || "adieuu-conv-scan-v1")
 *
 * Properties:
 * - **Deterministic**: Same identity + media always produces same hash
 * - **One-way**: Cannot reverse to get identity ID from the hash
 * - **Unique per upload**: Same identity has different hashes for different uploads
 * - **Verifiable**: Client can compute hash from its own identity + the e2eMediaId
 *
 * @param identityId - The uploader's identity ID (hex string, 24 chars)
 * @param e2eMediaId - The E2E media upload identifier
 * @returns The scan hash as a hex string (64 chars)
 */
export function deriveScanHash(identityId: string, e2eMediaId: string): string {
  const data = `${identityId}${e2eMediaId}${CONV_SCAN_DOMAIN}`;
  return createHash('sha3-256').update(data).digest('hex');
}

/**
 * Verifies a legacy (v1) Ed25519 signature for a DM message.
 *
 * The v1 signature is over: domain || ciphertext || nonce || wrappedKeysJson
 * where domain is `adieuu-msg-v1`. This matches the pre-context-binding
 * client-side signing format in conversationCryptoService.ts. New messages
 * are signed with the v2 preimage; use {@link verifyMessageSignatureV2}.
 *
 * @param signingPublicKey - Base64-encoded Ed25519 public key
 * @param ciphertext - Base64-encoded ciphertext
 * @param nonce - Base64-encoded nonce
 * @param wrappedKeys - Array of wrapped keys (will be JSON-stringified)
 * @param signature - Base64-encoded Ed25519 signature
 * @returns true if signature is valid, false otherwise
 */
export function verifyDmMessageSignature(
  signingPublicKey: string,
  ciphertext: string,
  nonce: string,
  wrappedKeys: unknown[],
  signature: string
): boolean {
  try {
    const publicKeyBytes = fromBase64(signingPublicKey);
    const ciphertextBytes = fromBase64(ciphertext);
    const nonceBytes = fromBase64(nonce);
    const wrappedKeysJson = JSON.stringify(wrappedKeys);
    const wrappedKeysBytes = toBytes(wrappedKeysJson);
    const signatureBytes = fromBase64(signature);

    const signatureData = concatBytes(
      toBytes(MESSAGE_SIGN_DOMAIN_V1),
      ciphertextBytes,
      nonceBytes,
      wrappedKeysBytes
    );

    return ed25519Verify(publicKeyBytes, signatureData, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * Verifies a v2 (context-bound) Ed25519 message signature.
 *
 * The v2 preimage binds conversationId, fromIdentityId, and clientMessageId
 * so a validly signed message cannot be replayed by the server into a
 * different conversation or attributed to a different sender. The preimage
 * is built via the shared helper so client signing and server verification
 * stay byte-identical (canonical wrapped-key serialization is used to guard
 * against key re-ordering by request parsing).
 *
 * @param signingPublicKey - Base64-encoded Ed25519 public key of the sender
 * @param context - Conversation/sender/clientMessageId bound at signing time
 * @param ciphertext - Base64-encoded ciphertext (as sent on the wire)
 * @param nonce - Base64-encoded nonce (as sent on the wire)
 * @param wrappedKeys - Wrapped session keys from the request body
 * @param signature - Base64-encoded Ed25519 signature
 * @returns true if the signature is valid, false otherwise
 */
export function verifyMessageSignatureV2(
  signingPublicKey: string,
  context: MessageSignatureContext,
  ciphertext: string,
  nonce: string,
  wrappedKeys: readonly SerializedWrappedKey[],
  signature: string
): boolean {
  try {
    const preimage = buildMessageSignaturePreimageV2(context, ciphertext, nonce, wrappedKeys);
    return ed25519Verify(
      fromBase64(signingPublicKey),
      toBytes(preimage),
      fromBase64(signature)
    );
  } catch {
    return false;
  }
}

/**
 * Verifies a v2 (context-bound) Ed25519 reaction signature.
 *
 * Binds conversationId, messageId, fromIdentityId, and clientReactionId.
 *
 * @returns true if the signature is valid, false otherwise
 */
export function verifyReactionSignatureV2(
  signingPublicKey: string,
  context: ReactionSignatureContext,
  ciphertext: string,
  nonce: string,
  wrappedKeys: readonly SerializedWrappedKey[],
  signature: string
): boolean {
  try {
    const preimage = buildReactionSignaturePreimageV2(context, ciphertext, nonce, wrappedKeys);
    return ed25519Verify(
      fromBase64(signingPublicKey),
      toBytes(preimage),
      fromBase64(signature)
    );
  } catch {
    return false;
  }
}
