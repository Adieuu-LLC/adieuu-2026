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
 *
 * @remarks
 * **Anti-enumeration design:**
 * The following keys intentionally share identical messages to prevent
 * attackers from distinguishing between different failure states:
 * - `invalidOtp`, `otpExpired`, `tooManyAttempts` - All return generic verification failure
 *
 * For OTP/code verification, use `verificationFailed` as the canonical key.
 * The specific keys exist for internal logging differentiation only.
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
  // Verification errors - intentionally identical messages for anti-enumeration
  | 'verificationFailed' // Canonical key for all OTP verification failures
  | 'invalidOtp'         // Alias - same message as verificationFailed
  | 'otpExpired'         // Alias - same message as verificationFailed
  | 'tooManyAttempts'    // Alias - same message as verificationFailed
  // Account-level errors (for notifications, not API responses)
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
