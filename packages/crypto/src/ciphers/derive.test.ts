import { describe, expect, test } from 'bun:test';

import {
  deriveCommunityCipher,
  deriveChannelCipher,
  verifyCipherEntropy,
  entropyPieceToBytes,
  hashFileForEntropy,
  hashUrlForEntropy,
  createTextEntropy,
  createFileEntropy,
  createUrlEntropy,
  createHardwareEntropy,
  CIPHER_DERIVATION_VERSION,
} from './derive';
import { CIPHER_ID_LENGTH, CIPHER_KEY_SIZE } from './identify';
import { randomBytes, constantTimeEqual, toBytes, toHex } from '../utils';
import type { EntropyPiece } from './types';

describe('ciphers/derive', () => {
  describe('constants', () => {
    test('CIPHER_DERIVATION_VERSION is correct', () => {
      expect(CIPHER_DERIVATION_VERSION).toBe('adieuu-cipher-v1');
    });
  });

  describe('entropyPieceToBytes', () => {
    test('converts text entropy to UTF-8 bytes', () => {
      const piece: EntropyPiece = { type: 'text', value: 'hello world' };
      const bytes = entropyPieceToBytes(piece);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes).toEqual(new TextEncoder().encode('hello world'));
    });

    test('converts file entropy from hex hash', () => {
      const hash = 'a'.repeat(64); // 64 hex chars = 32 bytes
      const piece: EntropyPiece = { type: 'file', value: hash };
      const bytes = entropyPieceToBytes(piece);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    test('throws on invalid file entropy length', () => {
      const piece: EntropyPiece = { type: 'file', value: 'abc' };

      expect(() => entropyPieceToBytes(piece)).toThrow(
        'File entropy must be a 64-character hex-encoded SHA-256 hash'
      );
    });

    test('converts URL entropy from hex hash', () => {
      const hash = 'b'.repeat(64);
      const piece: EntropyPiece = { type: 'url', value: hash };
      const bytes = entropyPieceToBytes(piece);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(32);
    });

    test('throws on invalid URL entropy length', () => {
      const piece: EntropyPiece = { type: 'url', value: 'short' };

      expect(() => entropyPieceToBytes(piece)).toThrow(
        'URL entropy must be a 64-character hex-encoded SHA-256 hash'
      );
    });

    test('converts hardware entropy from base64', () => {
      // 32 bytes in base64 = 44 characters
      const prfOutput = randomBytes(32);
      const base64 = Buffer.from(prfOutput).toString('base64');
      const piece: EntropyPiece = { type: 'hardware', value: base64 };
      const bytes = entropyPieceToBytes(piece);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(constantTimeEqual(bytes, prfOutput)).toBe(true);
    });
  });

  describe('hashFileForEntropy', () => {
    test('produces 32-byte SHA-256 hash', () => {
      const fileBytes = toBytes('file contents');
      const hash = hashFileForEntropy(fileBytes);

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    test('same input produces same hash', () => {
      const fileBytes = toBytes('consistent content');
      const hash1 = hashFileForEntropy(fileBytes);
      const hash2 = hashFileForEntropy(fileBytes);

      expect(constantTimeEqual(hash1, hash2)).toBe(true);
    });

    test('different inputs produce different hashes', () => {
      const hash1 = hashFileForEntropy(toBytes('content A'));
      const hash2 = hashFileForEntropy(toBytes('content B'));

      expect(constantTimeEqual(hash1, hash2)).toBe(false);
    });
  });

  describe('hashUrlForEntropy', () => {
    test('produces 32-byte SHA-256 hash', () => {
      const hash = hashUrlForEntropy('https://example.com/invite');

      expect(hash).toBeInstanceOf(Uint8Array);
      expect(hash.length).toBe(32);
    });

    test('same URL produces same hash', () => {
      const url = 'https://example.com/test';
      const hash1 = hashUrlForEntropy(url);
      const hash2 = hashUrlForEntropy(url);

      expect(constantTimeEqual(hash1, hash2)).toBe(true);
    });
  });

  describe('createTextEntropy', () => {
    test('creates text entropy piece', () => {
      const piece = createTextEntropy('my phrase', 'Founding phrase');

      expect(piece.type).toBe('text');
      expect(piece.value).toBe('my phrase');
      expect(piece.label).toBe('Founding phrase');
    });

    test('throws on empty text', () => {
      expect(() => createTextEntropy('')).toThrow('Text entropy cannot be empty');
    });
  });

  describe('createFileEntropy', () => {
    test('creates file entropy piece with hash', () => {
      const fileBytes = toBytes('logo image data');
      const piece = createFileEntropy(fileBytes, 'Logo');

      expect(piece.type).toBe('file');
      expect(piece.value.length).toBe(64); // hex-encoded hash
      expect(piece.label).toBe('Logo');
    });
  });

  describe('createUrlEntropy', () => {
    test('creates URL entropy piece with hash', () => {
      const piece = createUrlEntropy('https://example.com/invite', 'Invite link');

      expect(piece.type).toBe('url');
      expect(piece.value.length).toBe(64);
      expect(piece.label).toBe('Invite link');
    });

    test('throws on empty URL', () => {
      expect(() => createUrlEntropy('')).toThrow('URL entropy cannot be empty');
    });
  });

  describe('createHardwareEntropy', () => {
    test('creates hardware entropy piece', () => {
      const prfOutput = randomBytes(32);
      const piece = createHardwareEntropy(prfOutput, 'YubiKey');

      expect(piece.type).toBe('hardware');
      expect(piece.label).toBe('YubiKey');
    });

    test('throws on too-short PRF output', () => {
      const shortOutput = randomBytes(8);

      expect(() => createHardwareEntropy(shortOutput)).toThrow(
        'Hardware entropy must be at least 16 bytes'
      );
    });
  });

  describe('deriveCommunityCipher', () => {
    test('derives cipher with correct key size', () => {
      const entropy = [createTextEntropy('test phrase')];
      const cipher = deriveCommunityCipher(entropy);

      expect(cipher.key).toBeInstanceOf(Uint8Array);
      expect(cipher.key.length).toBe(CIPHER_KEY_SIZE);
    });

    test('generates valid cipher ID', () => {
      const entropy = [createTextEntropy('test phrase')];
      const cipher = deriveCommunityCipher(entropy);

      expect(cipher.cipherId).toBeDefined();
      expect(cipher.cipherId.length).toBe(CIPHER_ID_LENGTH);
      expect(/^[0-9a-f]+$/.test(cipher.cipherId)).toBe(true);
    });

    test('same entropy produces same cipher', () => {
      const entropy = [createTextEntropy('deterministic phrase')];
      const cipher1 = deriveCommunityCipher(entropy);
      const cipher2 = deriveCommunityCipher(entropy);

      expect(constantTimeEqual(cipher1.key, cipher2.key)).toBe(true);
      expect(cipher1.cipherId).toBe(cipher2.cipherId);
    });

    test('different entropy produces different cipher', () => {
      const cipher1 = deriveCommunityCipher([createTextEntropy('phrase A')]);
      const cipher2 = deriveCommunityCipher([createTextEntropy('phrase B')]);

      expect(constantTimeEqual(cipher1.key, cipher2.key)).toBe(false);
      expect(cipher1.cipherId).not.toBe(cipher2.cipherId);
    });

    test('entropy order matters', () => {
      const piece1 = createTextEntropy('first');
      const piece2 = createTextEntropy('second');

      const cipher1 = deriveCommunityCipher([piece1, piece2]);
      const cipher2 = deriveCommunityCipher([piece2, piece1]);

      expect(constantTimeEqual(cipher1.key, cipher2.key)).toBe(false);
    });

    test('supports multiple entropy types', () => {
      const entropy = [
        createTextEntropy('founding phrase'),
        createFileEntropy(toBytes('logo data'), 'logo'),
        createUrlEntropy('https://example.com/invite'),
      ];
      const cipher = deriveCommunityCipher(entropy);

      expect(cipher.key.length).toBe(CIPHER_KEY_SIZE);
    });

    test('throws on empty entropy array', () => {
      expect(() => deriveCommunityCipher([])).toThrow('At least one entropy piece is required');
    });

    test('sets profile correctly', () => {
      const entropy = [createTextEntropy('test')];

      const defaultCipher = deriveCommunityCipher(entropy, 'default');
      expect(defaultCipher.profile).toBe('default');

      const cnsa2Cipher = deriveCommunityCipher(entropy, 'cnsa2');
      expect(cnsa2Cipher.profile).toBe('cnsa2');
    });

    test('different profiles produce different ciphers', () => {
      const entropy = [createTextEntropy('test phrase')];
      const defaultCipher = deriveCommunityCipher(entropy, 'default');
      const cnsa2Cipher = deriveCommunityCipher(entropy, 'cnsa2');

      expect(constantTimeEqual(defaultCipher.key, cnsa2Cipher.key)).toBe(false);
    });
  });

  describe('deriveChannelCipher', () => {
    test('derives cipher from space + channel entropy', () => {
      const spaceEntropy = [createTextEntropy('space secret')];
      const channelEntropy = [createTextEntropy('channel secret')];

      const cipher = deriveChannelCipher(spaceEntropy, channelEntropy);

      expect(cipher.key.length).toBe(CIPHER_KEY_SIZE);
    });

    test('different channel entropy produces different cipher', () => {
      const spaceEntropy = [createTextEntropy('space secret')];

      const cipher1 = deriveChannelCipher(spaceEntropy, [createTextEntropy('channel A')]);
      const cipher2 = deriveChannelCipher(spaceEntropy, [createTextEntropy('channel B')]);

      expect(constantTimeEqual(cipher1.key, cipher2.key)).toBe(false);
    });

    test('throws on empty space entropy', () => {
      expect(() => deriveChannelCipher([], [createTextEntropy('channel')])).toThrow(
        'Space entropy is required'
      );
    });

    test('throws on empty channel entropy', () => {
      expect(() => deriveChannelCipher([createTextEntropy('space')], [])).toThrow(
        'Channel entropy is required'
      );
    });
  });

  describe('verifyCipherEntropy', () => {
    test('returns true when entropy matches expected cipher ID', () => {
      const entropy = [createTextEntropy('verification test')];
      const cipher = deriveCommunityCipher(entropy);

      const result = verifyCipherEntropy(entropy, cipher.cipherId);

      expect(result).toBe(true);
    });

    test('returns false when entropy does not match', () => {
      const entropy1 = [createTextEntropy('first phrase')];
      const entropy2 = [createTextEntropy('second phrase')];
      const cipher = deriveCommunityCipher(entropy1);

      const result = verifyCipherEntropy(entropy2, cipher.cipherId);

      expect(result).toBe(false);
    });

    test('returns false for invalid entropy', () => {
      const result = verifyCipherEntropy([], 'somecipherid');

      expect(result).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    test('space with founding phrase and logo', () => {
      const foundingPhrase = 'We gather here to discuss cryptography';
      const logoData = toBytes('PNG image data would go here');

      const entropy = [
        createTextEntropy(foundingPhrase, 'Founding phrase'),
        createFileEntropy(logoData, 'Community logo'),
      ];

      const cipher = deriveCommunityCipher(entropy);

      expect(cipher.key.length).toBe(32);
      expect(cipher.cipherId.length).toBe(128);

      // Verify same entropy produces same cipher (member joining)
      const memberCipher = deriveCommunityCipher(entropy);
      expect(constantTimeEqual(cipher.key, memberCipher.key)).toBe(true);
    });

    test('hierarchical channels (space + mod + founder)', () => {
      const spaceEntropy = [createTextEntropy('space level')];
      const modEntropy = [createTextEntropy('moderator level')];
      const founderEntropy = [createTextEntropy('founder level')];

      // Different levels of access
      const spaceCipher = deriveCommunityCipher(spaceEntropy);
      const modCipher = deriveChannelCipher(spaceEntropy, modEntropy);
      const founderCipher = deriveChannelCipher(
        [...spaceEntropy, ...modEntropy],
        founderEntropy
      );

      // All should be different
      expect(spaceCipher.cipherId).not.toBe(modCipher.cipherId);
      expect(modCipher.cipherId).not.toBe(founderCipher.cipherId);
    });

    test('epoch rotation (new entropy, new cipher)', () => {
      // Epoch 1
      const epoch1Entropy = [createTextEntropy('original founding phrase')];
      const epoch1Cipher = deriveCommunityCipher(epoch1Entropy);

      // Epoch 2 (after rotation)
      const epoch2Entropy = [createTextEntropy('new phrase after rotation')];
      const epoch2Cipher = deriveCommunityCipher(epoch2Entropy);

      // Different ciphers for different epochs
      expect(epoch1Cipher.cipherId).not.toBe(epoch2Cipher.cipherId);

      // Both can coexist for historical messages
      expect(epoch1Cipher.key.length).toBe(32);
      expect(epoch2Cipher.key.length).toBe(32);
    });
  });
});
