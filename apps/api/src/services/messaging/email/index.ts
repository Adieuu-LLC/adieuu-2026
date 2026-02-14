/**
 * Email provider factory and exports
 */

import { config } from '../../../config';
import type { IEmailProvider } from '../types';
import { SesEmailProvider } from './ses.provider';
import { ConsoleEmailProvider } from './console.provider';
import elog from '../../../utils/adieuuLogger';

export { SesEmailProvider } from './ses.provider';
export { ConsoleEmailProvider } from './console.provider';

let emailProvider: IEmailProvider | null = null;

/**
 * Get the configured email provider
 * Falls back to console provider in development if SES not configured
 */
export function getEmailProvider(): IEmailProvider {
  if (emailProvider) return emailProvider;

  const providerName = config.email.provider;

  switch (providerName) {
    case 'ses': {
      const ses = new SesEmailProvider();
      if (ses.isConfigured()) {
        emailProvider = ses;
      } else if (config.env === 'production') {
        throw new Error('SES credentials required in production');
      } else {
        elog.warn('SES not configured, using console provider');
        emailProvider = new ConsoleEmailProvider();
      }
      break;
    }
    case 'console':
      emailProvider = new ConsoleEmailProvider();
      break;
    default:
      throw new Error(`Unknown email provider: ${providerName}`);
  }

  return emailProvider;
}

/**
 * Send an email using the configured provider
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const provider = getEmailProvider();
  return provider.send(options);
}
