/**
 * @fileoverview Email Provider Factory
 *
 * Provides a factory function for obtaining the configured email provider
 * and a convenience function for sending emails.
 *
 * @module services/messaging/email
 *
 * @remarks
 * The email provider is determined by the `EMAIL_PROVIDER` environment variable:
 * - `ses`: AWS Simple Email Service (production default)
 * - `console`: Logs emails to console (development fallback)
 *
 * In development mode, if SES credentials are not configured, the system
 * automatically falls back to the console provider with a warning.
 *
 * @example
 * ```typescript
 * import { sendEmail, getEmailProvider } from './email';
 *
 * // Simple usage
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Your OTP',
 *   text: 'Your code is: 123456',
 * });
 *
 * // Get provider for advanced usage
 * const provider = getEmailProvider();
 * console.log(`Email provider: ${provider.name}`);
 * ```
 */

import { config } from '../../../config';
import type { IEmailProvider } from '../types';
import { SesEmailProvider } from './ses.provider';
import { ConsoleEmailProvider } from './console.provider';
import elog from '../../../utils/adieuuLogger';

export { SesEmailProvider } from './ses.provider';
export { ConsoleEmailProvider } from './console.provider';

/**
 * Cached email provider instance
 * Initialized lazily on first access
 * @internal
 */
let emailProvider: IEmailProvider | null = null;

/**
 * Gets the configured email provider instance
 *
 * Uses lazy initialization and caches the provider for subsequent calls.
 * The provider is selected based on the `EMAIL_PROVIDER` configuration.
 *
 * @returns The configured email provider instance
 *
 * @throws Error if `EMAIL_PROVIDER` is set to an unknown value
 * @throws Error if `EMAIL_PROVIDER` is `ses` but credentials are not configured in production
 *
 * @example
 * ```typescript
 * const provider = getEmailProvider();
 * console.log(`Using provider: ${provider.name}`);
 *
 * // Send email directly through provider
 * const result = await provider.send({
 *   to: 'user@example.com',
 *   subject: 'Test',
 *   text: 'Hello!',
 * });
 * ```
 */
export function getEmailProvider(): IEmailProvider {
  if (emailProvider) return emailProvider;

  const providerName = config.email.provider;

  switch (providerName) {
    case 'ses': {
      const ses = new SesEmailProvider();
      if (ses.isConfigured()) {
        emailProvider = ses;
      } else if (config.env === 'production') {
        throw new Error('SES credentials required in production');
      } else {
        elog.warn('SES not configured, using console provider');
        emailProvider = new ConsoleEmailProvider();
      }
      break;
    }
    case 'console':
      emailProvider = new ConsoleEmailProvider();
      break;
    default:
      throw new Error(`Unknown email provider: ${providerName}`);
  }

  return emailProvider;
}

/**
 * Sends an email using the configured provider
 *
 * Convenience function that wraps `getEmailProvider().send()`.
 * Use this for simple email sending without needing direct provider access.
 *
 * @param options - Email options
 * @param options.to - Recipient email address
 * @param options.subject - Email subject line
 * @param options.text - Plain text body (required)
 * @param options.html - HTML body (optional)
 * @returns Promise resolving to the send result
 *
 * @example
 * ```typescript
 * const result = await sendEmail({
 *   to: 'user@example.com',
 *   subject: 'Your verification code',
 *   text: 'Your code is: 123456',
 *   html: '<p>Your code is: <strong>123456</strong></p>',
 * });
 *
 * if (result.success) {
 *   console.log(`Email sent: ${result.messageId}`);
 * } else {
 *   console.error(`Failed to send email: ${result.error}`);
 * }
 * ```
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const provider = getEmailProvider();
  return provider.send(options);
}
