/**
 * Age-verification controller unit tests — sanitization and webhook HMAC.
 */

import { afterAll, describe, expect, test, mock } from 'bun:test';
import { createHmac } from 'crypto';

mock.module('../../config', () => ({
  config: {
    apiBaseUrl: 'https://api.example.com',
    webAppUrl: 'http://localhost:3000',
    verifymy: {
      apiKey: 'key',
      apiSecret: 'secret',
    },
  },
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

import {
  parseSanitizedProviderVerificationId,
  sanitizeCallbackPageStatus,
  sanitizeCallbackErrorMessage,
  verifyWebhookSignature,
  callbackHtml,
  PROVIDER_VERIFICATION_ID_MAX_LENGTH,
} from './controller';

afterAll(() => {
  mock.restore();
});

describe('parseSanitizedProviderVerificationId', () => {
  test('accepts slug-like provider ids', () => {
    expect(parseSanitizedProviderVerificationId('vid-abc-123')).toBe('vid-abc-123');
  });

  test('returns null when absent or empty after sanitize', () => {
    expect(parseSanitizedProviderVerificationId(null)).toBe(null);
    expect(parseSanitizedProviderVerificationId('')).toBe(null);
    expect(parseSanitizedProviderVerificationId('   ')).toBe(null);
  });

  test('rejects oversized ids', () => {
    const id = `${'a'.repeat(PROVIDER_VERIFICATION_ID_MAX_LENGTH)}x`;
    expect(parseSanitizedProviderVerificationId(id)).toBe(null);
  });
});

describe('sanitizeCallbackPageStatus', () => {
  test('whitelists known statuses', () => {
    expect(sanitizeCallbackPageStatus('approved')).toBe('approved');
    expect(sanitizeCallbackPageStatus('pending')).toBe('pending');
  });

  test('maps unknown values to error', () => {
    expect(sanitizeCallbackPageStatus('<script>')).toBe('error');
    expect(sanitizeCallbackPageStatus('evil-status')).toBe('error');
  });
});

describe('sanitizeCallbackErrorMessage', () => {
  test('truncates long messages', () => {
    const long = `${'x'.repeat(600)}\u0000tail`;
    const out = sanitizeCallbackErrorMessage(long);
    expect(out).toBeDefined();
    expect(out!.length).toBeLessThanOrEqual(512);
    expect(out).not.toContain('\u0000');
  });
});

describe('callbackHtml', () => {
  test('does not embed raw unknown status in postMessage payload', () => {
    const html = callbackHtml('not-a-real-status\x00', 'oops');
    expect(html).toContain('"status":"error"');
    expect(html).not.toContain('not-a-real-status');
  });
});

describe('verifyWebhookSignature', () => {
  test('accepts valid hmac hex digest', () => {
    const rawBody = '{"verification_id":"v1"}';
    const digest = createHmac('sha256', 'secret').update(rawBody).digest('hex');
    const auth = `hmac key:${digest}`;
    expect(verifyWebhookSignature(rawBody, auth)).toBe(true);
  });

  test('rejects wrong secret', () => {
    const rawBody = '{}';
    const digest = createHmac('sha256', 'wrong-secret').update(rawBody).digest('hex');
    const auth = `hmac key:${digest}`;
    expect(verifyWebhookSignature(rawBody, auth)).toBe(false);
  });

  test('rejects non-hex or wrong-length digest', () => {
    const rawBody = '{}';
    expect(verifyWebhookSignature(rawBody, 'hmac key:ZZZZ')).toBe(false);
    expect(verifyWebhookSignature(rawBody, `hmac key:${'a'.repeat(63)}`)).toBe(false);
  });

  test('rejects malformed authorization header', () => {
    expect(verifyWebhookSignature('{}', 'Bearer token')).toBe(false);
  });
});
