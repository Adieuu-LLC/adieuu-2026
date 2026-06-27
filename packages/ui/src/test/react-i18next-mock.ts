/**
 * Comprehensive react-i18next mock shared by all UI test files.
 *
 * Bun runs every test file in a single process, so partial
 * mock.module('react-i18next', ...) calls leave later imports of
 * `@adieuu/ui/i18n` (which re-exports I18nextProvider) without the
 * exports they need — e.g. useAuth → ComplianceModals → ../i18n.
 *
 * This module registers one mock with every export any test or source
 * file might need. Tests customize translation via setMockTranslate().
 */
import { mock } from 'bun:test';
import type { ReactNode } from 'react';
import { createElement } from 'react';

export type MockTranslateFn = (
  key: string,
  defaultValueOrOpts?: string | Record<string, unknown>,
) => string;

let _translate: MockTranslateFn = (key, defaultValueOrOpts) =>
  typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : key;

/** Replace the `t` function returned by useTranslation(). */
export function setMockTranslate(fn: MockTranslateFn): void {
  _translate = fn;
}

/** Reset translation mock state (call from beforeEach). */
export function resetReactI18nextMock(): void {
  _translate = (key, defaultValueOrOpts) =>
    typeof defaultValueOrOpts === 'string' ? defaultValueOrOpts : key;
}

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: _translate,
    i18n: { language: 'en' },
  }),
  Trans: ({ children }: { children?: ReactNode }) => children ?? null,
  I18nextProvider: ({ children }: { children?: ReactNode }) =>
    createElement('div', { 'data-testid': 'i18next-provider' }, children),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));
