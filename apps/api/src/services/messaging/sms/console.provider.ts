/**
 * Console SMS Provider
 * Logs SMS to console (for development/testing)
 */

import type { ISmsProvider, SmsOptions, SmsResult } from '../types';

/**
 * Console SMS Provider
 * Logs SMS to console instead of sending them
 * Useful for local development without TextMagic credentials
 */
export class ConsoleSmsProvider implements ISmsProvider {
  readonly name = 'console';

  async send(options: SmsOptions): Promise<SmsResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    console.log('\n========== SMS (Console Provider) ==========');
    console.log(`To: ${options.to}`);
    console.log(`Message: ${options.message}`);
    console.log(`Message ID: ${messageId}`);
    console.log('=============================================\n');

    return {
      success: true,
      messageId,
    };
  }
}

