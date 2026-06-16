import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { DEFAULT_PRIVACY_SETTINGS, toIdentityPublicKeys, toPublicIdentity } from './identity';
import type { IdentityDocument } from './identity';

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

describe('toPublicIdentity passphraseChangedAt', () => {
  const baseDoc: IdentityDocument = {
    _id: new ObjectId(),
    ident: 'test-ident',
    hashVersion: 2,
    username: 'u',
    displayName: 'D',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastActiveAt: new Date(),
  };

  test('exposes ISO passphraseChangedAt when set', () => {
    const when = new Date('2026-01-02T03:04:05.000Z');
    const result = toPublicIdentity({ ...baseDoc, passphraseChangedAt: when });
    expect(result.passphraseChangedAt).toBe(when.toISOString());
  });

  test('returns null when passphraseChangedAt is absent (legacy rows)', () => {
    const result = toPublicIdentity(baseDoc);
    expect(result.passphraseChangedAt).toBeNull();
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

  test('includes staticKeyAttestation on devices when present', () => {
    const doc = {
      ...baseDoc,
      devices: [
        {
          ...baseDoc.devices[0],
          staticKeyAttestation: 'c2lnYXR1cmU',
        },
      ],
    };
    const keys = toIdentityPublicKeys(doc as never);
    expect(keys?.devices[0]?.staticKeyAttestation).toBe('c2lnYXR1cmU');
  });
});
