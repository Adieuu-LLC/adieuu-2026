/**
 * @fileoverview Service layer exports
 *
 * Aggregates and re-exports all service modules for the API.
 * Services encapsulate business logic and external integrations.
 *
 * @module services
 *
 * @example
 * ```typescript
 * import { createOtp, verifyOtp, checkRateLimit, sendEmail, sendSms } from './services';
 *
 * // OTP operations
 * const otp = await createOtp('user@example.com', 'email');
 * const result = await verifyOtp('user@example.com', '123456');
 *
 * // Rate limiting
 * const limit = await checkRateLimit('auth:request:ip', ipHash);
 *
 * // Messaging
 * await sendEmail({ to: 'user@example.com', subject: 'Hello', text: 'World' });
 * await sendSms({ to: '+1234567890', message: 'Your code is 123456' });
 * ```
 */

export * from './otp.service';
export * from './rate-limit.service';
export * from './session.service';
export * from './messaging';
export * from './identity.service';
export * from './dm-events.service';
