/**
 * @fileoverview Console Email Provider
 *
 * A development-only email provider that logs emails to the console
 * instead of actually sending them. This allows testing email flows
 * without requiring SES credentials or other email service configuration.
 *
 * @module services/messaging/email/console
 *
 * @remarks
 * This provider is automatically used when:
 * - `EMAIL_PROVIDER` is set to 'console'
 * - `EMAIL_PROVIDER` is 'ses' but credentials are not configured (dev mode only)
 *
 * Emails are logged at two levels:
 * - `info`: Summary with recipient, subject, and message ID
 * - `debug`: Full content including text and HTML bodies
 *
 * @example
 * ```typescript
 * import { ConsoleEmailProvider } from './console.provider';
 *
 * const provider = new ConsoleEmailProvider();
 * await provider.send({
 *   to: 'user@example.com',
 *   subject: 'Test',
 *   text: 'Hello, World!',
 * });
 * // Logs: Email sent (console provider) { to: 'user@example.com', ... }
 * ```
 */

import type { IEmailProvider, EmailOptions, EmailResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * Console Email Provider
 *
 * Implements the IEmailProvider interface by logging emails to the console.
 * Used for development and testing when actual email delivery is not needed.
 *
 * @remarks
 * This provider always returns success, making it useful for testing
 * email-dependent flows without worrying about delivery failures.
 *
 * @example
 * ```typescript
 * const provider = new ConsoleEmailProvider();
 * const result = await provider.send({
 *   to: 'test@example.com',
 *   subject: 'OTP Code',
 *   text: 'Your code is: 123456',
 * });
 * // result.success is always true
 * // result.messageId is a generated console ID
 * ```
 */
export class ConsoleEmailProvider implements IEmailProvider {
  /** Provider name for identification */
  readonly name = 'console';

  /**
   * Logs an email to the console instead of sending it
   *
   * Generates a unique message ID and logs the email details.
   * Always returns success.
   *
   * @param options - Email options including recipient, subject, and body
   * @returns Promise resolving to successful result with generated message ID
   *
   * @example
   * ```typescript
   * const result = await provider.send({
   *   to: 'user@example.com',
   *   subject: 'Welcome',
   *   text: 'Hello!',
   * });
   * console.log(result.messageId); // e.g., 'console-1640000000000-abc123'
   * ```
   */
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
