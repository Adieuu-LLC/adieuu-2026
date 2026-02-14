/**
 * Console Email Provider
 * Logs emails to console (for development/testing)
 */

import type { IEmailProvider, EmailOptions, EmailResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * Console Email Provider
 * Logs emails to console instead of sending them
 * Useful for local development without SES credentials
 */
export class ConsoleEmailProvider implements IEmailProvider {
  readonly name = 'console';

  async send(options: EmailOptions): Promise<EmailResult> {
    const messageId = `console-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    elog.info('Email sent (console provider)', {
      to: options.to,
      subject: options.subject,
      textLength: options.text.length,
      hasHtml: !!options.html,
      messageId,
    });

    // Also log full content at debug level for development inspection
    elog.debug('Email content (console provider)', {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      messageId,
    });

    return {
      success: true,
      messageId,
    };
  }
}
