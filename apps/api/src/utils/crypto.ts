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

import { createHash, createHmac, timingSafeEqual } from 'crypto';
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
