import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

let searchParams = new URLSearchParams();

mock.module('react-router-dom', () => ({
  useSearchParams: () => [searchParams],
}));

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

const { CheckoutComplete } = await import('./CheckoutComplete');

describe('CheckoutComplete', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
  });

  test('renders success copy when status=success', () => {
    searchParams.delete('status');
    searchParams.set('status', 'success');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleSuccess');
    expect(html).toContain('adieuu://open/account/subscription');
    expect(html).toContain('adieuu-dev://open/account/subscription');
  });

  test('renders cancelled copy when status=cancelled', () => {
    searchParams.delete('status');
    searchParams.set('status', 'cancelled');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleCancelled');
  });

  test('renders unknown copy when status missing', () => {
    searchParams.delete('status');
    const html = renderToStaticMarkup(<CheckoutComplete />);
    expect(html).toContain('account.checkout.complete.titleUnknown');
  });
});
