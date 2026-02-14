/**
 * Auth controller
 * Business logic for authentication endpoints
 */

import { createOtp } from '../../services/otp.service';
import { checkRateLimit, type RateLimitResult } from '../../services/rate-limit.service';
import { sendEmail, sendSms } from '../../services/messaging';
import { sanitizeString } from '../../utils/sanitize';
import { hashIdentifier, hashIp } from '../../utils/crypto';
import { addJitter } from '../../utils/timing';
import { config } from '../../config';

/** OTP request input */
export interface RequestOtpInput {
  identifier: string;
  type: 'email' | 'sms';
}

/** OTP request result */
export type RequestOtpResult =
  | { success: true }
  | { success: false; error: 'validation' | 'rate_limited'; rateLimitResult?: RateLimitResult };

/**
 * Request an OTP for authentication
 * 
 * Security measures:
 * - Rate limiting per identifier and per IP
 * - Consistent response regardless of user existence
 * - Jitter added to prevent timing attacks
 * - Identifiers are sanitized and hashed for logging
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

  // Hash identifier and IP for rate limiting and logging
  const identifierHash = hashIdentifier(sanitizedIdentifier);
  const ipHash = hashIp(clientIp);

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
  const otp = await createOtp(sanitizedIdentifier, type);

  if (otp) {
    // Send OTP via appropriate channel (fire and forget - don't await)
    if (type === 'email') {
      sendOtpEmail(sanitizedIdentifier, otp).catch((err) => {
        console.error('Failed to send OTP email:', err);
      });
    } else {
      sendOtpSms(sanitizedIdentifier, otp).catch((err) => {
        console.error('Failed to send OTP SMS:', err);
      });
    }
  }

  // Add jitter to prevent timing-based enumeration
  await addJitter();

  // Always return success (anti-enumeration)
  return { success: true };
}

/**
 * Send OTP via email
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
 * Send OTP via SMS
 */
async function sendOtpSms(phone: string, otp: string): Promise<void> {
  await sendSms({
    to: phone,
    message: `Your Chadder code is ${otp}. It expires in 10 minutes.`,
  });
}

/**
 * Build a magic link for email authentication
 */
function buildMagicLink(identifier: string, otp: string): string {
  // Encode identifier and OTP in the token
  const token = Buffer.from(`${identifier}:${otp}`).toString('base64url');

  // Create HMAC signature
  const signature = createSignature(token);

  return `${config.webAppUrl}/auth/verify?t=${token}&s=${signature}`;
}

/**
 * Create HMAC signature for magic link
 */
function createSignature(data: string): string {
  const encoder = new TextEncoder();
  // Simple signature using OTP secret - in production, use proper HMAC
  const combined = `${data}:${config.security.otpSecret}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get client IP from request, handling proxy headers
 */
export function getClientIp(request: Request): string {
  // Check X-Real-IP header (set by Caddy)
  const realIp = request.headers.get('X-Real-IP');
  if (realIp) return realIp;

  // Check X-Forwarded-For header
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    // Take the first IP (original client)
    return forwardedFor.split(',')[0].trim();
  }

  // Fallback - this won't be accurate behind a proxy
  return '127.0.0.1';
}

