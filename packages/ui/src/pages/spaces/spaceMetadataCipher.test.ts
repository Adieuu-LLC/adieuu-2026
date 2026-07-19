import { describe, expect, test } from 'bun:test';
import { deriveCommunityCipher, createTextEntropy } from '@adieuu/crypto';
import {
  buildEncryptedSpaceSeed,
  decryptSpaceMetadataField,
  encryptSpaceMetadataField,
  resolveChannelDisplayName,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';

describe('spaceMetadataCipher', () => {
  const cipher = deriveCommunityCipher([createTextEntropy('metadata test secret')]);

  test('encrypts and decrypts a metadata field round-trip', () => {
    const enc = encryptSpaceMetadataField(cipher, 'general');
    expect(enc.encryptedName).toBeTruthy();
    expect(enc.nameNonce).toBeTruthy();
    expect(enc.cipherId).toBe(cipher.cipherId);

    const plain = decryptSpaceMetadataField(cipher, enc, 'fallback');
    expect(plain).toBe('general');
  });

  test('buildEncryptedSpaceSeed includes channel + admin/member roles', () => {
    const seed = buildEncryptedSpaceSeed(cipher);
    expect(seed.roles.map((r) => r.system).sort()).toEqual(['admin', 'member']);
    expect(decryptSpaceMetadataField(cipher, seed.channel, '')).toBe('general');
    const admin = seed.roles.find((r) => r.system === 'admin')!;
    const member = seed.roles.find((r) => r.system === 'member')!;
    expect(decryptSpaceMetadataField(cipher, admin, '')).toBe('Admin');
    expect(decryptSpaceMetadataField(cipher, member, '')).toBe('Everyone');
  });

  test('resolveSpaceDisplayName uses placeholder when identity encrypted and cipher missing', () => {
    const enc = encryptSpaceMetadataField(cipher, 'Secret Club');
    const name = resolveSpaceDisplayName(
      {
        name: '',
        slug: 'secret-club',
        encryptIdentity: true,
        encryptedName: enc.encryptedName,
        nameNonce: enc.nameNonce,
        cipherId: enc.cipherId,
      },
      null,
      { encryptedSpace: 'Encrypted Space' },
    );
    expect(name).toBe('Encrypted Space');
  });

  test('resolveSpaceDisplayName decrypts when cipher is present', () => {
    const enc = encryptSpaceMetadataField(cipher, 'Secret Club');
    const name = resolveSpaceDisplayName(
      {
        name: '',
        slug: 'secret-club',
        encryptIdentity: true,
        encryptedName: enc.encryptedName,
        nameNonce: enc.nameNonce,
        cipherId: enc.cipherId,
      },
      cipher,
      { encryptedSpace: 'Encrypted Space' },
    );
    expect(name).toBe('Secret Club');
  });

  test('resolveChannelDisplayName decrypts encrypted channel names', () => {
    const enc = encryptSpaceMetadataField(cipher, 'general');
    const name = resolveChannelDisplayName(
      {
        name: '',
        encryptedName: enc.encryptedName,
        nameNonce: enc.nameNonce,
        cipherId: enc.cipherId,
      },
      cipher,
      { encryptedChannel: 'Encrypted channel' },
    );
    expect(name).toBe('general');
  });
});
