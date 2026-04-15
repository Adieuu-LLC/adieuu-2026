import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { DEFAULT_PRIVACY_SETTINGS, toIdentityPublicKeys } from './identity';

describe('DEFAULT_PRIVACY_SETTINGS', () => {
  test('matches expected per-field defaults (kept in sync with profile UI and achievements gating)', () => {
    expect(DEFAULT_PRIVACY_SETTINGS).toEqual({
      avatar: 'public',
      banner: 'public',
      bio: 'public',
      lastActiveAt: 'friends',
      profileColors: 'public',
      achievements: 'friends',
    });
  });
});

describe('toIdentityPublicKeys', () => {
  const baseDoc = {
    _id: new ObjectId(),
    ident: 'test-ident',
    username: 'u',
    displayName: 'D',
    createdAt: new Date(),
    lastActiveAt: new Date(),
    signingPublicKey: 'c2ln',
    preferredCryptoProfile: 'default' as const,
    devices: [
      {
        deviceId: 'dev-1',
        name: 'Personal phone',
        ecdhPublicKey: 'x',
        kemPublicKey: 'y',
        registeredAt: new Date(),
        lastActiveAt: new Date(),
      },
    ],
  };

  test('includes device names for owner-facing payloads by default', () => {
    const keys = toIdentityPublicKeys(baseDoc as never);
    expect(keys?.devices[0]?.name).toBe('Personal phone');
  });

  test('strips device names when includeDeviceNames is false', () => {
    const keys = toIdentityPublicKeys(baseDoc as never, { includeDeviceNames: false });
    expect(keys?.devices[0]?.name).toBe('');
  });
});
