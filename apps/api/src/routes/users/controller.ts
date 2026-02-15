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
 */
export type RequestContactVerificationResult =
  | { success: true }
  | { success: false; error: 'rate_limited' | 'already_verified' | 'already_exists' | 'invalid_format' };

/**
 * Requests email verification for a user.
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

  // Check if email already exists for another user
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByEmail(sanitizedEmail.value);
  if (existingUser && existingUser._id.toHexString() !== userId) {
    await addJitter();
    return { success: false, error: 'already_exists' };
  }

  // Get current user
  const currentUser = await userRepo.findById(userId);
  if (currentUser?.email === sanitizedEmail.value && currentUser.emailVerified) {
    return { success: false, error: 'already_verified' };
  }

  // Generate OTP
  const otp = await createOtp(sanitizedEmail.value, 'email');

  if (otp) {
    // Send verification email
    sendVerificationEmail(sanitizedEmail.value, otp).catch((err) => {
      elog.error('Failed to send verification email', { error: err, emailHash });
    });
  }

  await addJitter();
  return { success: true };
}

/**
 * Sends a verification email with OTP.
 */
async function sendVerificationEmail(email: string, otp: string): Promise<void> {
  const template = getEmailTemplate('otp', DEFAULT_LOCALE, {
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
 */
export type VerifyContactResult =
  | { success: true; user: PublicUser }
  | { success: false; error: 'invalid' | 'expired' | 'max_attempts' | 'backoff'; retryAfterSeconds?: number };

/**
 * Verifies an email address with OTP.
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

  // Verify the OTP
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

  // Update user email
  const userRepo = getUserRepository();
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

  // Check if phone already exists for another user
  const userRepo = getUserRepository();
  const existingUser = await userRepo.findByPhone(sanitizedPhone.value);
  if (existingUser && existingUser._id.toHexString() !== userId) {
    await addJitter();
    return { success: false, error: 'already_exists' };
  }

  // Get current user
  const currentUser = await userRepo.findById(userId);
  if (currentUser?.phone === sanitizedPhone.value && currentUser.phoneVerified) {
    return { success: false, error: 'already_verified' };
  }

  // Generate OTP
  const otp = await createOtp(sanitizedPhone.value, 'sms');

  if (otp) {
    // Send verification SMS
    sendVerificationSms(sanitizedPhone.value, otp).catch((err) => {
      elog.error('Failed to send verification SMS', { error: err, phoneHash });
    });
  }

  await addJitter();
  return { success: true };
}

/**
 * Sends a verification SMS with OTP.
 */
async function sendVerificationSms(phone: string, otp: string): Promise<void> {
  const message = getSmsMessage('otp', DEFAULT_LOCALE, {
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

  // Verify the OTP
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

  // Update user phone
  const userRepo = getUserRepository();
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
