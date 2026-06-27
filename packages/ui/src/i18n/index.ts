import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';

// Export the translation type for type-safe translations
export type { TranslationKeys } from './locales';

// Re-export react-i18next hooks and components
export { useTranslation, Trans, I18nextProvider } from 'react-i18next';

/**
 * Initialize i18n with default configuration.
 * Apps should call this once at startup.
 */
export function initI18n(options?: {
  lng?: string;
  fallbackLng?: string;
  debug?: boolean;
}) {
  const {
    lng = 'en',
    fallbackLng = 'en',
    debug = false,
  } = options ?? {};

  return i18n
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en },
      },
      lng,
      fallbackLng,
      debug,
      interpolation: {
        escapeValue: false, // React already escapes values
      },
      // Nested key separator
      keySeparator: '.',
      // Namespace separator (we use single 'translation' namespace)
      nsSeparator: false,
    });
}

// Export i18n instance for advanced usage
export { i18n };

// Export available languages
export const availableLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
] as const;

export type LanguageCode = typeof availableLanguages[number]['code'];
