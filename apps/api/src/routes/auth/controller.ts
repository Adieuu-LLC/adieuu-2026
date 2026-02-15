/**
 * Authentication controller module.
 *
 * Contains the business logic for authentication endpoints, including OTP
 * generation, delivery, and verification. This module implements security
 * best practices to prevent enumeration attacks and abuse.
 *
 * @module routes/auth/controller
 */

import { createOtp, verifyOtp, type VerifyOtpResult } from '../../services/otp.service';
import { checkRateLimit, type RateLimitResult } from '../../services/rate-limit.service';
import {
  createSession,
  getSessionFromRequest,
  destroySession,
  getSessionIdFromRequest,
  buildLogoutCookie,
  type SessionData,
} from '../../services/session.service';
import { getUserRepository } from '../../repositories/user.repository';
import { sendEmail, sendSms } from '../../services/messaging';
import { sanitizeString } from '../../utils/sanitize';
import { hashIdentifier, hashIp, encrypt } from '../../utils/crypto';
import { addJitter } from '../../utils/timing';
import { config } from '../../config';
import { getEmailTemplate, getSmsMessage, type Locale, DEFAULT_LOCALE } from '../../i18n';
import elog from '../../utils/adieuuLogger';
import type { UserDocument } from '../../models/user';

/** OTP expiration time in minutes */
const OTP_EXPIRES_IN_MINUTES = 10;

/** Application name for templates */
const APP_NAME = 'Chadder';

/** Maximum failed OTP attempts before account lockout */
const MAX_FAILED_ATTEMPTS = 5;

/** Account lockout duration in minutes */
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Input parameters for requesting an OTP.
 *
 * @interface RequestOtpInput
 * @property identifier - The email address or phone number to send the OTP to
 * @property type - The delivery channel ('email' for email, 'sms' for SMS)
 */
export interface RequestOtpInput {
  identifier: string;
  type: 'email' | 'sms';
}

/**
 * Result type for OTP request operations.
 *
 * This is a discriminated union type that represents either a successful
 * OTP request or a failure with error details.
 *
 * @typedef RequestOtpResult
 *
 * @example
 * ```typescript
 * const result = await requestOtp(input, clientIp);
 * if (result.success) {
 *   // OTP was generated and sent
 * } else if (result.error === 'rate_limited') {
 *   // Handle rate limiting, optionally using result.rateLimitResult
 * }
 * ```
 */
export type RequestOtpResult =
  | { success: true }
  | { success: false; error: 'validation' | 'rate_limited' | 'account_locked'; rateLimitResult?: RateLimitResult; retryAfterSeconds?: number };

/**
 * Requests an OTP for passwordless authentication.
 *
 * This function handles the complete OTP request flow including validation,
 * rate limiting, OTP generation, and delivery. It implements multiple
 * security measures to prevent abuse and enumeration attacks.
 *
 * @param input - The OTP request parameters containing identifier and delivery type
 * @param clientIp - The client's IP address for rate limiting purposes
 * @returns A promise resolving to the operation result
 *
 * @remarks
 * Security measures implemented:
 * - Rate limiting per identifier (prevents brute force on single account)
 * - Rate limiting per IP (prevents distributed attacks)
 * - Consistent response regardless of user existence (anti-enumeration)
 * - Timing jitter added to all responses (prevents timing-based analysis)
 * - Identifiers are sanitized before processing
 * - Identifiers and IPs are hashed for logging (no PII in logs)
 *
 * @example
 * ```typescript
 * const result = await requestOtp(
 *   { identifier: 'user@example.com', type: 'email' },
 *   '192.168.1.1'
 * );
 *
 * if (!result.success && result.error === 'rate_limited') {
 *   console.log('Rate limited, reset at:', result.rateLimitResult?.resetAt);
 * }
 * ```
 */
export async function requestOtp(
  input: RequestOtpInput,
  clientIp: string
): Promise<RequestOtpResult> {
  const { identifier, type } = input;

  // Sanitize and normalize identifier
  const sanitizedIdentifier =
    type === 'email'
      ? sanitizeString(identifier, 'email')
      : sanitizeString(identifier, 'phone');

  // Sanitize the IP address to prevent injection via proxy headers
  const sanitizedIp = sanitizeString(clientIp, 'ip');

  // Log if sanitization modified the input (potential probe/injection attempt)
  if (sanitizedIdentifier.deltas > 0) {
    elog.warn('Identifier sanitization modified input', {
      type,
      deltas: sanitizedIdentifier.deltas,
      ipHash: hashIp(sanitizedIp.value),
    });
  }
  if (sanitizedIp.deltas > 0) {
    elog.warn('IP address sanitization modified input', {
      deltas: sanitizedIp.deltas,
      originalLength: clientIp.length,
    });
  }

  // Hash identifier and IP for rate limiting and logging
  const identifierHash = hashIdentifier(sanitizedIdentifier.value);
  const ipHash = hashIp(sanitizedIp.value);

  // Check if user account is locked (if user exists)
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByIdentifier(sanitizedIdentifier.value);

  if (existingUser?.lockedUntil && existingUser.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil(
      (existingUser.lockedUntil.getTime() - Date.now()) / 1000
    );
    elog.warn('OTP request blocked: account locked', {
      identifierHash,
      retryAfterSeconds,
    });
    await addJitter();
    return { success: false, error: 'account_locked', retryAfterSeconds };
  }

  // Check rate limits
  const identifierLimit = await checkRateLimit('auth:request:identifier', identifierHash);
  if (!identifierLimit.allowed) {
    // Add jitter before responding
    await addJitter();
    return { success: false, error: 'rate_limited', rateLimitResult: identifierLimit };
  }

  const ipLimit = await checkRateLimit('auth:request:ip', ipHash);
  if (!ipLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited', rateLimitResult: ipLimit };
  }

  // Generate and store OTP
  const otp = await createOtp(sanitizedIdentifier.value, type);

  if (otp) {
    // Send OTP via appropriate channel (fire and forget - don't await)
    if (type === 'email') {
      sendOtpEmail(sanitizedIdentifier.value, otp).catch((err) => {
        elog.error('Failed to send OTP email', { error: err, identifierHash });
      });
    } else {
      sendOtpSms(sanitizedIdentifier.value, otp).catch((err) => {
        elog.error('Failed to send OTP SMS', { error: err, identifierHash });
      });
    }
  }

  // Add jitter to prevent timing-based enumeration
  await addJitter();

  // Always return success (anti-enumeration)
  return { success: true };
}

/**
 * Sends an OTP to the user via email.
 *
 * Constructs and sends an HTML email containing the OTP code and a magic link
 * that allows one-click authentication. The email includes both plaintext and
 * HTML versions for maximum compatibility.
 *
 * @param email - The recipient's email address (must be pre-sanitized)
 * @param otp - The one-time password to send
 * @param locale - The locale for message translations (default: 'en')
 * @returns A promise that resolves when the email is queued for delivery
 *
 * @internal
 */
async function sendOtpEmail(
  email: string,
  otp: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const magicLink = buildMagicLink(email, otp);

  const template = getEmailTemplate('otpWithMagicLink', locale, {
    appName: APP_NAME,
    otp,
    magicLink,
    expiresInMinutes: OTP_EXPIRES_IN_MINUTES,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

/**
 * Sends an OTP to the user via SMS.
 *
 * Sends a brief SMS message containing the OTP code and expiration notice.
 * The message is kept short to minimize SMS segment costs.
 *
 * @param phone - The recipient's phone number in E.164 format (must be pre-sanitized)
 * @param otp - The one-time password to send
 * @param locale - The locale for message translations (default: 'en')
 * @returns A promise that resolves when the SMS is queued for delivery
 *
 * @internal
 */
async function sendOtpSms(
  phone: string,
  otp: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<void> {
  const message = getSmsMessage('otp', locale, {
    appName: APP_NAME,
    otp,
    expiresInMinutes: OTP_EXPIRES_IN_MINUTES,
  });

  await sendSms({
    to: phone,
    message,
  });
}

/**
 * Builds a magic link URL for one-click email authentication.
 *
 * Creates an encrypted URL token containing the user's identifier and OTP.
 * The token is encrypted using AES-256-GCM, which provides both confidentiality
 * (the OTP is not visible in the URL) and integrity (tampering is detected).
 *
 * @param identifier - The user's email address
 * @param otp - The one-time password
 * @returns A fully-qualified URL pointing to the web app's verification endpoint
 *
 * @remarks
 * The token format is: encrypt(identifier:otp:timestamp)
 * - The timestamp provides additional entropy and enables expiry checks
 * - AES-GCM authentication tag prevents tampering without a signature
 *
 * @internal
 */
function buildMagicLink(identifier: string, otp: string): string {
  // Include timestamp for additional entropy and potential expiry checks
  const payload = `${identifier}:${otp}:${Date.now()}`;

  // Encrypt the payload - AES-GCM provides both confidentiality and authentication
  const token = encrypt(payload);

  return `${config.webAppUrl}/auth/verify?t=${token}`;
}

/**
 * Extracts the client's IP address from the request, handling reverse proxy headers.
 *
 * This function checks common proxy headers to determine the original client IP
 * when the API is running behind a reverse proxy (e.g., Caddy, nginx).
 *
 * @param request - The incoming HTTP request object
 * @returns The client's IP address, or '127.0.0.1' if it cannot be determined
 *
 * @remarks
 * Header priority:
 * 1. `X-Real-IP` - Set by Caddy and some proxies
 * 2. `X-Forwarded-For` - Standard proxy header (first IP in chain)
 * 3. Fallback to localhost if no headers present
 *
 * @security
 * These headers can be spoofed by clients if not properly stripped by the
 * reverse proxy. Ensure your proxy configuration overwrites these headers.
 */
export function getClientIp(request: Request): string {
  // Check X-Real-IP header (set by Caddy)
  const realIp = request.headers.get('X-Real-IP');
  if (realIp) return realIp;

  // Check X-Forwarded-For header
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    // Take the first IP (original client)
    const firstIp = forwardedFor.split(',')[0];
    return firstIp?.trim() ?? '127.0.0.1';
  }

  // Fallback - this won't be accurate behind a proxy
  return '127.0.0.1';
}

/**
 * Input parameters for verifying an OTP.
 */
export interface VerifyOtpInput {
  identifier: string;
  code: string;
}

/**
 * Result type for OTP verification operations.
 */
export type VerifyOtpHandlerResult =
  | { success: true; cookie: string; user: UserDocument }
  | {
    success: false;
    error: 'invalid' | 'expired' | 'max_attempts' | 'backoff' | 'rate_limited' | 'account_locked';
    retryAfterSeconds?: number;
  };

/**
 * Detects whether an identifier is an email or phone number.
 *
 * @param identifier - The email or phone number to check
 * @returns 'email' if contains @, 'phone' otherwise
 */
function detectIdentifierType(identifier: string): 'email' | 'phone' {
  return identifier.includes('@') ? 'email' : 'phone';
}

/**
 * Finds or creates a user based on identifier.
 *
 * @param identifier - The user's email or phone
 * @param identifierType - Whether it's email or phone
 * @returns The user document
 */
async function findOrCreateUser(
  identifier: string,
  identifierType: 'email' | 'phone'
): Promise<UserDocument> {
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByIdentifier(identifier);

  if (existingUser) {
    // Record successful login
    await userRepo.recordLogin(existingUser._id);
    return existingUser;
  }

  // Create new user
  const newUser = await userRepo.create({
    ...(identifierType === 'email'
      ? { email: identifier, emailVerified: true }
      : { phone: identifier, phoneVerified: true }),
  });

  elog.info('New user created', {
    userId: newUser._id.toHexString(),
    identifierType,
  });

  return newUser;
}

/**
 * Records a failed authentication attempt.
 *
 * @param identifier - The user's email or phone
 * @returns Object with lockout info if account is now locked
 */
async function recordFailedAttempt(
  identifier: string
): Promise<{ locked: boolean; retryAfterSeconds?: number }> {
  const userRepo = getUserRepository();
  const user = await userRepo.findByIdentifier(identifier);

  if (!user) {
    // User doesn't exist yet - can't track attempts
    // This is fine - we'll track via OTP service's Redis-based backoff
    return { locked: false };
  }

  await userRepo.incrementFailedAttempts(user._id);

  // Check if we should lock the account
  const updatedUser = await userRepo.findById(user._id);
  if (updatedUser && updatedUser.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
    await userRepo.lockAccount(user._id, lockUntil);

    elog.warn('Account locked due to too many failed attempts', {
      userId: user._id.toHexString(),
      failedAttempts: updatedUser.failedAttempts,
      lockDurationMinutes: LOCKOUT_DURATION_MINUTES,
    });

    return {
      locked: true,
      retryAfterSeconds: LOCKOUT_DURATION_MINUTES * 60,
    };
  }

  return { locked: false };
}

/**
 * Verifies an OTP code for passwordless authentication.
 *
 * This function handles OTP verification with rate limiting and creates
 * a session on successful authentication.
 *
 * @param input - The verification parameters containing identifier and code
 * @param clientIp - The client's IP address for rate limiting and session metadata
 * @param userAgent - The user agent string for session metadata
 * @returns A promise resolving to the verification result with session cookie
 */
export async function verifyOtpHandler(
  input: VerifyOtpInput,
  clientIp: string,
  userAgent?: string
): Promise<VerifyOtpHandlerResult> {
  const { identifier, code } = input;

  // Detect identifier type and sanitize accordingly
  const identifierType = detectIdentifierType(identifier);
  const sanitizedIdentifier = sanitizeString(identifier, identifierType);
  const sanitizedIp = sanitizeString(clientIp, 'ip');
  const identifierHash = hashIdentifier(sanitizedIdentifier.value);
  const ipHash = hashIp(sanitizedIp.value);

  // Check if account is locked
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByIdentifier(sanitizedIdentifier.value);

  if (existingUser?.lockedUntil && existingUser.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil(
      (existingUser.lockedUntil.getTime() - Date.now()) / 1000
    );
    await addJitter();
    return { success: false, error: 'account_locked', retryAfterSeconds };
  }

  // Check rate limits for verification attempts
  const ipLimit = await checkRateLimit('auth:verify:ip', ipHash);
  if (!ipLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited', retryAfterSeconds: 60 };
  }

  // Verify the OTP
  const result = await verifyOtp(sanitizedIdentifier.value, code);

  if (!result.valid) {
    // Record failed attempt in database
    const lockResult = await recordFailedAttempt(sanitizedIdentifier.value);
    if (lockResult.locked) {
      await addJitter();
      return {
        success: false,
        error: 'account_locked',
        retryAfterSeconds: lockResult.retryAfterSeconds,
      };
    }

    await addJitter();

    if (result.error === 'backoff') {
      return {
        success: false,
        error: 'backoff',
        retryAfterSeconds: result.retryAfterSeconds,
      };
    }

    if (result.error === 'max_attempts') {
      return { success: false, error: 'max_attempts' };
    }

    if (result.error === 'not_found') {
      return { success: false, error: 'expired' };
    }

    return { success: false, error: 'invalid' };
  }

  // Find or create user
  const user = await findOrCreateUser(sanitizedIdentifier.value, identifierType);

  // Create session with HTTP-only cookie
  const { cookie } = await createSession(user._id, sanitizedIdentifier.value, identifierType, {
    userAgent,
    ipAddress: sanitizedIp.value,
  });

  elog.info('User authenticated successfully', {
    identifierHash,
    identifierType,
    userId: user._id.toHexString(),
  });

  return { success: true, cookie, user };
}

/**
 * Gets the current session from a request.
 *
 * @param request - The incoming request with session cookie
 * @returns Session data if valid, null otherwise
 */
export async function getSessionHandler(request: Request): Promise<SessionData | null> {
  return getSessionFromRequest(request);
}

/**
 * Logs out the current session.
 *
 * @param request - The incoming request with session cookie
 * @returns The logout cookie to clear the session
 */
export async function logoutHandler(request: Request): Promise<string> {
  const sessionId = getSessionIdFromRequest(request);
  if (sessionId) {
    await destroySession(sessionId);
  }
  return buildLogoutCookie();
}
