import { describe, test, expect, beforeEach, mock } from 'bun:test';

import {
  generateAccountHash,
  createSignedToken,
  verifySignedToken,
} from './account-token.service';

describe('account-token service', () => {
  describe('generateAccountHash', () => {
    const accountId = '6651a1b2c3d4e5f6a7b8c9d0';
    const createdAt = new Date('2025-01-15T12:00:00Z');

    test('same inputs produce the same hash', () => {
      const hash1 = generateAccountHash(accountId, createdAt);
      const hash2 = generateAccountHash(accountId, createdAt);
      expect(hash1).toBe(hash2);
    });

    test('output is a 64-character lowercase hex string', () => {
      const hash = generateAccountHash(accountId, createdAt);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('different accountId produces a different hash', () => {
      const hash1 = generateAccountHash('aaa', createdAt);
      const hash2 = generateAccountHash('bbb', createdAt);
      expect(hash1).not.toBe(hash2);
    });

    test('different createdAt produces a different hash', () => {
      const hash1 = generateAccountHash(accountId, new Date('2025-01-01T00:00:00Z'));
      const hash2 = generateAccountHash(accountId, new Date('2025-06-01T00:00:00Z'));
      expect(hash1).not.toBe(hash2);
    });

    test('handles empty accountId', () => {
      const hash = generateAccountHash('', createdAt);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createSignedToken', () => {
    const accountHash = generateAccountHash('acc-1', new Date('2025-01-01T00:00:00Z'));

    test('returns a JWT with three dot-separated parts', () => {
      const token = createSignedToken(accountHash, 5);
      const parts = token.split('.');
      expect(parts.length).toBe(3);
      parts.forEach((part) => {
        expect(part.length).toBeGreaterThan(0);
      });
    });

    test('verifySignedToken can parse the result', () => {
      const token = createSignedToken(accountHash, 5);
      const payload = verifySignedToken(token);
      expect(payload).not.toBeNull();
    });

    test('payload contains the expected sub and maxIdentities', () => {
      const token = createSignedToken(accountHash, 3);
      const payload = verifySignedToken(token)!;
      expect(payload.sub).toBe(accountHash);
      expect(payload.maxIdentities).toBe(3);
    });

    test('payload iat and exp are numbers with exp ~15 min after iat', () => {
      const token = createSignedToken(accountHash, 1);
      const payload = verifySignedToken(token)!;
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect(payload.exp - payload.iat).toBe(15 * 60);
    });

    test('header declares HS256 algorithm', () => {
      const token = createSignedToken(accountHash, 1);
      const headerJson = Buffer.from(token.split('.')[0]!, 'base64url').toString('utf8');
      const header = JSON.parse(headerJson);
      expect(header.alg).toBe('HS256');
      expect(header.typ).toBe('JWT');
    });
  });

  describe('verifySignedToken', () => {
    const accountHash = generateAccountHash('acc-2', new Date('2025-02-01T00:00:00Z'));

    test('returns valid payload for a correctly signed token', () => {
      const token = createSignedToken(accountHash, 10);
      const payload = verifySignedToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(accountHash);
      expect(payload!.maxIdentities).toBe(10);
    });

    test('returns null for an empty string', () => {
      expect(verifySignedToken('')).toBeNull();
    });

    test('returns null for a string with wrong part count', () => {
      expect(verifySignedToken('one.two')).toBeNull();
      expect(verifySignedToken('one.two.three.four')).toBeNull();
    });

    test('returns null for non-base64url signature', () => {
      const token = createSignedToken(accountHash, 1);
      const parts = token.split('.');
      const bad = `${parts[0]}.${parts[1]}.!!!not-base64url!!!`;
      expect(verifySignedToken(bad)).toBeNull();
    });

    test('returns null when payload is tampered', () => {
      const token = createSignedToken(accountHash, 1);
      const [header, payload, signature] = token.split('.') as [string, string, string];

      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      decoded.maxIdentities = 999;
      const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

      expect(verifySignedToken(`${header}.${tampered}.${signature}`)).toBeNull();
    });

    test('returns null when signature is tampered', () => {
      const token = createSignedToken(accountHash, 1);
      const parts = token.split('.');

      const sigBytes = Buffer.from(parts[2]!, 'base64url');
      sigBytes[0] = sigBytes[0]! ^ 0xff;
      const tampered = sigBytes.toString('base64url');

      expect(verifySignedToken(`${parts[0]}.${parts[1]}.${tampered}`)).toBeNull();
    });

    test('returns null for an expired token', () => {
      const token = createSignedToken(accountHash, 1);

      const originalDateNow = Date.now;
      try {
        Date.now = () => originalDateNow() + 16 * 60 * 1000;
        expect(verifySignedToken(token)).toBeNull();
      } finally {
        Date.now = originalDateNow;
      }
    });

    test('returns valid payload when token is still within TTL', () => {
      const token = createSignedToken(accountHash, 1);

      const originalDateNow = Date.now;
      try {
        Date.now = () => originalDateNow() + 14 * 60 * 1000;
        expect(verifySignedToken(token)).not.toBeNull();
      } finally {
        Date.now = originalDateNow;
      }
    });
  });
});
