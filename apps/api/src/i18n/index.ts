/**
 * Internationalization (i18n) module.
 *
 * Provides localized strings for emails, SMS messages, and error responses.
 * Supports template variable interpolation with {{variable}} syntax.
 *
 * @module i18n
 *
 * @example
 * ```typescript
 * import { t, getEmailTemplate, getSmsMessage } from './i18n';
 *
 * // Get localized error message
 * const errorMsg = t('errors.invalidOtp', 'en');
 *
 * // Get email template with variables
 * const email = getEmailTemplate('otpWithMagicLink', 'en', {
 *   appName: 'Adieuu',
 *   otp: '123456',
 *   magicLink: 'https://...',
 *   expiresInMinutes: 10,
 * });
 *
 * // Get SMS message with variables
 * const sms = getSmsMessage('otp', 'en', {
 *   appName: 'Adieuu',
 *   otp: '123456',
 *   expiresInMinutes: 10,
 * });
 * ```
 */

import type {
  Locale,
  LocaleTranslations,
  TemplateVariables,
  EmailTemplate,
  EmailTemplateKey,
  SmsTemplateKey,
  ErrorKey,
} from './types';
import { DEFAULT_LOCALE } from './types';
import { en } from './locales';

/**
 * Loaded locale translations.
 * Add new locales here as they are implemented.
 */
const locales: Record<Locale, LocaleTranslations> = {
  en,
  // Placeholder entries for future locales - fall back to English
  es: en,
  fr: en,
  de: en,
  pt: en,
  ja: en,
  zh: en,
};

/**
 * Interpolates template variables into a string.
 *
 * Replaces {{variableName}} placeholders with corresponding values
 * from the variables object.
 *
 * @param template - The template string with {{variable}} placeholders
 * @param variables - Key-value pairs to interpolate
 * @returns The interpolated string
 *
 * @example
 * ```typescript
 * interpolate('Hello {{name}}!', { name: 'World' });
 * // Returns: 'Hello World!'
 * ```
 */
export function interpolate(template: string, variables: TemplateVariables = {}): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Gets a locale's translations, falling back to default locale if not found.
 *
 * @param locale - The locale code
 * @returns The locale translations
 */
function getLocaleTranslations(locale: Locale): LocaleTranslations {
  return locales[locale] ?? locales[DEFAULT_LOCALE];
}

/**
 * Gets a localized error message.
 *
 * @param key - The error message key
 * @param locale - The locale code (default: 'en')
 * @param variables - Optional template variables
 * @returns The localized error message
 *
 * @example
 * ```typescript
 * const msg = getErrorMessage('invalidOtp', 'en');
 * // Returns: 'Invalid code. Please check and try again.'
 * ```
 */
export function getErrorMessage(
  key: ErrorKey,
  locale: Locale = DEFAULT_LOCALE,
  variables?: TemplateVariables
): string {
  const translations = getLocaleTranslations(locale);
  const message = translations.errors[key] ?? locales[DEFAULT_LOCALE].errors[key];
  return variables ? interpolate(message, variables) : message;
}

/**
 * Gets a localized email template with variables interpolated.
 *
 * @param key - The email template key
 * @param locale - The locale code (default: 'en')
 * @param variables - Template variables to interpolate
 * @returns The email template with subject, text, and optional HTML
 *
 * @example
 * ```typescript
 * const email = getEmailTemplate('otpWithMagicLink', 'en', {
 *   appName: 'Adieuu',
 *   otp: '123456',
 *   magicLink: 'https://app.adieuu.im/auth/verify?t=...',
 *   expiresInMinutes: 10,
 * });
 * // Returns: { subject: 'Your Adieuu login code', text: '...', html: '...' }
 * ```
 */
export function getEmailTemplate(
  key: EmailTemplateKey,
  locale: Locale = DEFAULT_LOCALE,
  variables: TemplateVariables = {}
): EmailTemplate {
  const translations = getLocaleTranslations(locale);
  const template = translations.emails[key] ?? locales[DEFAULT_LOCALE].emails[key];

  return {
    subject: interpolate(template.subject, variables),
    text: interpolate(template.text, variables),
    html: template.html ? interpolate(template.html, variables) : undefined,
  };
}

/**
 * Gets a localized SMS message with variables interpolated.
 *
 * @param key - The SMS template key
 * @param locale - The locale code (default: 'en')
 * @param variables - Template variables to interpolate
 * @returns The SMS message string
 *
 * @example
 * ```typescript
 * const sms = getSmsMessage('otp', 'en', {
 *   appName: 'Adieuu',
 *   otp: '123456',
 *   expiresInMinutes: 10,
 * });
 * // Returns: 'Adieuu code: 123456. Expires in 10 min.'
 * ```
 */
export function getSmsMessage(
  key: SmsTemplateKey,
  locale: Locale = DEFAULT_LOCALE,
  variables: TemplateVariables = {}
): string {
  const translations = getLocaleTranslations(locale);
  const template = translations.sms[key] ?? locales[DEFAULT_LOCALE].sms[key];
  return interpolate(template, variables);
}

/**
 * Checks if a locale is supported.
 *
 * @param locale - The locale code to check
 * @returns True if the locale is supported
 */
export function isLocaleSupported(locale: string): locale is Locale {
  return locale in locales;
}

/**
 * Gets the list of supported locales.
 *
 * @returns Array of supported locale codes
 */
export function getSupportedLocales(): Locale[] {
  return Object.keys(locales) as Locale[];
}

/**
 * Parses the Accept-Language header to get the preferred locale.
 *
 * @param acceptLanguage - The Accept-Language header value
 * @returns The best matching locale, or default locale if none match
 *
 * @example
 * ```typescript
 * parseAcceptLanguage('en-US,en;q=0.9,es;q=0.8');
 * // Returns: 'en'
 *
 * parseAcceptLanguage('zh-CN,zh;q=0.9');
 * // Returns: 'zh'
 * ```
 */
export function parseAcceptLanguage(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }

  // Parse Accept-Language header: "en-US,en;q=0.9,es;q=0.8"
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, qValue] = lang.trim().split(';q=');
      return {
        code: code?.split('-')[0]?.toLowerCase() ?? '',
        q: qValue ? parseFloat(qValue) : 1,
      };
    })
    .sort((a, b) => b.q - a.q);

  for (const { code } of languages) {
    if (isLocaleSupported(code)) {
      return code;
    }
  }

  return DEFAULT_LOCALE;
}

// Re-export types
export type {
  Locale,
  LocaleTranslations,
  TemplateVariables,
  EmailTemplate,
  EmailTemplateKey,
  SmsTemplateKey,
  ErrorKey,
} from './types';
export { DEFAULT_LOCALE } from './types';
