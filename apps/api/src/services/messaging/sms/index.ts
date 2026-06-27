/**
 * @fileoverview SMS Provider Factory
 *
 * Provides a factory function for obtaining the configured SMS provider
 * and a convenience function for sending SMS messages.
 *
 * @module services/messaging/sms
 *
 * @remarks
 * The SMS provider is determined by the `SMS_PROVIDER` environment variable:
 * - `textmagic`: TextMagic SMS API (production default)
 * - `console`: Logs SMS to console (development fallback)
 *
 * In development mode, if TextMagic credentials are not configured, the system
 * automatically falls back to the console provider with a warning.
 *
 * @example
 * ```typescript
 * import { sendSms, getSmsProvider } from './sms';
 *
 * // Simple usage
 * const result = await sendSms({
 *   to: '+12025551234',
 *   message: 'Your code is: 123456',
 * });
 *
 * // Get provider for advanced usage
 * const provider = getSmsProvider();
 * console.log(`SMS provider: ${provider.name}`);
 * ```
 */

import { config } from '../../../config';
import type { ISmsProvider } from '../types';
import { TextMagicSmsProvider } from './textmagic.provider';
import { ConsoleSmsProvider } from './console.provider';
import elog from '../../../utils/adieuuLogger';

export { TextMagicSmsProvider } from './textmagic.provider';
export { ConsoleSmsProvider } from './console.provider';

/**
 * Cached SMS provider instance
 * Initialized lazily on first access
 * @internal
 */
let smsProvider: ISmsProvider | null = null;

/**
 * Gets the configured SMS provider instance
 *
 * Uses lazy initialization and caches the provider for subsequent calls.
 * The provider is selected based on the `SMS_PROVIDER` configuration.
 *
 * @returns The configured SMS provider instance
 *
 * @throws Error if `SMS_PROVIDER` is set to an unknown value
 * @throws Error if `SMS_PROVIDER` is `textmagic` but credentials are not configured in production
 *
 * @example
 * ```typescript
 * const provider = getSmsProvider();
 * console.log(`Using provider: ${provider.name}`);
 *
 * // Send SMS directly through provider
 * const result = await provider.send({
 *   to: '+12025551234',
 *   message: 'Hello!',
 * });
 * ```
 */
export function getSmsProvider(): ISmsProvider {
  if (smsProvider) return smsProvider;

  const providerName = config.sms.provider;

  switch (providerName) {
    case 'textmagic': {
      const textmagic = new TextMagicSmsProvider();
      if (textmagic.isConfigured()) {
        smsProvider = textmagic;
      } else if (config.env === 'production') {
        throw new Error('TextMagic credentials required in production');
      } else {
        elog.warn('TextMagic not configured, using console provider');
        smsProvider = new ConsoleSmsProvider();
      }
      break;
    }
    case 'console':
      smsProvider = new ConsoleSmsProvider();
      break;
    default:
      throw new Error(`Unknown SMS provider: ${providerName}`);
  }

  return smsProvider;
}

/**
 * Sends an SMS using the configured provider
 *
 * Convenience function that wraps `getSmsProvider().send()`.
 * Use this for simple SMS sending without needing direct provider access.
 *
 * @param options - SMS options
 * @param options.to - Recipient phone number in E.164 format (e.g., +12025551234)
 * @param options.message - SMS message content (keep under 160 chars to avoid multi-part)
 * @returns Promise resolving to the send result
 *
 * @example
 * ```typescript
 * const result = await sendSms({
 *   to: '+12025551234',
 *   message: 'Your verification code is: 123456',
 * });
 *
 * if (result.success) {
 *   console.log(`SMS sent: ${result.messageId}`);
 * } else {
 *   console.error(`Failed to send SMS: ${result.error}`);
 * }
 * ```
 */
export async function sendSms(options: {
  to: string;
  message: string;
}) {
  const provider = getSmsProvider();
  return provider.send(options);
}
