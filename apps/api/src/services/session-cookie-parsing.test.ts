import { describe, expect, test } from 'bun:test';
import { parseSessionCookie, getSessionIdFromRequest, getGrantKeyFromRequest } from './session.service';

// ---------------------------------------------------------------------------
// 7b. Cookie format and session parsing
// ---------------------------------------------------------------------------

function makeRequest(cookieValue: string): Request {
  return new Request('http://localhost/api/test', {
    headers: { Cookie: `adieuu_session=${cookieValue}` },
  });
}

describe('getRawSessionCookie base64 padding preservation', () => {
  test('preserves single = padding in grant key', () => {
    const req = makeRequest('sess123.SGVsbG8gV29ybGQ=');
    expect(getSessionIdFromRequest(req)).toBe('sess123');
    expect(getGrantKeyFromRequest(req)).toBe('SGVsbG8gV29ybGQ=');
  });

  test('preserves double == padding in grant key', () => {
    const req = makeRequest('sess123.SGVsbG8=');
    expect(getSessionIdFromRequest(req)).toBe('sess123');
    expect(getGrantKeyFromRequest(req)).toBe('SGVsbG8=');
  });

  test('handles unpadded base64 grant key', () => {
    const req = makeRequest('sess123.SGVsbG8gV29ybGQh');
    expect(getSessionIdFromRequest(req)).toBe('sess123');
    expect(getGrantKeyFromRequest(req)).toBe('SGVsbG8gV29ybGQh');
  });

  test('handles session-only cookie (no grant key)', () => {
    const req = makeRequest('sess123');
    expect(getSessionIdFromRequest(req)).toBe('sess123');
    expect(getGrantKeyFromRequest(req)).toBeNull();
  });
});

describe('parseSessionCookie', () => {
  test('sessionId.base64Key splits correctly', () => {
    const result = parseSessionCookie('abc123.dGhpc2lzYWtleQ==');
    expect(result.sessionId).toBe('abc123');
    expect(result.grantKey).toBe('dGhpc2lzYWtleQ==');
  });

  test('no dot delimiter falls back gracefully (no key)', () => {
    const result = parseSessionCookie('abc123noDot');
    expect(result.sessionId).toBe('abc123noDot');
    expect(result.grantKey).toBeNull();
  });

  test('multiple dots: only split on first', () => {
    const result = parseSessionCookie('session.key.with.dots');
    expect(result.sessionId).toBe('session');
    expect(result.grantKey).toBe('key.with.dots');
  });

  test('empty key portion after dot returns null grantKey', () => {
    const result = parseSessionCookie('session.');
    expect(result.sessionId).toBe('session');
    expect(result.grantKey).toBeNull();
  });

  test('dot at the beginning: empty sessionId', () => {
    const result = parseSessionCookie('.somekey');
    expect(result.sessionId).toBe('');
    expect(result.grantKey).toBe('somekey');
  });
});
