/**
 * @fileoverview Messaging Service Exports
 *
 * Aggregates and re-exports all messaging-related modules including
 * types, email providers, and SMS providers.
 *
 * @module services/messaging
 *
 * @example
 * ```typescript
 * import { sendEmail, sendSms, getEmailProvider, getSmsProvider } from './messaging';
 *
 * // Send email using configured provider
 * await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Welcome',
 *   text: 'Welcome to our app!',
 * });
 *
 * // Send SMS using configured provider
 * await sendSms({
 *   to: '+12025551234',
 *   message: 'Your code is: 123456',
 * });
 *
 * // Get provider instance for advanced usage
 * const emailProvider = getEmailProvider();
 * console.log(`Using email provider: ${emailProvider.name}`);
 * ```
 */

export * from './types';
export { getEmailProvider, sendEmail } from './email';
export { getSmsProvider, sendSms } from './sms';
