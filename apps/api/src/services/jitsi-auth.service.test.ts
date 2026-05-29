/**
 * @module services/jitsi-auth.service.test
 */

import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { JitsiJwtPayload } from './jitsi-auth.service';

const mockConfig = {
  jitsi: {
    enabled: true,
    baseUrl: 'https://jitsi.example.com',
    jwtIssuer: 'adieuu-test',
    jwtSecret: 'test-jitsi-secret-key',
    jwtExpirationSec: 300,
  },
};

mock.module('../config', () => ({
  config: mockConfig,
}));

import { mintJitsiToken, generateJitsiRoomName } from './jitsi-auth.service';

function decodeJwtPayload(token: string): JitsiJwtPayload {
  const payloadB64 = token.split('.')[1];
  if (!payloadB64) {
    throw new Error('Invalid JWT: missing payload segment');
  }
  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JitsiJwtPayload;
}

afterAll(() => {
  mock.restore();
});

describe('generateJitsiRoomName', () => {
  test('returns a 32-character base64url string', () => {
    const room = generateJitsiRoomName();
    expect(room).toHaveLength(32);
    expect(room).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('generates unique room names', () => {
    const a = generateJitsiRoomName();
    const b = generateJitsiRoomName();
    expect(a).not.toBe(b);
  });
});

describe('mintJitsiToken', () => {
  beforeEach(() => {
    mockConfig.jitsi.enabled = true;
  });

  test('throws when Jitsi integration is disabled', () => {
    mockConfig.jitsi.enabled = false;
    expect(() =>
      mintJitsiToken({
        roomName: 'room-abc',
        identityId: '64a1b2c3d4e5f60718293a4b',
        displayName: 'alice',
      }),
    ).toThrow('Jitsi integration is not enabled');
  });

  test('returns a three-part HS256 JWT', () => {
    const token = mintJitsiToken({
      roomName: 'room-abc',
      identityId: '64a1b2c3d4e5f60718293a4b',
      displayName: 'alice',
    });
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const headerB64 = parts[0];
    if (!headerB64) {
      throw new Error('Invalid JWT: missing header segment');
    }
    expect(JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'))).toEqual({
      alg: 'HS256',
      typ: 'JWT',
    });
  });

  test('embeds room, identity, and Jitsi domain in payload', () => {
    const token = mintJitsiToken({
      roomName: 'room-abc',
      identityId: '64a1b2c3d4e5f60718293a4b',
      displayName: 'alice',
      avatarUrl: 'https://cdn.example/avatar.png',
    });
    const payload = decodeJwtPayload(token);

    expect(payload.aud).toBe('jitsi');
    expect(payload.iss).toBe('adieuu-test');
    expect(payload.sub).toBe('jitsi.example.com');
    expect(payload.room).toBe('room-abc');
    expect(payload.context.user).toEqual({
      id: '64a1b2c3d4e5f60718293a4b',
      name: 'alice',
      avatar: 'https://cdn.example/avatar.png',
    });
  });

  test('sets exp based on configured expiration window', () => {
    const before = Math.floor(Date.now() / 1000);
    const token = mintJitsiToken({
      roomName: 'room-abc',
      identityId: '64a1b2c3d4e5f60718293a4b',
      displayName: 'alice',
    });
    const payload = decodeJwtPayload(token);
    const after = Math.floor(Date.now() / 1000);

    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp).toBe(payload.iat + 300);
  });

  test('produces different tokens for different rooms', () => {
    const base = {
      identityId: '64a1b2c3d4e5f60718293a4b',
      displayName: 'alice',
    };
    const a = mintJitsiToken({ ...base, roomName: 'room-a' });
    const b = mintJitsiToken({ ...base, roomName: 'room-b' });
    expect(a).not.toBe(b);
    expect(decodeJwtPayload(a).room).toBe('room-a');
    expect(decodeJwtPayload(b).room).toBe('room-b');
  });
});
