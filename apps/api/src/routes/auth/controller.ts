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
  createAccountSession,
  requireAccountSession,
  getSessionIdFromRequest,
  destroySession,
  destroyAllSessions,
  buildLogoutCookie,
  type AccountSessionData,
} from '../../services/session.service';
import {
  generateAccountHash,
  createSignedToken,
} from '../../services/account-token.service';
import {
  getPlatformMaxVideoDurationSeconds,
  resolveMaxVideoDurationSecondsForAccount,
} from '../../services/media-limits.service';
import { getIdentityCountRepository } from '../../repositories/identity-count.repository';
import {
  getMfaStatus,
  verifyTotpCode,
  verifyWebAuthnAuthentication,
  generateWebAuthnAuthenticationOptions,
} from '../../services/mfa.service';
import { getSessionRepository } from '../../repositories/session.repository';
import { maskIpAddress, toPublicSession, type PublicSession } from '../../models/session';
import type { MfaStatus } from '../../models/mfa';
import { ObjectId } from 'mongodb';
import { getUserRepository } from '../../repositories/user.repository';
import { sendEmail, sendSms } from '../../services/messaging';
import { sanitizeString } from '../../utils/sanitize';
import { hashIdentifier, hashIp, encrypt, generateSecureToken } from '../../utils/crypto';
import { addJitter } from '../../utils/timing';
import { config } from '../../config';
import { isAuthIdentifierAllowed } from '../../services/platform-settings.service';
import { refreshUserGeoIfStale } from '../../services/geo/geo.service';
import { getEmailTemplate, getSmsMessage, type Locale, DEFAULT_LOCALE } from '../../i18n';
import { getRedis, isRedisConnected } from '../../db';
import elog from '../../utils/adieuuLogger';
import type { UserDocument } from '../../models/user';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { getStripe } from '../../services/billing/stripe.client';
import {
  deriveSubscriptionBilling,
  billingErrorLogFields,
  reconcileBillingFromCustomer,
} from '../../services/billing/billing.service';
import { resolveEffectiveAccess } from '../../services/billing/resolve-access';
import { evaluateAliasGate, type AliasGateResult } from '../../services/age-verification/alias-gate';
import { isAgeVerificationEnabled } from '../../services/age-verification/av-settings';
import { checkVerificationStatus } from '../../services/age-verification/age-verification.service';
import type { AgeVerificationStatus } from '../../models/user';

/** OTP expiration time in minutes */
const OTP_EXPIRES_IN_MINUTES = 10;

/** Application name for templates */
const APP_NAME = 'Adieuu';

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
  | {
      success: false;
      error: 'validation' | 'rate_limited' | 'account_locked' | 'not_allowed';
      rateLimitResult?: RateLimitResult;
      retryAfterSeconds?: number;
    };

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

  const authAllowed = await isAuthIdentifierAllowed(sanitizedIdentifier.value, type);
  if (!authAllowed) {
    await addJitter();
    return { success: false, error: 'not_allowed' };
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

  elog.info("OTP auth email sent")
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

/** Dev-only env: pretend every request originates from this IP (geo, rate limits). Ignored in production. */
const DEV_CLIENT_IP_ENV = 'DEV_CLIENT_IP';

function sanitizeDevClientIp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.trim();
  if (!t || t.length > 45) return undefined;
  if (/[\s\r\n\u0000]/.test(t)) return undefined;
  return t;
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
 * Non-production: when `DEV_CLIENT_IP` is set to a sanitized public IP, that value wins
 * (local testing for jurisdiction / age verification without trusting client headers).
 *
 * Header priority (when no dev emulation):
 * 1. `X-Real-IP` - Set by Caddy and some proxies
 * 2. `X-Forwarded-For` - Standard proxy header (first IP in chain)
 * 3. Fallback to localhost if no headers present
 *
 * @security
 * These headers can be spoofed by clients if not properly stripped by the
 * reverse proxy. Ensure your proxy configuration overwrites these headers.
 */
export function getClientIp(request: Request): string {
  if (config.env !== 'production') {
    const emulated = sanitizeDevClientIp(process.env[DEV_CLIENT_IP_ENV]);
    if (emulated) return emulated;
  }

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
    success: true;
    mfaRequired: true;
    mfaToken: string;
    mfaOptions: MfaStatus;
    webauthnChallenge?: Awaited<ReturnType<typeof generateWebAuthnAuthenticationOptions>>;
  }
  | {
    success: false;
    error:
      | 'invalid'
      | 'expired'
      | 'max_attempts'
      | 'backoff'
      | 'rate_limited'
      | 'account_locked'
      | 'not_allowed';
    retryAfterSeconds?: number;
  };

/** MFA token TTL in seconds */
const MFA_TOKEN_TTL_SECONDS = 300; // 5 minutes

/** Data stored with MFA token */
interface MfaPendingLogin {
  userId: string;
  identifier: string;
  identifierType: 'email' | 'phone';
  userAgent?: string;
  ipAddress?: string;
  createdAt: number;
}

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

  const deliveryChannel: 'email' | 'sms' = identifierType === 'email' ? 'email' : 'sms';
  const verifyAllowed = await isAuthIdentifierAllowed(sanitizedIdentifier.value, deliveryChannel);
  if (!verifyAllowed) {
    await addJitter();
    return { success: false, error: 'not_allowed' };
  }

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
  const userId = user._id.toHexString();

  // Check if user has MFA enabled
  const mfaStatus = await getMfaStatus(userId);

  if (mfaStatus.enabled) {
    // MFA is required - create a pending MFA token instead of session
    const mfaToken = generateSecureToken(32);
    const pendingLogin: MfaPendingLogin = {
      userId,
      identifier: sanitizedIdentifier.value,
      identifierType,
      userAgent,
      ipAddress: sanitizedIp.value,
      createdAt: Date.now(),
    };

    // Store pending login in Redis
    if (isRedisConnected()) {
      const redis = getRedis();
      await redis.set(
        `mfa:pending:${mfaToken}`,
        JSON.stringify(pendingLogin),
        'EX',
        MFA_TOKEN_TTL_SECONDS
      );
    }

    elog.info('MFA required for login', {
      identifierHash,
      identifierType,
      userId,
    });

    // Get WebAuthn challenge if available
    let webauthnChallenge: Awaited<ReturnType<typeof generateWebAuthnAuthenticationOptions>> | undefined;
    if (mfaStatus.webauthnEnabled) {
      webauthnChallenge = await generateWebAuthnAuthenticationOptions(userId) ?? undefined;
    }

    return {
      success: true,
      mfaRequired: true,
      mfaToken,
      mfaOptions: mfaStatus,
      webauthnChallenge,
    };
  }

  // No MFA - create session directly
  const { cookie } = await createAccountSession(user._id, sanitizedIdentifier.value, identifierType, {
    userAgent,
    ipAddress: sanitizedIp.value,
  });

  await refreshUserGeoIfStale(user, sanitizedIp.value).catch((err) => {
    elog.warn('Geo refresh failed at login', { error: err, userId });
  });

  elog.info('User authenticated successfully', {
    identifierHash,
    identifierType,
    userId,
  });

  return { success: true, cookie, user };
}

/** Skip re-fetch if billing was updated less than this many ms ago. */
const BILLING_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Re-fetches billing from Stripe if stale, so the session always
 * reflects current subscription state.
 */
async function reconcileBillingIfStale(user: UserDocument): Promise<UserDocument> {
  if (!config.stripe?.enabled) return user;

  // If we have a subscription ID, use the existing fast path
  if (user.billing?.stripeSubscriptionId) {
    if (user.billing.updatedAt && Date.now() - user.billing.updatedAt.getTime() < BILLING_FRESHNESS_MS) {
      return user;
    }

    try {
      const stripe = getStripe();
      const freshBilling = await deriveSubscriptionBilling(
        stripe,
        user.billing.stripeSubscriptionId,
        user.billing,
      );

      const userRepo = getUserRepository();
      await userRepo.updateBilling(user._id, freshBilling);

      elog.info('Login-time billing reconciliation completed', {
        userId: user._id.toHexString(),
        oldStatus: user.billing.status,
        newStatus: freshBilling.status,
      });

      return { ...user, billing: freshBilling };
    } catch (err) {
      elog.warn('Login-time billing reconciliation failed; using cached billing', {
        userId: user._id.toHexString(),
        ...billingErrorLogFields(err),
      });
      return user;
    }
  }

  // No subscription ID but has customer ID — reconcile from customer
  // (covers the case where webhook never ran after checkout)
  if (user.stripeCustomerId && !user.billing?.activeSubscriptions?.length) {
    try {
      const stripe = getStripe();
      const freshBilling = await reconcileBillingFromCustomer(stripe, user);
      if (freshBilling && freshBilling.activeSubscriptions.length > 0) {
        const userRepo = getUserRepository();
        await userRepo.updateBilling(user._id, freshBilling);

        elog.info('Login-time customer-based billing reconciliation completed', {
          userId: user._id.toHexString(),
          tiers: freshBilling.activeSubscriptions,
        });

        return { ...user, billing: freshBilling };
      }
    } catch (err) {
      elog.warn('Login-time customer-based billing reconciliation failed', {
        userId: user._id.toHexString(),
        ...billingErrorLogFields(err),
      });
    }
  }

  return user;
}

/**
 * Gets the current account session and generates a fresh signedToken.
 *
 * Accepts an optional pre-loaded `UserDocument` to avoid a duplicate Mongo
 * fetch when the subscription middleware has already loaded the user.
 */
export async function getSessionHandler(
  request: Request,
  preloadedUser?: UserDocument,
): Promise<{
  session: AccountSessionData;
  signedToken: string | undefined;
  identityCount: number;
  maskedIp?: string;
  geo?: { jurisdiction: string; countryCode: string; regionCode?: string; checkedAt: string };
  subscriptions: string[];
  entitlements: string[];
  ageVerification?: {
    status: AgeVerificationStatus;
    verifiedAt?: string;
    retryAfter?: string;
    expirationCount?: number;
  };
  aliasGate?: {
    allowed: boolean;
    code?: string;
    jurisdiction?: string;
    lawUrl?: string;
    leastInvasiveMethod?: string;
    retryAfter?: string;
  };
} | null> {
  const session = await requireAccountSession(request);
  if (!session) return null;

  let user = preloadedUser ?? null;
  if (!user) {
    const userRepo = getUserRepository();
    user = await userRepo.findById(session.userId);
  }
  if (!user) return null;

  // Reconcile billing with Stripe if stale
  user = await reconcileBillingIfStale(user);

  const resolved = resolveEffectiveAccess(user);

  const accountHash = generateAccountHash(
    session.userId,
    user.createdAt,
  );

  const identityCountRepo = getIdentityCountRepository();
  const identityCount = await identityCountRepo.getCount(accountHash);

  const platformVideoMax = await getPlatformMaxVideoDurationSeconds();
  const maxVideoDurationSeconds = resolveMaxVideoDurationSecondsForAccount(
    platformVideoMax,
    user,
  );

  const { subscriptions, entitlements, isLifetime } = resolved;

  const billingMeta = user.billing || isLifetime
    ? {
        currentPeriodEnd: user.billing?.currentPeriodEnd
          ? Math.floor(user.billing.currentPeriodEnd.getTime() / 1000)
          : undefined,
        isLifetime: isLifetime || undefined,
      }
    : undefined;

  const signedToken = createSignedToken(
    accountHash,
    user.maxIdentities ?? 2,
    maxVideoDurationSeconds,
    subscriptions,
    entitlements,
    billingMeta,
  );

  const geo = user.geo
    ? {
        jurisdiction: user.geo.jurisdiction,
        countryCode: user.geo.countryCode,
        regionCode: user.geo.regionCode,
        checkedAt: user.geo.checkedAt.toISOString(),
      }
    : undefined;

  const maskedIp = maskIpAddress(getClientIp(request));

  // Evaluate alias gate eagerly so the UI can gate proactively
  let ageVerification: {
    status: AgeVerificationStatus;
    verifiedAt?: string;
    retryAfter?: string;
    expirationCount?: number;
    providerVerificationId?: string;
  } | undefined;
  let aliasGate: {
    allowed: boolean;
    code?: string;
    jurisdiction?: string;
    lawUrl?: string;
    leastInvasiveMethod?: string;
    retryAfter?: string;
  } | undefined;

  const avEnabled = await isAgeVerificationEnabled();

  // Resilient status sync: if the user has a pending verification, check with
  // the provider unless we already checked within the last 30 seconds.
  const STATUS_CHECK_DEBOUNCE_MS = 30_000;
  if (avEnabled && user.ageVerification?.status === 'pending' && user.ageVerification.providerVerificationId) {
    const lastCheck = user.ageVerification.lastStatusCheckAt?.getTime() ?? 0;
    if (Date.now() - lastCheck > STATUS_CHECK_DEBOUNCE_MS) {
      try {
        await checkVerificationStatus(user, user.ageVerification.providerVerificationId);
        const avUserRepo = getUserRepository();
        user = (await avUserRepo.findById(user._id)) ?? user;
      } catch {
        // Provider timeout -- fall through to stale local state
      }
    }
  }

  if (avEnabled) {
    const av = user.ageVerification;
    if (av) {
      const FAILED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
      const EXPIRED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

      let retryAfter: string | undefined;
      if (av.status === 'failed' && av.failedAt) {
        retryAfter = new Date(av.failedAt.getTime() + FAILED_COOLDOWN_MS).toISOString();
      } else if (av.status === 'expired' && av.lastExpiredAt) {
        const cooldown = (av.expirationCount ?? 0) >= 3 ? FAILED_COOLDOWN_MS : EXPIRED_COOLDOWN_MS;
        retryAfter = new Date(av.lastExpiredAt.getTime() + cooldown).toISOString();
      }

      ageVerification = {
        status: av.status,
        verifiedAt: av.verifiedAt?.toISOString(),
        retryAfter,
        expirationCount: av.expirationCount,
        providerVerificationId: av.status === 'pending' ? av.providerVerificationId : undefined,
      };
    }

    const gateResult = await evaluateAliasGate(user);
    if (gateResult.allowed) {
      aliasGate = { allowed: true };
    } else {
      aliasGate = {
        allowed: false,
        code: gateResult.code,
        jurisdiction: gateResult.jurisdiction,
      };
      if (gateResult.code === 'GEOFENCE_BLOCKED') {
        aliasGate.lawUrl = gateResult.lawUrl;
      }
      if (gateResult.code === 'AGE_VERIFICATION_REQUIRED') {
        aliasGate.leastInvasiveMethod = gateResult.leastInvasiveMethod;
      }
      if (gateResult.code === 'AGE_VERIFICATION_FAILED' || gateResult.code === 'AGE_VERIFICATION_COOLDOWN') {
        aliasGate.retryAfter = gateResult.retryAfter.toISOString();
      }
    }
  }

  const effectiveToken = aliasGate && !aliasGate.allowed ? undefined : signedToken;

  return { session, signedToken: effectiveToken, identityCount, maskedIp, geo, subscriptions, entitlements, ageVerification, aliasGate };
}

/**
 * Logs out the current session (unified cookie).
 */
export async function logoutHandler(request: Request): Promise<{
  cookie: string;
}> {
  const sessionId = getSessionIdFromRequest(request);
  if (sessionId) {
    await destroySession(sessionId);
  }

  return { cookie: buildLogoutCookie() };
}

/**
 * Result type for listing sessions.
 */
export type ListSessionsResult =
  | { success: true; sessions: PublicSession[] }
  | { success: false; error: 'unauthorized' };

/**
 * Lists all sessions for the current user.
 *
 * @param request - The incoming request with session cookie
 * @returns List of sessions or unauthorized error
 */
export async function listSessionsHandler(
  request: Request
): Promise<ListSessionsResult> {
  const currentSessionId = getSessionIdFromRequest(request);
  const session = await requireAccountSession(request);

  if (!session) {
    return { success: false, error: 'unauthorized' };
  }

  const sessionRepo = getSessionRepository();
  const sessions = await sessionRepo.findByUserId(session.userId);

  let publicSessions: PublicSession[] = sessions.map((s) =>
    toPublicSession(s, currentSessionId ?? undefined)
  );

  const currentSessionInList = publicSessions.some((s) => s.isCurrent);
  if (!currentSessionInList && currentSessionId) {
    const userAgent = request.headers.get('User-Agent') ?? undefined;
    publicSessions.unshift({
      id: currentSessionId,
      identifier: session.identifier,
      identifierType: session.identifierType,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      userAgent,
      ipAddress: undefined,
      isCurrent: true,
    });
  }

  publicSessions.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
  });

  return { success: true, sessions: publicSessions };
}

/**
 * Result type for revoking a session.
 */
export type RevokeSessionResult =
  | { success: true }
  | { success: false; error: 'unauthorized' | 'not_found' | 'cannot_revoke_current' };

/**
 * Revokes a specific session.
 *
 * @param request - The incoming request with session cookie
 * @param sessionIdToRevoke - The session ID to revoke
 * @returns Success or error
 */
export async function revokeSessionHandler(
  request: Request,
  sessionIdToRevoke: string
): Promise<RevokeSessionResult> {
  const currentSessionId = getSessionIdFromRequest(request);
  const session = await requireAccountSession(request);

  if (!session) {
    return { success: false, error: 'unauthorized' };
  }

  if (sessionIdToRevoke === currentSessionId) {
    return { success: false, error: 'cannot_revoke_current' };
  }

  const sessionRepo = getSessionRepository();

  const targetSession = await sessionRepo.findBySessionId(sessionIdToRevoke);
  if (!targetSession || targetSession.userId?.toHexString() !== session.userId) {
    return { success: false, error: 'not_found' };
  }

  await sessionRepo.revoke(sessionIdToRevoke);

  elog.info('Session revoked by user', {
    userId: session.userId,
    revokedSessionId: sessionIdToRevoke.substring(0, 8) + '...',
  });

  return { success: true };
}

/**
 * Result type for revoking all sessions.
 */
export type RevokeAllSessionsResult =
  | { success: true; count: number; cookie: string }
  | { success: false; error: 'unauthorized' };

/**
 * Revokes all sessions except the current one.
 */
export async function revokeAllSessionsHandler(
  request: Request,
  includeCurrentSession = false
): Promise<RevokeAllSessionsResult> {
  const currentSessionId = getSessionIdFromRequest(request);
  const session = await requireAccountSession(request);

  if (!session) {
    return { success: false, error: 'unauthorized' };
  }

  const sessionRepo = getSessionRepository();

  if (includeCurrentSession) {
    const count = await destroyAllSessions(session.userId);

    elog.info('All sessions revoked by user', {
      userId: session.userId,
      count,
    });

    return { success: true, count, cookie: buildLogoutCookie() };
  } else {
    const sessions = await sessionRepo.findByUserId(session.userId);
    let count = 0;

    for (const s of sessions) {
      if (s.sessionId !== currentSessionId) {
        await sessionRepo.revoke(s.sessionId);
        count++;
      }
    }

    elog.info('Other sessions revoked by user', {
      userId: session.userId,
      count,
    });

    return { success: true, count, cookie: '' };
  }
}

// ============================================================================
// MFA Verification Handlers (for login flow)
// ============================================================================

/**
 * Result type for MFA verification during login.
 */
export type VerifyMfaResult =
  | { success: true; cookie: string }
  | { success: false; error: 'invalid_token' | 'invalid_code' | 'expired' | 'rate_limited' };

/**
 * Get pending login data from MFA token
 */
async function getPendingLogin(mfaToken: string): Promise<MfaPendingLogin | null> {
  if (!isRedisConnected()) {
    return null;
  }

  const redis = getRedis();
  const data = await redis.get(`mfa:pending:${mfaToken}`);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as MfaPendingLogin;
  } catch {
    // Malformed data in Redis - log and treat as invalid token
    elog.warn('Failed to parse MFA pending login data', {
      mfaTokenPrefix: mfaToken.substring(0, 8),
    });
    // Clean up the corrupted entry
    await redis.del(`mfa:pending:${mfaToken}`);
    return null;
  }
}

/**
 * Clear pending login after successful MFA
 */
async function clearPendingLogin(mfaToken: string): Promise<void> {
  if (!isRedisConnected()) {
    return;
  }

  const redis = getRedis();
  await redis.del(`mfa:pending:${mfaToken}`);
}

/**
 * Verify MFA with TOTP code during login.
 */
export async function verifyMfaTotpHandler(
  mfaToken: string,
  code: string
): Promise<VerifyMfaResult> {
  const pendingLogin = await getPendingLogin(mfaToken);

  if (!pendingLogin) {
    return { success: false, error: 'invalid_token' };
  }

  // Verify TOTP code
  const result = await verifyTotpCode(pendingLogin.userId, code);

  if (!result.success) {
    return { success: false, error: 'invalid_code' };
  }

  // Clear pending login
  await clearPendingLogin(mfaToken);

  // Create session
  const { cookie } = await createAccountSession(
    new ObjectId(pendingLogin.userId),
    pendingLogin.identifier,
    pendingLogin.identifierType,
    {
      userAgent: pendingLogin.userAgent,
      ipAddress: pendingLogin.ipAddress,
    }
  );

  if (pendingLogin.ipAddress) {
    const userRepo = getUserRepository();
    const mfaUser = await userRepo.findById(pendingLogin.userId);
    if (mfaUser) {
      await refreshUserGeoIfStale(mfaUser, pendingLogin.ipAddress).catch((err) => {
        elog.warn('Geo refresh failed at MFA TOTP login', { error: err, userId: pendingLogin.userId });
      });
    }
  }

  elog.info('User authenticated with MFA (TOTP)', {
    userId: pendingLogin.userId,
  });

  return { success: true, cookie };
}

/**
 * Verify MFA with WebAuthn during login.
 */
export async function verifyMfaWebAuthnHandler(
  mfaToken: string,
  response: AuthenticationResponseJSON
): Promise<VerifyMfaResult> {
  const pendingLogin = await getPendingLogin(mfaToken);

  if (!pendingLogin) {
    return { success: false, error: 'invalid_token' };
  }

  // Verify WebAuthn response
  const result = await verifyWebAuthnAuthentication(pendingLogin.userId, response);

  if (!result.success) {
    return { success: false, error: 'invalid_code' };
  }

  // Clear pending login
  await clearPendingLogin(mfaToken);

  // Create session
  const { cookie } = await createAccountSession(
    new ObjectId(pendingLogin.userId),
    pendingLogin.identifier,
    pendingLogin.identifierType,
    {
      userAgent: pendingLogin.userAgent,
      ipAddress: pendingLogin.ipAddress,
    }
  );

  if (pendingLogin.ipAddress) {
    const userRepo = getUserRepository();
    const mfaUser = await userRepo.findById(pendingLogin.userId);
    if (mfaUser) {
      await refreshUserGeoIfStale(mfaUser, pendingLogin.ipAddress).catch((err) => {
        elog.warn('Geo refresh failed at MFA WebAuthn login', { error: err, userId: pendingLogin.userId });
      });
    }
  }

  elog.info('User authenticated with MFA (WebAuthn)', {
    userId: pendingLogin.userId,
  });

  return { success: true, cookie };
}
