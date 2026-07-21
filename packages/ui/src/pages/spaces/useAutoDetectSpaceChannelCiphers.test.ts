import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { deriveCommunityCipher, createTextEntropy, type CommunityCipher } from '@adieuu/crypto';
import type { CipherCheck } from '@adieuu/shared';

import {
  clearSpaceCipherState,
  createSpaceCipherCheck,
  getChannelCipherLink,
  getSpaceCipherLink,
  registerSpaceCipherLink,
} from '../../services/spaceCipherService';

async function bookmarkAndLink(localCipherId: string, spaceId: string) {
  registerSpaceCipherLink(spaceId, localCipherId);
  return { success: true as const };
}
import {
  autoDetectSpaceChannelCiphers,
  cipherCheckFingerprint,
  resetAutoDetectSpaceChannelCiphersAttempts,
} from './useAutoDetectSpaceChannelCiphers';
import { encryptSpaceMetadataField } from './spaceMetadataCipher';

const SPACE_ID = '507f1f77bcf86cd799439011';

function cipherFrom(...phrases: string[]): CommunityCipher {
  return deriveCommunityCipher(phrases.map((p) => createTextEntropy(p)));
}

describe('useAutoDetectSpaceChannelCiphers helpers', () => {
  beforeEach(() => {
    clearSpaceCipherState();
    resetAutoDetectSpaceChannelCiphersAttempts();
  });

  test('cipherCheckFingerprint distinguishes challenges', () => {
    const a: CipherCheck = { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'n' };
    const b: CipherCheck = { knownValue: 'k', encryptedKnownValue: 'e', nonce: 'other' };
    expect(cipherCheckFingerprint(a)).toBe(cipherCheckFingerprint({ ...a }));
    expect(cipherCheckFingerprint(a)).not.toBe(cipherCheckFingerprint(b));
  });

  test('dedupes identical channel checks into one detect call', async () => {
    const cipher = cipherFrom('shared');
    const check = await createSpaceCipherCheck(cipher, SPACE_ID);
    const encA = encryptSpaceMetadataField(cipher, 'general');
    const encB = encryptSpaceMetadataField(cipher, 'random');

    const detect = mock(async () => cipher);
    const bookmarkSpaceCipher = mock(bookmarkAndLink);

    const result = await autoDetectSpaceChannelCiphers({
      space: { id: SPACE_ID, e2ee: true, cipherCheck: check },
      channels: [
        {
          id: 'ch-a',
          name: '',
          ...encA,
          cipherCheck: check,
        },
        {
          id: 'ch-b',
          name: '',
          ...encB,
          cipherCheck: check,
        },
      ],
      categories: [],
      candidates: [cipher],
      getCipherKey: (id) => (id === 'local-1' ? cipher : null),
      findLocalIdByCipherId: (cid) => (cid === cipher.cipherId ? 'local-1' : undefined),
      bookmarkSpaceCipher,
      detect,
    });

    expect(result).toEqual({ status: 'attempted', matchedChecks: 1, detectCalls: 1 });
    expect(detect).toHaveBeenCalledTimes(1);
    expect(bookmarkSpaceCipher).toHaveBeenCalledWith('local-1', SPACE_ID);
    expect(getSpaceCipherLink(SPACE_ID)).toBe('local-1');
    expect(getChannelCipherLink('ch-a')).toBe('local-1');
    expect(getChannelCipherLink('ch-b')).toBe('local-1');
  });

  test('skips when space already linked and names decrypt', async () => {
    const cipher = cipherFrom('shared');
    const check = await createSpaceCipherCheck(cipher, SPACE_ID);
    const enc = encryptSpaceMetadataField(cipher, 'general');
    registerSpaceCipherLink(SPACE_ID, 'local-1');

    const detect = mock(async () => cipher);

    const result = await autoDetectSpaceChannelCiphers({
      space: { id: SPACE_ID, e2ee: true, cipherCheck: check },
      channels: [{ id: 'ch-a', name: '', ...enc, cipherCheck: check }],
      categories: [],
      candidates: [cipher],
      getCipherKey: (id) => (id === 'local-1' ? cipher : null),
      findLocalIdByCipherId: () => 'local-1',
      bookmarkSpaceCipher: bookmarkAndLink,
      detect,
    });

    expect(result).toEqual({ status: 'skipped', reason: 'already_unlocked' });
    expect(detect).not.toHaveBeenCalled();
  });

  test('once-per-space session guard skips a second attempt', async () => {
    const cipher = cipherFrom('shared');
    const check = await createSpaceCipherCheck(cipher, SPACE_ID);
    const enc = encryptSpaceMetadataField(cipher, 'general');
    const detect = mock(async () => cipher);

    const input = {
      space: { id: SPACE_ID, e2ee: true, cipherCheck: check },
      channels: [{ id: 'ch-a', name: '', ...enc, cipherCheck: check }],
      categories: [] as const,
      candidates: [cipher],
      getCipherKey: (id: string) => (id === 'local-1' ? cipher : null),
      findLocalIdByCipherId: (cid: string) =>
        cid === cipher.cipherId ? 'local-1' : undefined,
      bookmarkSpaceCipher: bookmarkAndLink,
      detect,
    };

    const first = await autoDetectSpaceChannelCiphers(input);
    expect(first.status).toBe('attempted');
    expect(detect).toHaveBeenCalledTimes(1);

    // Clear links so a naive re-run would otherwise try again.
    clearSpaceCipherState();
    const second = await autoDetectSpaceChannelCiphers(input);
    expect(second).toEqual({ status: 'skipped', reason: 'already_attempted' });
    expect(detect).toHaveBeenCalledTimes(1);
  });

  test('runs distinct detect calls for different channel checks', async () => {
    const cipherA = cipherFrom('alpha');
    const cipherB = cipherFrom('beta');
    const checkA = await createSpaceCipherCheck(cipherA, SPACE_ID);
    const checkB = await createSpaceCipherCheck(cipherB, SPACE_ID);
    const encA = encryptSpaceMetadataField(cipherA, 'a');
    const encB = encryptSpaceMetadataField(cipherB, 'b');

    const detect = mock(async (_ciphers, _spaceId, check: CipherCheck) => {
      if (cipherCheckFingerprint(check) === cipherCheckFingerprint(checkA)) return cipherA;
      if (cipherCheckFingerprint(check) === cipherCheckFingerprint(checkB)) return cipherB;
      return null;
    });

    const result = await autoDetectSpaceChannelCiphers({
      space: { id: SPACE_ID, e2ee: true, cipherCheck: checkA },
      channels: [
        { id: 'ch-a', name: '', ...encA, cipherCheck: checkA },
        { id: 'ch-b', name: '', ...encB, cipherCheck: checkB },
      ],
      categories: [],
      candidates: [cipherA, cipherB],
      getCipherKey: (id) => {
        if (id === 'local-a') return cipherA;
        if (id === 'local-b') return cipherB;
        return null;
      },
      findLocalIdByCipherId: (cid) => {
        if (cid === cipherA.cipherId) return 'local-a';
        if (cid === cipherB.cipherId) return 'local-b';
        return undefined;
      },
      bookmarkSpaceCipher: bookmarkAndLink,
      detect,
    });

    expect(result).toEqual({ status: 'attempted', matchedChecks: 2, detectCalls: 2 });
    expect(detect).toHaveBeenCalledTimes(2);
    expect(getSpaceCipherLink(SPACE_ID)).toBe('local-b'); // last bookmark wins for space link map
    expect(getChannelCipherLink('ch-a')).toBe('local-a');
    expect(getChannelCipherLink('ch-b')).toBe('local-b');
  });

  test('does not mark attempted when there are no candidates', async () => {
    const cipher = cipherFrom('shared');
    const check = await createSpaceCipherCheck(cipher, SPACE_ID);
    const enc = encryptSpaceMetadataField(cipher, 'general');
    const detect = mock(async () => cipher);

    const first = await autoDetectSpaceChannelCiphers({
      space: { id: SPACE_ID, e2ee: true, cipherCheck: check },
      channels: [{ id: 'ch-a', name: '', ...enc, cipherCheck: check }],
      categories: [],
      candidates: [],
      getCipherKey: () => null,
      findLocalIdByCipherId: () => undefined,
      bookmarkSpaceCipher: bookmarkAndLink,
      detect,
    });
    expect(first).toEqual({ status: 'skipped', reason: 'no_candidates' });

    const second = await autoDetectSpaceChannelCiphers({
      space: { id: SPACE_ID, e2ee: true, cipherCheck: check },
      channels: [{ id: 'ch-a', name: '', ...enc, cipherCheck: check }],
      categories: [],
      candidates: [cipher],
      getCipherKey: (id) => (id === 'local-1' ? cipher : null),
      findLocalIdByCipherId: (cid) => (cid === cipher.cipherId ? 'local-1' : undefined),
      bookmarkSpaceCipher: bookmarkAndLink,
      detect,
    });
    expect(second.status).toBe('attempted');
    expect(detect).toHaveBeenCalledTimes(1);
  });
});
