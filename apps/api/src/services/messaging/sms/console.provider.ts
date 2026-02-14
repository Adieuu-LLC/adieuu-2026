/**
 * Console SMS Provider
 * Logs SMS to console (for development/testing)
 */

import type { ISmsProvider, SmsOptions, SmsResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * Console SMS Provider
 * Logs SMS to console instead of sending them
 * Useful for local development without TextMagic credentials
 */
export class ConsoleSmsProvider implements ISmsProvider {
  readonly name = 'console';

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
