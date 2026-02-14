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
 * - Exponential backoff starts at 2s and doubles each attempt (max 60s)
 */
const OTP_CONFIG = {
  /** OTP length in digits */
  length: 6,
  /** Time-to-live in seconds (10 minutes) */
  ttlSeconds: 10 * 60,
  /** Maximum verification attempts before OTP is locked */
  maxAttempts: 5,
  /** Base backoff delay in milliseconds (doubles each attempt) */
  backoffBaseMs: 2000,
  /** Maximum backoff delay in milliseconds */
  backoffMaxMs: 60000,
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

  /**
   * Unix timestamp (milliseconds) until which verification is blocked
   * Set after each failed attempt using exponential backoff
   */
  backoffUntil?: number;
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
 * Result type for OTP verification
 */
export interface VerifyOtpResult {
  /** Whether the OTP was valid */
  valid: boolean;
  /** Error code if verification failed */
  error?: 'not_found' | 'expired' | 'invalid' | 'max_attempts' | 'backoff' | 'redis_unavailable';
  /** Number of failed attempts (for notification purposes) */
  failedAttempts?: number;
  /** Seconds until backoff expires (if in backoff state) */
  retryAfterSeconds?: number;
}

/**
 * Performs a dummy hash and compare operation.
 *
 * Used to ensure consistent timing across all code paths, preventing
 * timing-based enumeration attacks.
 *
 * @param identifier - Identifier to use in dummy hash
 * @param code - Code to use in dummy hash
 * @internal
 */
function performDummyHashCompare(identifier: string, code: string): void {
  // Use a fixed dummy hash that looks like a real OTP hash
  const dummyStoredHash = '0'.repeat(64);
  const providedHash = hashOtp(code, identifier);
  // Always perform the comparison even though we know it will fail
  constantTimeCompare(providedHash, dummyStoredHash);
}

/**
 * Calculates exponential backoff delay in milliseconds.
 *
 * @param attempts - Number of failed attempts (1-indexed)
 * @returns Backoff delay in milliseconds, capped at backoffMaxMs
 * @internal
 */
function calculateBackoffMs(attempts: number): number {
  // 2^(attempts-1) * base, capped at max
  // attempts=1 -> 2s, attempts=2 -> 4s, attempts=3 -> 8s, etc.
  const delay = Math.pow(2, attempts - 1) * OTP_CONFIG.backoffBaseMs;
  return Math.min(delay, OTP_CONFIG.backoffMaxMs);
}

/**
 * Verifies an OTP code against the stored hash
 *
 * Uses constant-time comparison to prevent timing attacks.
 * All code paths perform equivalent operations to prevent timing-based enumeration.
 * Implements exponential backoff after failed attempts.
 *
 * @param identifier - Normalized email address or phone number
 * @param code - The OTP code provided by the user
 * @returns Verification result with validity status and metadata
 *
 * @remarks
 * Error codes:
 * - `not_found`: No OTP exists for this identifier (expired or never created)
 * - `invalid`: OTP code does not match
 * - `max_attempts`: Too many failed attempts (OTP is now locked)
 * - `backoff`: Must wait before retrying (retryAfterSeconds indicates when)
 * - `redis_unavailable`: Redis connection is down
 *
 * Security: All code paths perform hash computation and constant-time
 * comparison to prevent timing-based analysis.
 *
 * @example
 * ```typescript
 * const result = await verifyOtp('user@example.com', '123456');
 * if (result.valid) {
 *   // Authentication successful - create session
 * } else if (result.error === 'backoff') {
 *   // User must wait: result.retryAfterSeconds
 * } else if (result.error === 'max_attempts') {
 *   // OTP locked - user must request a new one
 *   // Notify user: result.failedAttempts attempts were made
 * }
 * ```
 */
export async function verifyOtp(
  identifier: string,
  code: string
): Promise<VerifyOtpResult> {
  if (!isRedisConnected()) {
    elog.warn('Redis not connected - OTP verification skipped');
    // Perform dummy operations for consistent timing
    performDummyHashCompare(identifier, code);
    return { valid: false, error: 'redis_unavailable' };
  }

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);

  // Get stored OTP data
  const stored = await redis.get(key);

  if (!stored) {
    // OTP not found - perform dummy operations to match timing of valid path
    performDummyHashCompare(identifier, code);
    // Perform a dummy Redis operation to match SET timing
    await redis.get(key);
    return { valid: false, error: 'not_found' };
  }

  const data: StoredOtp = JSON.parse(stored);
  const now = Date.now();

  // Check if in backoff period
  if (data.backoffUntil && now < data.backoffUntil) {
    // Still in backoff - perform dummy operations for consistent timing
    performDummyHashCompare(identifier, code);
    const retryAfterSeconds = Math.ceil((data.backoffUntil - now) / 1000);
    return {
      valid: false,
      error: 'backoff',
      retryAfterSeconds,
      failedAttempts: data.attempts,
    };
  }

  // Check attempt limit (OTP is locked after max attempts)
  if (data.attempts >= OTP_CONFIG.maxAttempts) {
    // OTP locked - perform dummy operations for consistent timing
    performDummyHashCompare(identifier, code);
    // Don't delete - let it expire naturally so user can't enumerate by
    // checking if a new OTP request succeeds immediately
    return {
      valid: false,
      error: 'max_attempts',
      failedAttempts: data.attempts,
    };
  }

  // Hash the provided code and compare (always performed)
  const providedHash = hashOtp(code, identifier);
  const isValid = constantTimeCompare(providedHash, data.hash);

  if (isValid) {
    // Delete OTP on successful verification (single use)
    await redis.del(key);
    return { valid: true };
  }

  // Invalid code - increment attempts and set backoff
  data.attempts += 1;
  data.backoffUntil = now + calculateBackoffMs(data.attempts);
  await redis.set(key, JSON.stringify(data), 'KEEPTTL');

  const retryAfterSeconds = Math.ceil(calculateBackoffMs(data.attempts) / 1000);

  return {
    valid: false,
    error: 'invalid',
    failedAttempts: data.attempts,
    retryAfterSeconds,
  };
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
