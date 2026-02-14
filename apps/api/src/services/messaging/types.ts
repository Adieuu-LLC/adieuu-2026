/**
 * Messaging provider types
 */

/** Email send options */
export interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Email send result */
export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** Email provider interface */
export interface IEmailProvider {
  readonly name: string;
  send(options: EmailOptions): Promise<EmailResult>;
}

/** SMS send options */
export interface SmsOptions {
  to: string;      // E.164 format (+1234567890)
  message: string;
}

/** SMS send result */
export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/** SMS provider interface */
export interface ISmsProvider {
  readonly name: string;
  send(options: SmsOptions): Promise<SmsResult>;
}

