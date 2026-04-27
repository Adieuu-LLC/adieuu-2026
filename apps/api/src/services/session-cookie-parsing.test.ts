import { describe, expect, test } from 'bun:test';
import { parseSessionCookie } from './session.service';

// ---------------------------------------------------------------------------
// 7b. Cookie format and session parsing
// ---------------------------------------------------------------------------
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
