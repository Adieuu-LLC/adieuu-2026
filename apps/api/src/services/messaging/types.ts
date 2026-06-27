/**
 * @fileoverview Messaging Provider Type Definitions
 *
 * Defines interfaces for email and SMS providers, enabling
 * provider abstraction and hot-swapping between services.
 *
 * @module services/messaging/types
 *
 * @remarks
 * All providers implement a common interface, allowing the application
 * to switch between providers (e.g., SES, SendGrid, TextMagic) without
 * changing the calling code. This is particularly useful for:
 * - Testing (use console providers)
 * - Cost optimization (switch providers based on region/volume)
 * - Reliability (fallback to alternative providers)
 *
 * @example
 * ```typescript
 * import type { IEmailProvider, EmailOptions } from './types';
 *
 * class CustomEmailProvider implements IEmailProvider {
 *   readonly name = 'custom';
 *   async send(options: EmailOptions) {
 *     // Custom implementation
 *     return { success: true, messageId: 'abc123' };
 *   }
 * }
 * ```
 */

/**
 * Options for sending an email
 *
 * @example
 * ```typescript
 * const options: EmailOptions = {
 *   to: 'user@example.com',
 *   subject: 'Your verification code',
 *   text: 'Your code is: 123456',
 *   html: '<p>Your code is: <strong>123456</strong></p>',
 * };
 * ```
 */
export interface EmailOptions {
  /**
   * Recipient email address
   * Should be a valid, sanitized email address
   */
  to: string;

  /**
   * Email subject line
   * Keep concise for best deliverability
   */
  subject: string;

  /**
   * Plain text body content
   * Always required as fallback for clients that don't support HTML
   */
  text: string;

  /**
   * Optional HTML body content
   * If provided, will be displayed by HTML-capable email clients
   */
  html?: string;
}

/**
 * Result returned from an email send operation
 *
 * @example
 * ```typescript
 * const result = await provider.send(options);
 * if (result.success) {
 *   console.log(`Email sent: ${result.messageId}`);
 * } else {
 *   console.error(`Email failed: ${result.error}`);
 * }
 * ```
 */
export interface EmailResult {
  /**
   * Whether the email was accepted for delivery
   * Note: This doesn't guarantee delivery, only that the provider accepted it
   */
  success: boolean;

  /**
   * Provider-assigned message ID for tracking
   * Can be used for delivery status tracking (if supported by provider)
   */
  messageId?: string;

  /**
   * Error message if sending failed
   * Should be logged but not exposed directly to users
   */
  error?: string;
}

/**
 * Interface that all email providers must implement
 *
 * @remarks
 * Providers are responsible for:
 * - Validating their own configuration
 * - Handling rate limits and retries internally
 * - Logging errors appropriately
 * - Returning consistent result structures
 *
 * @example
 * ```typescript
 * class SesEmailProvider implements IEmailProvider {
 *   readonly name = 'ses';
 *   async send(options: EmailOptions): Promise<EmailResult> {
 *     // AWS SES implementation
 *   }
 * }
 * ```
 */
export interface IEmailProvider {
  /**
   * Human-readable provider name for logging and debugging
   */
  readonly name: string;

  /**
   * Sends an email using this provider
   *
   * @param options - Email options including recipient, subject, and body
   * @returns Promise resolving to send result
   */
  send(options: EmailOptions): Promise<EmailResult>;
}

/**
 * Options for sending an SMS message
 *
 * @example
 * ```typescript
 * const options: SmsOptions = {
 *   to: '+12025551234',
 *   message: 'Your verification code is: 123456',
 * };
 * ```
 */
export interface SmsOptions {
  /**
   * Recipient phone number in E.164 format
   * Must include country code with + prefix (e.g., +12025551234)
   */
  to: string;

  /**
   * SMS message content
   * Keep under 160 characters to avoid multi-part messages
   */
  message: string;
}

/**
 * Result returned from an SMS send operation
 *
 * @example
 * ```typescript
 * const result = await provider.send(options);
 * if (result.success) {
 *   console.log(`SMS sent: ${result.messageId}`);
 * } else {
 *   console.error(`SMS failed: ${result.error}`);
 * }
 * ```
 */
export interface SmsResult {
  /**
   * Whether the SMS was accepted for delivery
   * Note: This doesn't guarantee delivery, only that the provider accepted it
   */
  success: boolean;

  /**
   * Provider-assigned message ID for tracking
   * Can be used for delivery status callbacks
   */
  messageId?: string;

  /**
   * Error message if sending failed
   * Should be logged but not exposed directly to users
   */
  error?: string;
}

/**
 * Interface that all SMS providers must implement
 *
 * @remarks
 * Providers are responsible for:
 * - Validating phone number format
 * - Handling rate limits and retries internally
 * - Logging errors appropriately
 * - Returning consistent result structures
 *
 * @example
 * ```typescript
 * class TextMagicSmsProvider implements ISmsProvider {
 *   readonly name = 'textmagic';
 *   async send(options: SmsOptions): Promise<SmsResult> {
 *     // TextMagic implementation
 *   }
 * }
 * ```
 */
export interface ISmsProvider {
  /**
   * Human-readable provider name for logging and debugging
   */
  readonly name: string;

  /**
   * Sends an SMS using this provider
   *
   * @param options - SMS options including recipient and message
   * @returns Promise resolving to send result
   */
  send(options: SmsOptions): Promise<SmsResult>;
}
