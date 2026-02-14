/**
 * TextMagic SMS Provider
 * Sends SMS via TextMagic REST API
 */

import { config } from '../../../config';
import type { ISmsProvider, SmsOptions, SmsResult } from '../types';

const TEXTMAGIC_API_BASE = 'https://rest.textmagic.com/api/v2';

/**
 * TextMagic SMS Provider
 * 
 * Uses TextMagic REST API directly (no SDK dependency)
 * Requires TextMagic username and API key
 */
export class TextMagicSmsProvider implements ISmsProvider {
  readonly name = 'textmagic';

  private readonly username: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fromName: string;

  constructor() {
    this.username = config.sms.textmagicUsername;
    this.apiKey = config.sms.textmagicApiKey;
    this.fromName = config.sms.fromName;
  }

  /**
   * Check if provider is configured
   */
  isConfigured(): boolean {
    return !!(this.username && this.apiKey);
  }

  /**
   * Send an SMS via TextMagic
   */
  async send(options: SmsOptions): Promise<SmsResult> {
    if (!this.isConfigured()) {
      console.warn('TextMagic not configured - SMS not sent');
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
        console.error('TextMagic send failed:', errorBody);
        return {
          success: false,
          error: `TextMagic error: ${response.status} - ${JSON.stringify(errorBody)}`,
        };
      }

      const result = await response.json();

      return {
        success: true,
        messageId: result.id?.toString(),
      };
    } catch (error) {
      console.error('TextMagic send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

