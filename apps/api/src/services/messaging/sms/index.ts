/**
 * SMS provider factory and exports
 */

import { config } from '../../../config';
import type { ISmsProvider } from '../types';
import { TextMagicSmsProvider } from './textmagic.provider';
import { ConsoleSmsProvider } from './console.provider';
import elog from '../../../utils/adieuuLogger';

export { TextMagicSmsProvider } from './textmagic.provider';
export { ConsoleSmsProvider } from './console.provider';

let smsProvider: ISmsProvider | null = null;

/**
 * Get the configured SMS provider
 * Falls back to console provider in development if TextMagic not configured
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
 * Send an SMS using the configured provider
 */
export async function sendSms(options: {
  to: string;
  message: string;
}) {
  const provider = getSmsProvider();
  return provider.send(options);
}
