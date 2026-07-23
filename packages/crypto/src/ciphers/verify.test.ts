import { describe, expect, test } from 'bun:test';

import { deriveCommunityCipher, createTextEntropy } from './derive';
import {
  deriveSpaceCipherKey,
  createCipherCheck,
  verifyCipherCheck,
  detectSpaceCipher,
  generateKnownValue,
  SPACE_CIPHER_CHECK_ARGON2,
} from './verify';
import { toBytes, toBase64, fromBase64 } from '../utils';
import type { CommunityCipher } from './types';

// 24-hex ObjectId-shaped ids (as the client receives them).
const SPACE_A = '507f1f77bcf86cd799439011';
const SPACE_B = '507f191e810c19729de860ea';

function cipherFrom(...phrases: string[]): CommunityCipher {
  return deriveCommunityCipher(phrases.map((p) => createTextEntropy(p)));
}

describe('ciphers/verify', () => {
  describe('deriveSpaceCipherKey', () => {
    test('is deterministic for the same cipher + space', async () => {
      const cipher = cipherFrom('founding phrase', 'second piece');
      const k1 = await deriveSpaceCipherKey(cipher, SPACE_A);
      const k2 = await deriveSpaceCipherKey(cipher, SPACE_A);
      expect(k1).toEqual(k2);
      expect(k1.length).toBe(SPACE_CIPHER_CHECK_ARGON2.outputLength);
    });

    test('binds to the space id (same cipher, different space -> different key)', async () => {
      const cipher = cipherFrom('founding phrase');
      const kA = await deriveSpaceCipherKey(cipher, SPACE_A);
      const kB = await deriveSpaceCipherKey(cipher, SPACE_B);
      expect(kA).not.toEqual(kB);
    });

    test('different ciphers yield different per-space keys', async () => {
      const c1 = cipherFrom('phrase one');
      const c2 = cipherFrom('phrase two');
      const k1 = await deriveSpaceCipherKey(c1, SPACE_A);
      const k2 = await deriveSpaceCipherKey(c2, SPACE_A);
      expect(k1).not.toEqual(k2);
    });

    test('entropy order changes the derived key', async () => {
      const ab = cipherFrom('alpha', 'bravo');
      const ba = cipherFrom('bravo', 'alpha');
      const kab = await deriveSpaceCipherKey(ab, SPACE_A);
      const kba = await deriveSpaceCipherKey(ba, SPACE_A);
      expect(kab).not.toEqual(kba);
    });

    test('rejects a too-short space id', async () => {
      const cipher = cipherFrom('x');
      await expect(deriveSpaceCipherKey(cipher, 'short')).rejects.toThrow();
    });
  });

  describe('createCipherCheck / verifyCipherCheck', () => {
    test('round-trips for the correct cipher', async () => {
      const cipher = cipherFrom('shared secret', 'logo-hash');
      const check = await createCipherCheck(cipher, SPACE_A);
      expect(check.knownValue).toBeTruthy();
      expect(check.encryptedKnownValue).toBeTruthy();
      expect(check.nonce).toBeTruthy();

      const ok = await verifyCipherCheck(cipher, SPACE_A, check);
      expect(ok).toBe(true);
    });

    test('fails for a different cipher', async () => {
      const real = cipherFrom('the real phrase');
      const wrong = cipherFrom('a wrong phrase');
      const check = await createCipherCheck(real, SPACE_A);
      expect(await verifyCipherCheck(wrong, SPACE_A, check)).toBe(false);
    });

    test('fails when the cipher is right but the space differs', async () => {
      const cipher = cipherFrom('phrase');
      const check = await createCipherCheck(cipher, SPACE_A);
      expect(await verifyCipherCheck(cipher, SPACE_B, check)).toBe(false);
    });

    test('fails for a cipher with entropy pieces in the wrong order', async () => {
      const ab = cipherFrom('alpha', 'bravo');
      const ba = cipherFrom('bravo', 'alpha');
      const check = await createCipherCheck(ab, SPACE_A);
      expect(await verifyCipherCheck(ba, SPACE_A, check)).toBe(false);
    });

    test('fails on a tampered challenge', async () => {
      const cipher = cipherFrom('phrase');
      const check = await createCipherCheck(cipher, SPACE_A);
      // Flip a byte of the ciphertext.
      const ct = fromBase64(check.encryptedKnownValue);
      ct[0] = ct[0]! ^ 0xff;
      const tampered = { ...check, encryptedKnownValue: toBase64(ct) };
      expect(await verifyCipherCheck(cipher, SPACE_A, tampered)).toBe(false);
    });

    test('fails gracefully on a malformed challenge', async () => {
      const cipher = cipherFrom('phrase');
      const bad = { knownValue: 'x', encryptedKnownValue: '!!!not base64!!!', nonce: '@@' };
      expect(await verifyCipherCheck(cipher, SPACE_A, bad)).toBe(false);
    });

    test('honors an explicit knownValue and encrypts it', async () => {
      const cipher = cipherFrom('phrase');
      const check = await createCipherCheck(cipher, SPACE_A, { knownValue: 'known-123' });
      expect(check.knownValue).toBe('known-123');
      expect(await verifyCipherCheck(cipher, SPACE_A, check)).toBe(true);
    });

    test('generates a random knownValue by default', () => {
      expect(generateKnownValue()).not.toBe(generateKnownValue());
    });

    test('reusing a pre-derived space key matches a fresh derivation', async () => {
      const cipher = cipherFrom('phrase');
      const spaceKey = await deriveSpaceCipherKey(cipher, SPACE_A);
      const check = await createCipherCheck(cipher, SPACE_A, { spaceKey });
      // Verify both with the cached key and with a fresh derivation.
      expect(await verifyCipherCheck(cipher, SPACE_A, check, { spaceKey })).toBe(true);
      expect(await verifyCipherCheck(cipher, SPACE_A, check)).toBe(true);
    });

    test('the encrypted challenge does not leak the plaintext knownValue', async () => {
      const cipher = cipherFrom('phrase');
      const check = await createCipherCheck(cipher, SPACE_A, { knownValue: 'sensitive-known' });
      const ctBytes = fromBase64(check.encryptedKnownValue);
      // knownValue plaintext must not appear inside the ciphertext.
      const kvBytes = toBytes('sensitive-known');
      const haystack = Buffer.from(ctBytes).toString('latin1');
      const needle = Buffer.from(kvBytes).toString('latin1');
      expect(haystack.includes(needle)).toBe(false);
    });
  });

  describe('detectSpaceCipher', () => {
    test('finds the matching cipher among candidates', async () => {
      const target = cipherFrom('the space phrase');
      const decoy1 = cipherFrom('decoy one');
      const decoy2 = cipherFrom('decoy two');
      const check = await createCipherCheck(target, SPACE_A);

      const found = await detectSpaceCipher([decoy1, target, decoy2], SPACE_A, check);
      expect(found).not.toBeNull();
      expect(found!.cipherId).toBe(target.cipherId);
    });

    test('returns null when no candidate matches', async () => {
      const target = cipherFrom('the space phrase');
      const check = await createCipherCheck(target, SPACE_A);
      const found = await detectSpaceCipher(
        [cipherFrom('nope one'), cipherFrom('nope two')],
        SPACE_A,
        check,
      );
      expect(found).toBeNull();
    });

    test('returns null for an empty candidate list', async () => {
      const target = cipherFrom('phrase');
      const check = await createCipherCheck(target, SPACE_A);
      expect(await detectSpaceCipher([], SPACE_A, check)).toBeNull();
    });
  });
});
