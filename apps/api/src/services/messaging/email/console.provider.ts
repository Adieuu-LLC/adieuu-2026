/**
 * Console Email Provider
 * Logs emails to console (for development/testing)
 */

import type { IEmailProvider, EmailOptions, EmailResult } from '../types';

/**
 * Console Email Provider
 * Logs emails to console instead of sending them
 * Useful for local development without SES credentials
 */
export class ConsoleEmailProvider implements IEmailProvider {
  readonly name = 'console';

  async send(options: EmailOptions): Promise<EmailResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    console.log('\n========== EMAIL (Console Provider) ==========');
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log('--- Text Body ---');
    console.log(options.text);
    if (options.html) {
      console.log('--- HTML Body ---');
      console.log(options.html);
    }
    console.log(`Message ID: ${messageId}`);
    console.log('===============================================\n');

    return {
      success: true,
      messageId,
    };
  }
}

