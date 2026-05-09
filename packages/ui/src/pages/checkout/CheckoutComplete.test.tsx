import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
// Importing the shared mock guarantees it is registered even if Bun's preload
// ordering means another test file is processed first.
import {
  resetReactRouterDomMock,
  setMockSearchParams,
} from '../../test/react-router-dom-mock';

mock.module('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { devLink?: string }) => {
      if (key === 'account.checkout.complete.devHint' && opts?.devLink) {
        return `dev ${opts.devLink}`;
      }
      return key;
    },
  }),
}));

mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: '', chatWsUrl: '', externalLinkBase: '', platform: 'web' }),
}));

const { CheckoutComplete } = await import('./CheckoutComplete');

describe('CheckoutComplete', () => {
  beforeEach(() => {
    resetReactRouterDomMock();
  });

  test('renders success copy when status=success', () => {
    setMockSearchParams('status=success');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleSuccess');
    expect(html).toContain('adieuu://open/account/subscription');
    expect(html).toContain('adieuu-dev://open/account/subscription');
  });

  test('renders cancelled copy when status=cancelled', () => {
    setMockSearchParams('status=cancelled');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleCancelled');
  });

  test('renders unknown copy when status missing', () => {
    setMockSearchParams('');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleUnknown');
  });
});
