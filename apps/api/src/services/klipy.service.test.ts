import { describe, expect, test } from 'bun:test';
import { sanitiseKlipyUrl, deriveKlipyCustomerId } from './klipy.service';

describe('sanitiseKlipyUrl', () => {
  test('passes valid static.klipy.com URLs', () => {
    const url = 'https://static.klipy.com/ii/abc123/hd.webp';
    expect(sanitiseKlipyUrl(url)).toBe(url);
  });

  test('strips query parameters', () => {
    expect(sanitiseKlipyUrl('https://static.klipy.com/ii/abc?tracking=1&ref=x'))
      .toBe('https://static.klipy.com/ii/abc');
  });

  test('strips fragment', () => {
    expect(sanitiseKlipyUrl('https://static.klipy.com/ii/abc#frag'))
      .toBe('https://static.klipy.com/ii/abc');
  });

  test('rejects non-klipy hostnames', () => {
    expect(sanitiseKlipyUrl('https://evil.com/ii/abc')).toBeUndefined();
    expect(sanitiseKlipyUrl('https://cdn.giphy.com/path')).toBeUndefined();
  });

  test('rejects http protocol', () => {
    expect(sanitiseKlipyUrl('http://static.klipy.com/ii/abc')).toBeUndefined();
  });

  test('rejects undefined and empty', () => {
    expect(sanitiseKlipyUrl(undefined)).toBeUndefined();
    expect(sanitiseKlipyUrl('')).toBeUndefined();
  });

  test('rejects malformed URLs', () => {
    expect(sanitiseKlipyUrl('not-a-url')).toBeUndefined();
  });
});

describe('deriveKlipyCustomerId', () => {
  test('returns a hex string', () => {
    const id = deriveKlipyCustomerId('abc123');
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  test('is deterministic', () => {
    const a = deriveKlipyCustomerId('test-identity');
    const b = deriveKlipyCustomerId('test-identity');
    expect(a).toBe(b);
  });

  test('produces different hashes for different identities', () => {
    const a = deriveKlipyCustomerId('identity-a');
    const b = deriveKlipyCustomerId('identity-b');
    expect(a).not.toBe(b);
  });
});
