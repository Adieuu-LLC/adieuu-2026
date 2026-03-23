import { describe, expect, test } from 'bun:test';
import {
  corsOriginsNeedVaryHeader,
  originMatchesEntry,
  parseCorsOriginsList,
  resolveCorsAllowedOrigin,
} from './corsOrigins';

describe('parseCorsOriginsList', () => {
  test('splits comma-separated origins', () => {
    expect(parseCorsOriginsList('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  test('preserves wildcard singleton', () => {
    expect(parseCorsOriginsList('*')).toEqual(['*']);
  });
});

describe('originMatchesEntry', () => {
  test('exact match', () => {
    expect(originMatchesEntry('https://app.example.com', 'https://app.example.com')).toBe(true);
    expect(originMatchesEntry('https://evil.com', 'https://app.example.com')).toBe(false);
  });

  test('subdomain wildcard', () => {
    expect(originMatchesEntry('https://app.adieuu.com', 'https://*.adieuu.com')).toBe(true);
    expect(originMatchesEntry('https://staging.app.adieuu.com', 'https://*.adieuu.com')).toBe(true);
    expect(originMatchesEntry('https://adieuu.com', 'https://*.adieuu.com')).toBe(false);
  });
});

describe('resolveCorsAllowedOrigin', () => {
  test('echoes request origin when allowed', () => {
    expect(
      resolveCorsAllowedOrigin('https://app.com', ['https://app.com', 'https://other.com']),
    ).toBe('https://app.com');
  });

  test('matches wildcard pattern', () => {
    expect(resolveCorsAllowedOrigin('https://preview.adieuu.com', ['https://*.adieuu.com'])).toBe(
      'https://preview.adieuu.com',
    );
  });

  test('returns null when not allowed', () => {
    expect(resolveCorsAllowedOrigin('https://evil.com', ['https://app.com'])).toBe(null);
  });

  test('wildcard * allows any origin', () => {
    expect(resolveCorsAllowedOrigin('https://any.com', ['*'])).toBe('https://any.com');
  });
});

describe('corsOriginsNeedVaryHeader', () => {
  test('multiple entries', () => {
    expect(corsOriginsNeedVaryHeader(['https://a.com', 'https://b.com'])).toBe(true);
  });

  test('single exact origin only', () => {
    expect(corsOriginsNeedVaryHeader(['https://a.com'])).toBe(false);
  });

  test('pattern needs vary', () => {
    expect(corsOriginsNeedVaryHeader(['https://*.example.com'])).toBe(true);
  });
});
