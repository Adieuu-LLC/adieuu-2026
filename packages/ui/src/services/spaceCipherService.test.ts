import { beforeEach, describe, expect, test } from 'bun:test';

import { deriveCommunityCipher, createTextEntropy, type CommunityCipher } from '@adieuu/crypto';

import {
  getSpaceKey,
  createSpaceCipherCheck,
  verifySpaceCipherCheck,
  detectSpaceCipher,
  registerSpaceCipherLink,
  getSpaceCipherLink,
  removeSpaceCipherLink,
  evictSpaceKey,
  clearSpaceKeyCacheForSpace,
  clearSpaceCipherState,
} from './spaceCipherService';

const SPACE_A = '507f1f77bcf86cd799439011';
const SPACE_B = '507f191e810c19729de860ea';

function cipherFrom(...phrases: string[]): CommunityCipher {
  return deriveCommunityCipher(phrases.map((p) => createTextEntropy(p)));
}

describe('spaceCipherService', () => {
  beforeEach(() => {
    clearSpaceCipherState();
  });

  describe('getSpaceKey (cache)', () => {
    test('caches the derived key for a (cipher, space) pair', async () => {
      const cipher = cipherFrom('phrase one');
      const k1 = await getSpaceKey(cipher, SPACE_A);
      const k2 = await getSpaceKey(cipher, SPACE_A);
      // Same cached reference — Argon2id ran only once.
      expect(k2).toBe(k1);
    });

    test('caches separately per space', async () => {
      const cipher = cipherFrom('phrase one');
      const kA = await getSpaceKey(cipher, SPACE_A);
      const kB = await getSpaceKey(cipher, SPACE_B);
      expect(kB).not.toBe(kA);
      expect(kB).not.toEqual(kA);
    });

    test('evictSpaceKey forces a re-derivation', async () => {
      const cipher = cipherFrom('phrase one');
      const k1 = await getSpaceKey(cipher, SPACE_A);
      evictSpaceKey(SPACE_A, cipher.cipherId);
      const k2 = await getSpaceKey(cipher, SPACE_A);
      expect(k2).not.toBe(k1); // fresh object
      expect(k2).toEqual(k1); // but identical material (deterministic)
    });

    test('clearSpaceKeyCacheForSpace evicts only that space', async () => {
      const cipher = cipherFrom('phrase one');
      const kA = await getSpaceKey(cipher, SPACE_A);
      const kB = await getSpaceKey(cipher, SPACE_B);
      clearSpaceKeyCacheForSpace(SPACE_A);
      expect(await getSpaceKey(cipher, SPACE_A)).not.toBe(kA); // re-derived
      expect(await getSpaceKey(cipher, SPACE_B)).toBe(kB); // still cached
    });
  });

  describe('challenge create / verify / detect', () => {
    test('create then verify round-trips', async () => {
      const cipher = cipherFrom('shared', 'secret');
      const check = await createSpaceCipherCheck(cipher, SPACE_A);
      expect(await verifySpaceCipherCheck(cipher, SPACE_A, check)).toBe(true);
    });

    test('verify fails for the wrong cipher', async () => {
      const real = cipherFrom('real');
      const wrong = cipherFrom('wrong');
      const check = await createSpaceCipherCheck(real, SPACE_A);
      expect(await verifySpaceCipherCheck(wrong, SPACE_A, check)).toBe(false);
    });

    test('detectSpaceCipher finds the matching cipher', async () => {
      const target = cipherFrom('the target');
      const check = await createSpaceCipherCheck(target, SPACE_A);
      const found = await detectSpaceCipher(
        [cipherFrom('decoy a'), target, cipherFrom('decoy b')],
        SPACE_A,
        check,
      );
      expect(found?.cipherId).toBe(target.cipherId);
    });

    test('detectSpaceCipher returns null with no match', async () => {
      const target = cipherFrom('the target');
      const check = await createSpaceCipherCheck(target, SPACE_A);
      const found = await detectSpaceCipher([cipherFrom('nope')], SPACE_A, check);
      expect(found).toBeNull();
    });
  });

  describe('local spaceId -> cipher link', () => {
    test('register / get / remove', () => {
      expect(getSpaceCipherLink(SPACE_A)).toBeNull();
      registerSpaceCipherLink(SPACE_A, 'local-cipher-1');
      expect(getSpaceCipherLink(SPACE_A)).toBe('local-cipher-1');
      removeSpaceCipherLink(SPACE_A);
      expect(getSpaceCipherLink(SPACE_A)).toBeNull();
    });
  });

  describe('clearSpaceCipherState', () => {
    test('clears keys and links', async () => {
      const cipher = cipherFrom('phrase');
      const k1 = await getSpaceKey(cipher, SPACE_A);
      registerSpaceCipherLink(SPACE_A, 'local-cipher-1');

      clearSpaceCipherState();

      expect(getSpaceCipherLink(SPACE_A)).toBeNull();
      expect(await getSpaceKey(cipher, SPACE_A)).not.toBe(k1); // cache was cleared
    });
  });
});
