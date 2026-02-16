/**
 * Users controller module.
 *
 * Contains the business logic for user-related endpoints, including
 * user retrieval, profile management, and contact verification.
 *
 * @module routes/users/controller
 */

import { ObjectId } from 'mongodb';
import { sanitizeString } from '../../utils/sanitize';
import { getUserRepository } from '../../repositories/user.repository';
import { toPublicUser, type PublicUser, type UserDocument } from '../../models/user';
import { generateAvatarData, type AvatarData } from '../../utils/avatar';
import { createOtp, verifyOtp } from '../../services/otp.service';
import { checkRateLimit } from '../../services/rate-limit.service';
import { sendEmail, sendSms } from '../../services/messaging';
import { getEmailTemplate, getSmsMessage, DEFAULT_LOCALE } from '../../i18n';
import { hashIdentifier, hashIp } from '../../utils/crypto';
import { addJitter } from '../../utils/timing';
import elog from '../../utils/adieuuLogger';

/** OTP expiration time in minutes */
const OTP_EXPIRES_IN_MINUTES = 10;

/** Application name for templates */
const APP_NAME = 'Chadder';

/**
 * Represents a user entity in the system.
 *
 * @interface User
 * @property id - Unique identifier (UUID v4)
 * @property email - User's email address (sanitized)
 * @property name - User's display name
 * @property createdAt - ISO 8601 timestamp of account creation
 * @property updatedAt - ISO 8601 timestamp of last profile update
 */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result type for user retrieval operations.
 */
export type GetUserResult =
  | { success: true; user: User }
  | { success: false; error: string };

/**
 * Retrieves a user by their unique identifier.
 *
 * @param id - The user's UUID
 * @returns A promise resolving to the user data or an error
 */
export async function getUserById(id: string): Promise<GetUserResult> {
  // TODO: Replace with actual database lookup
  const mockUser: User = {
    id,
    email: sanitizeString('user@example.com', 'email').value,
    name: 'Example User',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    success: true,
    user: mockUser,
  };
}

/**
 * Gets the current user's profile.
 *
 * @param userId - The user's MongoDB ObjectId
 * @returns The user's public profile or null if not found
 */
export async function getCurrentUserProfile(userId: string): Promise<PublicUser | null> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);

  if (!user) {
    return null;
  }

  // Generate avatar based on the user's primary identifier
  const primaryIdentifier = user.email || user.phone || user._id.toHexString();
  const avatarData = generateAvatarData(primaryIdentifier);

  return toPublicUser(user, avatarData);
}

/**
 * Result type for requesting contact verification.
 *
 * Note: We intentionally don't check if the email/phone belongs to another user here.
 * This prevents account enumeration attacks. The check happens AFTER OTP verification
 * to ensure the user owns the email/phone before revealing any account information.
 */
export type RequestContactVerificationResult =
  | { success: true }
  | { success: false; error: 'rate_limited' | 'already_verified' | 'invalid_format' };

/**
 * Requests email verification for a user.
 *
 * Note: We intentionally don't check if the email belongs to another user here.
 * This prevents account enumeration attacks. The check happens AFTER OTP verification
 * to ensure the user owns the email before revealing any account information.
 *
 * @param userId - The user's MongoDB ObjectId
 * @param email - The email address to verify
 * @param clientIp - The client's IP address for rate limiting
 * @returns Result of the verification request
 */
export async function requestEmailVerification(
  userId: string,
  email: string,
  clientIp: string
): Promise<RequestContactVerificationResult> {
  // Sanitize and validate
  const sanitizedEmail = sanitizeString(email, 'email');
  const sanitizedIp = sanitizeString(clientIp, 'ip');
  const emailHash = hashIdentifier(sanitizedEmail.value);
  const ipHash = hashIp(sanitizedIp.value);

  // Check rate limits
  const ipLimit = await checkRateLimit('user:email:ip', ipHash);
  if (!ipLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited' };
  }

  const emailLimit = await checkRateLimit('user:email:identifier', emailHash);
  if (!emailLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited' };
  }

  // Get current user - only check if this exact email is already verified for THIS user
  const userRepo = getUserRepository();
  const currentUser = await userRepo.findById(userId);
  if (currentUser?.email === sanitizedEmail.value && currentUser.emailVerified) {
    return { success: false, error: 'already_verified' };
  }

  // Generate OTP
  const otp = await createOtp(sanitizedEmail.value, 'email');

  if (otp) {
    // Send verification email using account-add template (different from login OTP)
    sendAccountAddEmail(sanitizedEmail.value, otp).catch((err) => {
      elog.error('Failed to send verification email', { error: err, emailHash });
    });
  }

  await addJitter();
  return { success: true };
}

/**
 * Sends an account-add verification email with OTP.
 * Uses a different template than login OTP to inform the user
 * someone is trying to add this email to their account.
 */
async function sendAccountAddEmail(email: string, otp: string): Promise<void> {
  const template = getEmailTemplate('otpAccountAdd', DEFAULT_LOCALE, {
    appName: APP_NAME,
    otp,
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
 * Result type for verifying contact.
 *
 * Note: The 'already_owned' error is returned AFTER OTP verification succeeds.
 * This is intentional: we only reveal that an email/phone belongs to another account
 * after the user proves they own it (via OTP). This prevents enumeration attacks.
 */
export type VerifyContactResult =
  | { success: true; user: PublicUser }
  | { success: false; error: 'invalid' | 'expired' | 'max_attempts' | 'backoff' | 'already_owned'; retryAfterSeconds?: number };

/**
 * Verifies an email address with OTP.
 *
 * The ownership check (whether the email belongs to another account) happens
 * AFTER OTP verification. This is intentional for security: we only reveal
 * account information after the user proves they own the email.
 *
 * @param userId - The user's MongoDB ObjectId
 * @param email - The email address to verify
 * @param code - The OTP code
 * @returns Result of the verification
 */
export async function verifyEmailAddress(
  userId: string,
  email: string,
  code: string
): Promise<VerifyContactResult> {
  const sanitizedEmail = sanitizeString(email, 'email');

  // Verify the OTP first - user must prove ownership before we reveal any info
  const result = await verifyOtp(sanitizedEmail.value, code);

  if (!result.valid) {
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

  // OTP verified - user has proven ownership of this email
  // NOW we can safely check if it belongs to another account
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByEmail(sanitizedEmail.value);
  if (existingUser && existingUser._id.toHexString() !== userId) {
    elog.info('Email already owned by another account', {
      userId,
      emailHash: hashIdentifier(sanitizedEmail.value),
    });
    return { success: false, error: 'already_owned' };
  }

  // Update user email
  const updatedUser = await userRepo.updateById(userId, {
    email: sanitizedEmail.value,
    emailVerified: true,
  });

  if (!updatedUser) {
    return { success: false, error: 'invalid' };
  }

  elog.info('Email verified for user', {
    userId,
    emailHash: hashIdentifier(sanitizedEmail.value),
  });

  const primaryIdentifier = updatedUser.email || updatedUser.phone || updatedUser._id.toHexString();
  const avatarData = generateAvatarData(primaryIdentifier);

  return { success: true, user: toPublicUser(updatedUser, avatarData) };
}

/**
 * Requests phone verification for a user.
 *
 * Note: We intentionally don't check if the phone belongs to another user here.
 * This prevents account enumeration attacks. The check happens AFTER OTP verification
 * to ensure the user owns the phone before revealing any account information.
 *
 * @param userId - The user's MongoDB ObjectId
 * @param phone - The phone number to verify
 * @param clientIp - The client's IP address for rate limiting
 * @returns Result of the verification request
 */
export async function requestPhoneVerification(
  userId: string,
  phone: string,
  clientIp: string
): Promise<RequestContactVerificationResult> {
  // Sanitize and validate
  const sanitizedPhone = sanitizeString(phone, 'phone');
  const sanitizedIp = sanitizeString(clientIp, 'ip');
  const phoneHash = hashIdentifier(sanitizedPhone.value);
  const ipHash = hashIp(sanitizedIp.value);

  // Check rate limits
  const ipLimit = await checkRateLimit('user:phone:ip', ipHash);
  if (!ipLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited' };
  }

  const phoneLimit = await checkRateLimit('user:phone:identifier', phoneHash);
  if (!phoneLimit.allowed) {
    await addJitter();
    return { success: false, error: 'rate_limited' };
  }

  // Get current user - only check if this exact phone is already verified for THIS user
  const userRepo = getUserRepository();
  const currentUser = await userRepo.findById(userId);
  if (currentUser?.phone === sanitizedPhone.value && currentUser.phoneVerified) {
    return { success: false, error: 'already_verified' };
  }

  // Generate OTP
  const otp = await createOtp(sanitizedPhone.value, 'sms');

  if (otp) {
    // Send verification SMS using account-add template (different from login OTP)
    sendAccountAddSms(sanitizedPhone.value, otp).catch((err) => {
      elog.error('Failed to send verification SMS', { error: err, phoneHash });
    });
  }

  await addJitter();
  return { success: true };
}

/**
 * Sends an account-add verification SMS with OTP.
 * Uses a different template than login OTP to inform the user
 * someone is trying to add this phone to their account.
 */
async function sendAccountAddSms(phone: string, otp: string): Promise<void> {
  const message = getSmsMessage('otpAccountAdd', DEFAULT_LOCALE, {
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
 * Verifies a phone number with OTP.
 *
 * The ownership check (whether the phone belongs to another account) happens
 * AFTER OTP verification. This is intentional for security: we only reveal
 * account information after the user proves they own the phone.
 *
 * @param userId - The user's MongoDB ObjectId
 * @param phone - The phone number to verify
 * @param code - The OTP code
 * @returns Result of the verification
 */
export async function verifyPhoneNumber(
  userId: string,
  phone: string,
  code: string
): Promise<VerifyContactResult> {
  const sanitizedPhone = sanitizeString(phone, 'phone');

  // Verify the OTP first - user must prove ownership before we reveal any info
  const result = await verifyOtp(sanitizedPhone.value, code);

  if (!result.valid) {
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

  // OTP verified - user has proven ownership of this phone
  // NOW we can safely check if it belongs to another account
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByPhone(sanitizedPhone.value);
  if (existingUser && existingUser._id.toHexString() !== userId) {
    elog.info('Phone already owned by another account', {
      userId,
      phoneHash: hashIdentifier(sanitizedPhone.value),
    });
    return { success: false, error: 'already_owned' };
  }

  // Update user phone
  const updatedUser = await userRepo.updateById(userId, {
    phone: sanitizedPhone.value,
    phoneVerified: true,
  });

  if (!updatedUser) {
    return { success: false, error: 'invalid' };
  }

  elog.info('Phone verified for user', {
    userId,
    phoneHash: hashIdentifier(sanitizedPhone.value),
  });

  const primaryIdentifier = updatedUser.email || updatedUser.phone || updatedUser._id.toHexString();
  const avatarData = generateAvatarData(primaryIdentifier);

  return { success: true, user: toPublicUser(updatedUser, avatarData) };
}
