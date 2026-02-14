/**
 * Authentication controller module.
 *
 * Contains the business logic for authentication endpoints, including OTP
 * generation, delivery, and verification. This module implements security
 * best practices to prevent enumeration attacks and abuse.
 *
 * @module routes/auth/controller
 */

import { createOtp } from '../../services/otp.service';
import { checkRateLimit, type RateLimitResult } from '../../services/rate-limit.service';
import { sendEmail, sendSms } from '../../services/messaging';
import { sanitizeString } from '../../utils/sanitize';
import { hashIdentifier, hashIp, hmacSign } from '../../utils/crypto';
import { addJitter } from '../../utils/timing';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

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
  | { success: false; error: 'validation' | 'rate_limited'; rateLimitResult?: RateLimitResult };

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
  const sanitizedIdentifier = type === 'email'
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
 * @returns A promise that resolves when the email is queued for delivery
 *
 * @internal
 */
async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const magicLink = buildMagicLink(email, otp);

  await sendEmail({
    to: email,
    subject: 'Your Chadder login code',
    text: `Your login code is: ${otp}\n\nOr click this link to sign in: ${magicLink}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Your Chadder login code</h2>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 24px 0;">
          ${otp}
        </p>
        <p>Or click the button below to sign in:</p>
        <a href="${magicLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">
          Sign in to Chadder
        </a>
        <p style="color: #666; font-size: 14px; margin-top: 24px;">
          This code expires in 10 minutes.
        </p>
        <p style="color: #999; font-size: 12px;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `,
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
 * @returns A promise that resolves when the SMS is queued for delivery
 *
 * @internal
 */
async function sendOtpSms(phone: string, otp: string): Promise<void> {
  await sendSms({
    to: phone,
    message: `Your Chadder code is ${otp}. It expires in 10 minutes.`,
  });
}

/**
 * Builds a magic link URL for one-click email authentication.
 *
 * Creates a signed URL that encodes the user's identifier and OTP, allowing
 * them to authenticate by simply clicking the link in their email. The link
 * includes an HMAC signature to prevent tampering.
 *
 * @param identifier - The user's email address
 * @param otp - The one-time password
 * @returns A fully-qualified URL pointing to the web app's verification endpoint
 *
 * @internal
 */
function buildMagicLink(identifier: string, otp: string): string {
  // Encode identifier and OTP in the token
  const token = Buffer.from(`${identifier}:${otp}`).toString('base64url');

  // Create HMAC signature
  const signature = createSignature(token);

  return `${config.webAppUrl}/auth/verify?t=${token}&s=${signature}`;
}

/**
 * Creates a cryptographic signature for magic link integrity verification.
 *
 * Uses HMAC-SHA256 with the session secret to create a signature that
 * cannot be forged without knowledge of the secret key.
 *
 * @param data - The data to sign (typically the base64url-encoded token)
 * @returns A base64url-encoded HMAC-SHA256 signature
 *
 * @internal
 */
function createSignature(data: string): string {
  return hmacSign(data);
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
