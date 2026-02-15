import { describe, expect, test } from 'bun:test';

import {
  interpolate,
  getErrorMessage,
  getEmailTemplate,
  getSmsMessage,
  isLocaleSupported,
  getSupportedLocales,
  parseAcceptLanguage,
  DEFAULT_LOCALE,
} from './index';

describe('i18n', () => {
  describe('interpolate', () => {
    test('replaces single variable', () => {
      const result = interpolate('Hello {{name}}!', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    test('replaces multiple variables', () => {
      const result = interpolate('{{greeting}}, {{name}}!', {
        greeting: 'Hello',
        name: 'World',
      });
      expect(result).toBe('Hello, World!');
    });

    test('handles numeric values', () => {
      const result = interpolate('Expires in {{minutes}} minutes', { minutes: 10 });
      expect(result).toBe('Expires in 10 minutes');
    });

    test('leaves unmatched placeholders unchanged', () => {
      const result = interpolate('Hello {{name}}!', {});
      expect(result).toBe('Hello {{name}}!');
    });

    test('handles empty variables object', () => {
      const result = interpolate('No variables here');
      expect(result).toBe('No variables here');
    });

    test('handles empty string', () => {
      const result = interpolate('', { name: 'World' });
      expect(result).toBe('');
    });
  });

  describe('getErrorMessage', () => {
    test('returns error message for valid key', () => {
      const message = getErrorMessage('verificationFailed');
      expect(message).toBe('Unable to verify. Please check your code or request a new one.');
    });

    test('returns default locale message when locale not implemented', () => {
      const message = getErrorMessage('verificationFailed', 'es');
      // Falls back to English since Spanish isn't implemented yet
      expect(message).toBe('Unable to verify. Please check your code or request a new one.');
    });

    test('verification error keys return identical messages (anti-enumeration)', () => {
      const expected = 'Unable to verify. Please check your code or request a new one.';
      expect(getErrorMessage('verificationFailed')).toBe(expected);
      expect(getErrorMessage('invalidOtp')).toBe(expected);
      expect(getErrorMessage('otpExpired')).toBe(expected);
      expect(getErrorMessage('tooManyAttempts')).toBe(expected);
    });

    test('returns message for all error keys', () => {
      const keys = [
        'badRequest',
        'unauthorized',
        'forbidden',
        'notFound',
        'methodNotAllowed',
        'rateLimited',
        'internal',
        'validationFailed',
        'invalidEmail',
        'invalidPhone',
        'verificationFailed',
        'invalidOtp',
        'otpExpired',
        'tooManyAttempts',
        'accountLocked',
        'sessionExpired',
        'payloadTooLarge',
      ] as const;

      for (const key of keys) {
        const message = getErrorMessage(key);
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getEmailTemplate', () => {
    test('returns email template with subject, text, and html', () => {
      const template = getEmailTemplate('otp', 'en', {
        appName: 'TestApp',
        otp: '123456',
        expiresInMinutes: 10,
      });

      expect(template.subject).toBe('Your TestApp login code is 123456');
      expect(template.text).toContain('123456');
      expect(template.text).toContain('10 minutes');
      expect(template.html).toBeDefined();
      expect(template.html).toContain('123456');
    });

    test('interpolates magic link in otpWithMagicLink template', () => {
      const template = getEmailTemplate('otpWithMagicLink', 'en', {
        appName: 'TestApp',
        otp: '654321',
        magicLink: 'https://example.com/verify',
        expiresInMinutes: 5,
      });

      expect(template.subject).toContain('TestApp');
      expect(template.text).toContain('654321');
      expect(template.text).toContain('https://example.com/verify');
      expect(template.html).toContain('https://example.com/verify');
    });

    test('returns all email template keys', () => {
      const keys = [
        'otp',
        'otpWithMagicLink',
        'accountLocked',
        'failedLoginAttempts',
        'welcome',
        'passwordChanged',
      ] as const;

      for (const key of keys) {
        const template = getEmailTemplate(key, 'en', { appName: 'Test' });
        expect(template.subject).toBeDefined();
        expect(template.text).toBeDefined();
      }
    });
  });

  describe('getSmsMessage', () => {
    test('returns SMS message with variables', () => {
      const message = getSmsMessage('otp', 'en', {
        appName: 'TestApp',
        otp: '123456',
        expiresInMinutes: 10,
      });

      expect(message).toBe('TestApp code: 123456. Expires in 10 min.');
    });

    test('returns all SMS template keys', () => {
      const keys = ['otp', 'accountLocked', 'failedLoginAttempts'] as const;

      for (const key of keys) {
        const message = getSmsMessage(key, 'en', {
          appName: 'Test',
          otp: '123456',
          expiresInMinutes: 10,
          lockoutMinutes: 30,
          attemptCount: 5,
        });
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('isLocaleSupported', () => {
    test('returns true for supported locales', () => {
      expect(isLocaleSupported('en')).toBe(true);
      expect(isLocaleSupported('es')).toBe(true);
      expect(isLocaleSupported('fr')).toBe(true);
    });

    test('returns false for unsupported locales', () => {
      expect(isLocaleSupported('xx')).toBe(false);
      expect(isLocaleSupported('invalid')).toBe(false);
    });
  });

  describe('getSupportedLocales', () => {
    test('returns array of supported locales', () => {
      const locales = getSupportedLocales();
      expect(Array.isArray(locales)).toBe(true);
      expect(locales).toContain('en');
    });

    test('includes default locale', () => {
      const locales = getSupportedLocales();
      expect(locales).toContain(DEFAULT_LOCALE);
    });
  });

  describe('parseAcceptLanguage', () => {
    test('returns default locale for null', () => {
      const locale = parseAcceptLanguage(null);
      expect(locale).toBe(DEFAULT_LOCALE);
    });

    test('returns default locale for empty string', () => {
      const locale = parseAcceptLanguage('');
      expect(locale).toBe(DEFAULT_LOCALE);
    });

    test('parses simple language code', () => {
      const locale = parseAcceptLanguage('en');
      expect(locale).toBe('en');
    });

    test('parses language with region', () => {
      const locale = parseAcceptLanguage('en-US');
      expect(locale).toBe('en');
    });

    test('parses language with quality values', () => {
      const locale = parseAcceptLanguage('fr;q=0.9,en;q=1.0');
      expect(locale).toBe('en'); // en has higher quality
    });

    test('handles complex Accept-Language header', () => {
      const locale = parseAcceptLanguage('en-US,en;q=0.9,es;q=0.8');
      expect(locale).toBe('en');
    });

    test('falls back to default for unsupported locales', () => {
      const locale = parseAcceptLanguage('xx-XX');
      expect(locale).toBe(DEFAULT_LOCALE);
    });

    test('selects first supported locale from list', () => {
      const locale = parseAcceptLanguage('xx,yy,en;q=0.5');
      expect(locale).toBe('en');
    });
  });

  describe('DEFAULT_LOCALE', () => {
    test('is English', () => {
      expect(DEFAULT_LOCALE).toBe('en');
    });
  });
});
