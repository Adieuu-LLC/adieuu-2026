/**
 * @fileoverview OTP (One-Time Password) Service
 *
 * Provides secure OTP generation, storage, and verification for authentication.
 * OTPs are stored in Redis with automatic expiration and attempt limiting.
 *
 * @module services/otp
 *
 * Security features:
 * - OTPs are hashed before storage (never stored in plaintext)
 * - Identifier is also hashed for privacy
 * - Constant-time comparison prevents timing attacks
 * - Maximum attempt limiting prevents brute force
 * - Automatic expiration via Redis TTL
 * - Single-use (deleted after successful verification)
 *
 * @example
 * ```typescript
 * import { createOtp, verifyOtp } from './services/otp.service';
 *
 * // Generate and send OTP
 * const otp = await createOtp('user@example.com', 'email');
 * if (otp) {
 *   await sendEmail({ to: 'user@example.com', text: `Your code: ${otp}` });
 * }
 *
 * // Verify OTP from user input
 * const result = await verifyOtp('user@example.com', userProvidedCode);
 * if (result.valid) {
 *   // Create session
 * } else {
 *   // Handle error (result.error contains reason)
 * }
 * ```
 */

import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { generateOtp, hashOtp, hashIdentifier, constantTimeCompare } from '../utils/crypto';
import elog from '../utils/adieuuLogger';

/**
 * OTP configuration constants
 *
 * @remarks
 * These values balance security with user experience:
 * - 6 digits provides 1 million combinations (sufficient with attempt limiting)
 * - 10 minute TTL allows for email/SMS delivery delays
 * - 5 attempts prevents brute force while allowing for typos
 */
const OTP_CONFIG = {
  /** OTP length in digits */
  length: 6,
  /** Time-to-live in seconds (10 minutes) */
  ttlSeconds: 10 * 60,
  /** Maximum verification attempts before lockout */
  maxAttempts: 5,
} as const;

/**
 * Structure of OTP data stored in Redis
 *
 * @remarks
 * The OTP itself is never stored - only its hash.
 * This ensures that even if Redis is compromised, OTPs cannot be recovered.
 *
 * @internal
 */
interface StoredOtp {
  /**
   * SHA-256 hash of the OTP combined with the identifier
   * The identifier is included to prevent OTP reuse across accounts
   */
  hash: string;

  /**
   * Number of verification attempts made
   * Incremented before each verification check (prevents race conditions)
   */
  attempts: number;

  /**
   * Unix timestamp (milliseconds) when the OTP was created
   * Used for audit logging and debugging
   */
  createdAt: number;

  /**
   * Delivery channel type
   * Used for audit logging and analytics
   */
  type: 'email' | 'sms';
}

/**
 * Creates and stores a new OTP for an identifier
 *
 * Generates a cryptographically secure random OTP, hashes it with the
 * identifier, and stores it in Redis with automatic expiration.
 *
 * @param identifier - Normalized email address or phone number (E.164 format)
 * @param type - Delivery channel type ('email' or 'sms')
 * @returns The plaintext OTP to send to the user, or null if Redis is unavailable
 *
 * @remarks
 * - Any existing OTP for this identifier is overwritten
 * - The returned OTP should be sent immediately and never logged
 * - The identifier should be normalized before calling this function
 *
 * @example
 * ```typescript
 * const otp = await createOtp('user@example.com', 'email');
 * if (otp) {
 *   await sendEmail({ to: 'user@example.com', text: `Your code: ${otp}` });
 * }
 * ```
 */
export async function createOtp(
  identifier: string,
  type: 'email' | 'sms'
): Promise<string | null> {
  if (!isRedisConnected()) {
    elog.warn('Redis not connected - OTP creation skipped');
    return null;
  }

  const redis = getRedis();
  const otp = generateOtp(OTP_CONFIG.length);
  const identifierHash = hashIdentifier(identifier);
  const otpHash = hashOtp(otp, identifier);

  const data: StoredOtp = {
    hash: otpHash,
    attempts: 0,
    createdAt: Date.now(),
    type,
  };

  const key = RedisKeys.otp(identifierHash);
  await redis.set(key, JSON.stringify(data), 'EX', OTP_CONFIG.ttlSeconds);

  return otp;
}

/**
 * Verifies an OTP code against the stored hash
 *
 * Uses constant-time comparison to prevent timing attacks.
 * Increments attempt counter before checking (prevents race conditions).
 * Deletes OTP after successful verification (single-use).
 *
 * @param identifier - Normalized email address or phone number
 * @param code - The OTP code provided by the user
 * @returns Verification result with validity status and optional error code
 *
 * @remarks
 * Error codes:
 * - `not_found`: No OTP exists for this identifier (expired or never created)
 * - `expired`: OTP has expired (same as not_found for security)
 * - `invalid`: OTP code does not match
 * - `max_attempts`: Too many failed attempts (OTP deleted)
 * - `redis_unavailable`: Redis connection is down
 *
 * @example
 * ```typescript
 * const result = await verifyOtp('user@example.com', '123456');
 * if (result.valid) {
 *   // Authentication successful - create session
 * } else if (result.error === 'max_attempts') {
 *   // User must request a new OTP
 * } else {
 *   // Show generic error (don't reveal specific reason to user)
 * }
 * ```
 */
export async function verifyOtp(
  identifier: string,
  code: string
): Promise<{
  valid: boolean;
  error?: 'not_found' | 'expired' | 'invalid' | 'max_attempts' | 'redis_unavailable';
}> {
  if (!isRedisConnected()) {
    elog.warn('Redis not connected - OTP verification skipped');
    return { valid: false, error: 'redis_unavailable' };
  }

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);

  // Get stored OTP data
  const stored = await redis.get(key);
  if (!stored) {
    return { valid: false, error: 'not_found' };
  }

  const data: StoredOtp = JSON.parse(stored);

  // Check attempt limit
  if (data.attempts >= OTP_CONFIG.maxAttempts) {
    // Delete the OTP to prevent further attempts
    await redis.del(key);
    return { valid: false, error: 'max_attempts' };
  }

  // Increment attempts before checking (prevents race conditions)
  data.attempts += 1;
  await redis.set(key, JSON.stringify(data), 'KEEPTTL');

  // Hash the provided code and compare
  const providedHash = hashOtp(code, identifier);
  const isValid = constantTimeCompare(providedHash, data.hash);

  if (isValid) {
    // Delete OTP on successful verification (single use)
    await redis.del(key);
    return { valid: true };
  }

  return { valid: false, error: 'invalid' };
}

/**
 * Deletes an existing OTP for an identifier
 *
 * Use this when a user requests a new OTP to ensure the old one
 * is invalidated immediately (even though it would be overwritten).
 *
 * @param identifier - Normalized email address or phone number
 *
 * @example
 * ```typescript
 * // Before creating a new OTP, delete any existing one
 * await deleteOtp('user@example.com');
 * const newOtp = await createOtp('user@example.com', 'email');
 * ```
 */
export async function deleteOtp(identifier: string): Promise<void> {
  if (!isRedisConnected()) return;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  await redis.del(key);
}

/**
 * Checks if an OTP exists for an identifier
 *
 * Useful for rate limiting decisions - if an OTP was recently sent,
 * you may want to prevent sending another one too quickly.
 *
 * @param identifier - Normalized email address or phone number
 * @returns True if an OTP exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await hasOtp('user@example.com')) {
 *   // OTP already sent - check TTL to see if user can request another
 *   const ttl = await getOtpTtl('user@example.com');
 *   if (ttl > 540) { // Less than 1 minute since creation
 *     return { error: 'Please wait before requesting another code' };
 *   }
 * }
 * ```
 */
export async function hasOtp(identifier: string): Promise<boolean> {
  if (!isRedisConnected()) return false;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  return (await redis.exists(key)) === 1;
}

/**
 * Gets the remaining time-to-live for an OTP in seconds
 *
 * Useful for rate limiting and informing users how long until
 * they can request a new OTP.
 *
 * @param identifier - Normalized email address or phone number
 * @returns Remaining TTL in seconds, or 0 if no OTP exists
 *
 * @example
 * ```typescript
 * const ttl = await getOtpTtl('user@example.com');
 * if (ttl > 0) {
 *   // Calculate time since creation
 *   const elapsed = 600 - ttl; // OTP_CONFIG.ttlSeconds - ttl
 *   if (elapsed < 60) {
 *     return { error: `Please wait ${60 - elapsed} seconds` };
 *   }
 * }
 * ```
 */
export async function getOtpTtl(identifier: string): Promise<number> {
  if (!isRedisConnected()) return 0;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}
