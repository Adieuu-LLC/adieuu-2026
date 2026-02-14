/**
 * Internationalization type definitions.
 *
 * @module i18n/types
 */

/**
 * Supported locale codes.
 * Add new locales here as they are implemented.
 */
export type Locale = 'en' | 'es' | 'fr' | 'de' | 'pt' | 'ja' | 'zh';

/**
 * Default locale used when no locale is specified or detected.
 */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Template variable values that can be interpolated.
 */
export type TemplateVariables = Record<string, string | number>;

/**
 * Email template with subject, text body, and optional HTML body.
 */
export interface EmailTemplate {
  subject: string;
  text: string;
  html?: string;
}

/**
 * All email template keys.
 */
export type EmailTemplateKey =
  | 'otp'
  | 'otpWithMagicLink'
  | 'accountLocked'
  | 'failedLoginAttempts'
  | 'welcome'
  | 'passwordChanged';

/**
 * All SMS template keys.
 */
export type SmsTemplateKey =
  | 'otp'
  | 'accountLocked'
  | 'failedLoginAttempts';

/**
 * All error message keys.
 */
export type ErrorKey =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'methodNotAllowed'
  | 'rateLimited'
  | 'internal'
  | 'validationFailed'
  | 'invalidEmail'
  | 'invalidPhone'
  | 'invalidOtp'
  | 'otpExpired'
  | 'tooManyAttempts'
  | 'accountLocked'
  | 'sessionExpired'
  | 'payloadTooLarge';

/**
 * Structure of a locale translation file.
 */
export interface LocaleTranslations {
  /**
   * Locale code for this translation set.
   */
  locale: Locale;

  /**
   * Human-readable locale name.
   */
  name: string;

  /**
   * Email templates.
   */
  emails: Record<EmailTemplateKey, EmailTemplate>;

  /**
   * SMS message templates.
   */
  sms: Record<SmsTemplateKey, string>;

  /**
   * User-facing error messages.
   */
  errors: Record<ErrorKey, string>;
}
