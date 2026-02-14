/**
 * OTP Service
 * Handles OTP generation, storage, and verification
 */

import { getRedis, isRedisConnected, RedisKeys } from '../db';
import { generateOtp, hashOtp, hashIdentifier, constantTimeCompare } from '../utils/crypto';

/** OTP configuration */
const OTP_CONFIG = {
  /** OTP length in digits */
  length: 6,
  /** Time-to-live in seconds */
  ttlSeconds: 10 * 60, // 10 minutes
  /** Maximum verification attempts */
  maxAttempts: 5,
} as const;

/** Stored OTP data in Redis */
interface StoredOtp {
  /** Hashed OTP */
  hash: string;
  /** Number of verification attempts */
  attempts: number;
  /** Creation timestamp */
  createdAt: number;
  /** Identifier type */
  type: 'email' | 'sms';
}

/**
 * Request a new OTP for an identifier
 * 
 * @param identifier - Normalized email or phone
 * @param type - Delivery type ('email' or 'sms')
 * @returns The plain OTP (for sending to user) or null if Redis unavailable
 */
export async function createOtp(
  identifier: string,
  type: 'email' | 'sms'
): Promise<string | null> {
  if (!isRedisConnected()) {
    console.warn('Redis not connected - OTP creation skipped');
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
 * Verify an OTP for an identifier
 * 
 * @param identifier - Normalized email or phone
 * @param code - The OTP code provided by user
 * @returns Verification result
 */
export async function verifyOtp(
  identifier: string,
  code: string
): Promise<{
  valid: boolean;
  error?: 'not_found' | 'expired' | 'invalid' | 'max_attempts' | 'redis_unavailable';
}> {
  if (!isRedisConnected()) {
    console.warn('Redis not connected - OTP verification skipped');
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
 * Delete an OTP (e.g., when user requests a new one)
 */
export async function deleteOtp(identifier: string): Promise<void> {
  if (!isRedisConnected()) return;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  await redis.del(key);
}

/**
 * Check if an OTP exists for an identifier
 */
export async function hasOtp(identifier: string): Promise<boolean> {
  if (!isRedisConnected()) return false;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  return (await redis.exists(key)) === 1;
}

/**
 * Get remaining TTL for an OTP (for rate limiting decisions)
 */
export async function getOtpTtl(identifier: string): Promise<number> {
  if (!isRedisConnected()) return 0;

  const redis = getRedis();
  const identifierHash = hashIdentifier(identifier);
  const key = RedisKeys.otp(identifierHash);
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}

