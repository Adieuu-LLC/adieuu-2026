/**
 * Cryptographic utilities
 * Secure random generation, hashing, and constant-time comparison
 */

import { createHash, timingSafeEqual } from 'crypto';
import { config } from '../config';

/**
 * Generate a cryptographically secure OTP
 * @param length - Number of digits (default 6)
 * @returns OTP string (e.g., "123456")
 */
export function generateOtp(length = 6): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const max = Math.pow(10, length);
  const value = buffer[0] ?? 0;
  return (value % max).toString().padStart(length, '0');
}

/**
 * Generate a cryptographically secure session ID
 * @returns Base64 URL-safe session ID (256 bits)
 */
export function generateSessionId(): string {
  const buffer = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(buffer);
  return bufferToBase64Url(buffer);
}

/**
 * Generate a cryptographically secure token
 * @param bytes - Number of bytes (default 32 = 256 bits)
 * @returns Base64 URL-safe token
 */
export function generateSecureToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return bufferToBase64Url(buffer);
}

/**
 * Hash an OTP for storage
 * Includes identifier and secret to prevent rainbow table attacks
 * 
 * @param otp - The OTP to hash
 * @param identifier - The email or phone (normalized)
 * @returns SHA-256 hash as hex string
 */
export function hashOtp(otp: string, identifier: string): string {
  const data = `${otp}:${identifier}:${config.security.otpSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash an identifier for logging/rate limiting
 * Used to avoid storing raw emails/phones in logs
 * 
 * @param identifier - Email or phone
 * @returns SHA-256 hash as hex string
 */
export function hashIdentifier(identifier: string): string {
  const data = `${identifier}:${config.security.otpSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Hash an IP address for logging
 * 
 * @param ip - IP address
 * @returns SHA-256 hash as hex string
 */
export function hashIp(ip: string): string {
  const data = `${ip}:${config.security.sessionSecret}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Constant-time string comparison
 * Prevents timing attacks when comparing secrets
 * 
 * @param a - First string
 * @param b - Second string
 * @returns true if equal
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
 * Convert Uint8Array to base64 URL-safe string
 */
function bufferToBase64Url(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64 URL-safe string to Uint8Array
 */
export function base64UrlToBuffer(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}
