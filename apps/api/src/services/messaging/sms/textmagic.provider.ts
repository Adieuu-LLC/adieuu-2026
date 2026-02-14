/**
 * @fileoverview TextMagic SMS Provider
 *
 * Sends SMS messages via the TextMagic REST API.
 * TextMagic is a business SMS service with global coverage.
 *
 * @module services/messaging/sms/textmagic
 *
 * @remarks
 * This implementation uses the native `fetch` API to call the TextMagic
 * REST API directly, avoiding any SDK dependencies.
 *
 * Required environment variables:
 * - `TEXTMAGIC_USERNAME`: TextMagic account username
 * - `TEXTMAGIC_API_KEY`: TextMagic API key (from account settings)
 * - `SMS_FROM_NAME`: Sender name/number (must be approved by TextMagic)
 *
 * @see https://www.textmagic.com/docs/api/
 *
 * @example
 * ```typescript
 * import { TextMagicSmsProvider } from './textmagic.provider';
 *
 * const provider = new TextMagicSmsProvider();
 *
 * if (provider.isConfigured()) {
 *   const result = await provider.send({
 *     to: '+12025551234',
 *     message: 'Your code is: 123456',
 *   });
 * }
 * ```
 */

import { config } from '../../../config';
import type { ISmsProvider, SmsOptions, SmsResult } from '../types';
import elog from '../../../utils/adieuuLogger';

/**
 * TextMagic REST API base URL
 * @internal
 */
const TEXTMAGIC_API_BASE = 'https://rest.textmagic.com/api/v2';

/**
 * TextMagic SMS Provider
 *
 * Implements the ISmsProvider interface for sending SMS via TextMagic.
 * Uses direct API calls with username/API key authentication.
 *
 * @remarks
 * TextMagic features:
 * - Global SMS coverage
 * - Delivery receipts (via webhooks)
 * - Two-way messaging support
 * - High deliverability rates
 *
 * @example
 * ```typescript
 * const textmagic = new TextMagicSmsProvider();
 *
 * if (!textmagic.isConfigured()) {
 *   throw new Error('TextMagic not configured');
 * }
 *
 * const result = await textmagic.send({
 *   to: '+12025551234',
 *   message: 'Your verification code is: 123456',
 * });
 *
 * if (result.success) {
 *   console.log(`SMS sent with ID: ${result.messageId}`);
 * }
 * ```
 */
export class TextMagicSmsProvider implements ISmsProvider {
  /** Provider name for identification */
  readonly name = 'textmagic';

  /** TextMagic account username */
  private readonly username: string | undefined;

  /** TextMagic API key */
  private readonly apiKey: string | undefined;

  /** Sender name or number (must be approved by TextMagic) */
  private readonly fromName: string;

  /**
   * Creates a new TextMagic SMS provider instance
   *
   * Reads configuration from environment variables via the config module.
   */
  constructor() {
    this.username = config.sms.textmagicUsername;
    this.apiKey = config.sms.textmagicApiKey;
    this.fromName = config.sms.fromName;
  }

  /**
   * Checks if the provider has required credentials configured
   *
   * @returns True if both username and API key are set
   *
   * @example
   * ```typescript
   * const textmagic = new TextMagicSmsProvider();
   * if (!textmagic.isConfigured()) {
   *   console.warn('TextMagic credentials not configured');
   * }
   * ```
   */
  isConfigured(): boolean {
    return !!(this.username && this.apiKey);
  }

  /**
   * Sends an SMS via TextMagic API
   *
   * Constructs and sends a POST request to the TextMagic messages endpoint.
   *
   * @param options - SMS options including recipient and message
   * @returns Promise resolving to send result with success status and message ID
   *
   * @remarks
   * Phone numbers should be in E.164 format (+12025551234).
   * The leading '+' is stripped automatically as TextMagic expects numbers without it.
   *
   * @example
   * ```typescript
   * const result = await textmagic.send({
   *   to: '+12025551234',
   *   message: 'Hello from our app!',
   * });
   * ```
   */
  async send(options: SmsOptions): Promise<SmsResult> {
    if (!this.isConfigured()) {
      elog.warn('TextMagic not configured - SMS not sent');
      return {
        success: false,
        error: 'TextMagic credentials not configured',
      };
    }

    try {
      // Build request
      const response = await fetch(`${TEXTMAGIC_API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-TM-Username': this.username!,
          'X-TM-Key': this.apiKey!,
        },
        body: new URLSearchParams({
          phones: options.to.replace(/^\+/, ''), // TextMagic expects number without +
          text: options.message,
          from: this.fromName,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        elog.error('TextMagic send failed', { status: response.status, error: errorBody });
        return {
          success: false,
          error: `TextMagic error: ${response.status} - ${JSON.stringify(errorBody)}`,
        };
      }

      const result = await response.json() as { id?: number };

      return {
        success: true,
        messageId: result.id?.toString(),
      };
    } catch (error) {
      elog.error('TextMagic send error', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
