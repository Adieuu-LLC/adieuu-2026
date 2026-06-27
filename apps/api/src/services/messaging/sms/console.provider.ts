/**
 * @fileoverview Console SMS Provider
 *
 * A development-only SMS provider that logs messages to the console
 * instead of actually sending them. This allows testing SMS flows
 * without requiring TextMagic credentials or incurring SMS costs.
 *
 * @module services/messaging/sms/console
 *
 * @remarks
 * This provider is automatically used when:
 * - `SMS_PROVIDER` is set to 'console'
 * - `SMS_PROVIDER` is 'textmagic' but credentials are not configured (dev mode only)
 *
 * Messages are logged at two levels:
 * - `info`: Summary with recipient and message ID
 * - `debug`: Full content including message body
 *
 * @example
 * ```typescript
 * import { ConsoleSmsProvider } from './console.provider';
 *
 * const provider = new ConsoleSmsProvider();
 * await provider.send({
 *   to: '+12025551234',
 *   message: 'Your code is: 123456',
 * });
 * // Logs: SMS sent (console provider) { to: '+12025551234', ... }
 * ```
 */

import type { ISmsProvider, SmsOptions, SmsResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * Console SMS Provider
 *
 * Implements the ISmsProvider interface by logging SMS to the console.
 * Used for development and testing when actual SMS delivery is not needed.
 *
 * @remarks
 * This provider always returns success, making it useful for testing
 * SMS-dependent flows without worrying about delivery failures or costs.
 *
 * @example
 * ```typescript
 * const provider = new ConsoleSmsProvider();
 * const result = await provider.send({
 *   to: '+12025551234',
 *   message: 'Your code is: 123456',
 * });
 * // result.success is always true
 * // result.messageId is a generated console ID
 * ```
 */
export class ConsoleSmsProvider implements ISmsProvider {
  /** Provider name for identification */
  readonly name = 'console';

  /**
   * Logs an SMS to the console instead of sending it
   *
   * Generates a unique message ID and logs the SMS details.
   * Always returns success.
   *
   * @param options - SMS options including recipient and message
   * @returns Promise resolving to successful result with generated message ID
   *
   * @example
   * ```typescript
   * const result = await provider.send({
   *   to: '+12025551234',
   *   message: 'Hello!',
   * });
   * console.log(result.messageId); // e.g., 'console-1640000000000-abc123'
   * ```
   */
  async send(options: SmsOptions): Promise<SmsResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    elog.info('SMS sent (console provider)', {
      to: options.to,
      messageLength: options.message.length,
      messageId,
    });

    // Also log full content at debug level for development inspection
    elog.debug('SMS content (console provider)', {
      to: options.to,
      message: options.message,
      messageId,
    });

    return {
      success: true,
      messageId,
    };
  }
}
