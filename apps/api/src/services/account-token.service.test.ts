import { describe, expect, test, mock, afterAll } from 'bun:test';

mock.module('../config', () => ({
  config: {
    security: {
      accountHashSecret: 'test-account-hash-secret',
      tokenSigningKey: 'test-token-signing-key',
    },
  },
}));

import {
  generateAccountHash,
  createSignedToken,
  verifySignedToken,
} from './account-token.service';

afterAll(() => {
  mock.restore();
});

describe('generateAccountHash', () => {
  test('produces a deterministic 64-char hex string', () => {
    const hash = generateAccountHash('user123', new Date('2024-01-01T00:00:00Z'));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(generateAccountHash('user123', new Date('2024-01-01T00:00:00Z'))).toBe(hash);
  });

  test('different inputs yield different hashes', () => {
    const a = generateAccountHash('user1', new Date('2024-01-01T00:00:00Z'));
    const b = generateAccountHash('user2', new Date('2024-01-01T00:00:00Z'));
    expect(a).not.toBe(b);
  });
});

describe('createSignedToken / verifySignedToken', () => {
  test('round-trips a token with subscriptions and entitlements', () => {
    const token = createSignedToken('hash', 2, 60, ['vanguard'], []);
    const payload = verifySignedToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe('hash');
    expect(payload!.maxIdentities).toBe(2);
    expect(payload!.maxVideoDurationSeconds).toBe(60);
    expect(payload!.subscriptions).toEqual(['vanguard']);
    expect(payload!.entitlements).toEqual([]);
  });

  test('defaults subscriptions and entitlements for legacy tokens (missing arrays)', () => {
    const token = createSignedToken('hash', 2, 60);
    const payload = verifySignedToken(token);
    expect(payload).not.toBeNull();
    expect(payload!.subscriptions).toEqual([]);
    expect(payload!.entitlements).toEqual([]);
  });

  test('rejects expired tokens', () => {
    const origDateNow = Date.now;
    const past = Date.now() - 20 * 60 * 1000;
    Date.now = () => past;
    const token = createSignedToken('hash', 2, 60, [], []);
    Date.now = origDateNow;
    const payload = verifySignedToken(token);
    expect(payload).toBeNull();
  });

  test('rejects tampered tokens', () => {
    const token = createSignedToken('hash', 2, 60, [], []);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifySignedToken(tampered)).toBeNull();
  });

  test('rejects malformed tokens', () => {
    expect(verifySignedToken('')).toBeNull();
    expect(verifySignedToken('a.b')).toBeNull();
    expect(verifySignedToken('not-a-jwt')).toBeNull();
  });
});
