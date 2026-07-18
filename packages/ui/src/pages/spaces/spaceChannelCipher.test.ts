import { describe, expect, test } from 'bun:test';
import {
  looksLikeCipherPayload,
  decryptBody,
  encryptContent,
  decryptEditHistoryEntry,
} from './spaceChannelCipher';
import {
  deserializeCipherPayload,
  decryptWithCipher,
  deriveCommunityCipher,
  fromBytes,
} from '@adieuu/crypto';

function makeCipher() {
  return deriveCommunityCipher([{ type: 'text', value: 'test-entropy' }]);
}

// ---------------------------------------------------------------------------
// looksLikeCipherPayload
// ---------------------------------------------------------------------------

describe('looksLikeCipherPayload', () => {
  test('returns true for valid cipher JSON', () => {
    const json = JSON.stringify({ ciphertext: 'a', nonce: 'b', cipherId: 'c' });
    expect(looksLikeCipherPayload(json)).toBe(true);
  });

  test('returns false for plain text', () => {
    expect(looksLikeCipherPayload('hello world')).toBe(false);
  });

  test('returns false for JSON missing required fields', () => {
    expect(looksLikeCipherPayload(JSON.stringify({ ciphertext: 'a' }))).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(looksLikeCipherPayload('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decryptBody
// ---------------------------------------------------------------------------

describe('decryptBody', () => {
  test('returns empty string for undefined message', () => {
    expect(decryptBody(undefined, null, 'fallback')).toBe('');
  });

  test('returns empty string for empty content message', () => {
    expect(decryptBody({ content: '' }, null, 'fallback')).toBe('');
  });

  test('returns plaintext when no cipher and content is not cipher payload', () => {
    expect(decryptBody({ content: 'hello' }, null, 'fallback')).toBe('hello');
  });

  test('returns fallback when no cipher but content looks like cipher payload', () => {
    const payload = JSON.stringify({ ciphertext: 'a', nonce: 'b', cipherId: 'c' });
    expect(decryptBody({ content: payload }, null, 'fallback')).toBe('fallback');
  });

  test('decrypts from dedicated cipher fields when cipher is provided', () => {
    const cipher = makeCipher();
    const fields = encryptContent(cipher, 'secret message');
    expect(decryptBody(fields, cipher, 'fallback')).toBe('secret message');
  });

  test('returns fallback when cipher cannot decrypt', () => {
    const cipher1 = makeCipher();
    const cipher2 = deriveCommunityCipher([{ type: 'text', value: 'different-entropy' }]);
    const fields = encryptContent(cipher1, 'secret');
    expect(decryptBody(fields, cipher2, 'fallback')).toBe('fallback');
  });

  test('returns fallback when cipher fields present but no cipher provided', () => {
    const cipher = makeCipher();
    const fields = encryptContent(cipher, 'secret');
    expect(decryptBody(fields, null, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// encryptContent
// ---------------------------------------------------------------------------

describe('encryptContent', () => {
  test('produces structured fields with ciphertext, nonce, and cipherId', () => {
    const cipher = makeCipher();
    const result = encryptContent(cipher, 'hello');
    expect(result.ciphertext).toBeString();
    expect(result.nonce).toBeString();
    expect(result.cipherId).toBe(cipher.cipherId);
  });

  test('round-trips through crypto decrypt', () => {
    const cipher = makeCipher();
    const fields = encryptContent(cipher, 'round trip');
    const payload = deserializeCipherPayload(fields);
    expect(fromBytes(decryptWithCipher(cipher, payload))).toBe('round trip');
  });
});

// ---------------------------------------------------------------------------
// decryptEditHistoryEntry
// ---------------------------------------------------------------------------

describe('decryptEditHistoryEntry', () => {
  test('returns plaintext on success with cipher fields', () => {
    const cipher = makeCipher();
    const fields = encryptContent(cipher, 'edited text');
    const result = decryptEditHistoryEntry(fields, cipher);
    expect('plaintext' in result && result.plaintext).toBe('edited text');
  });

  test('returns plaintext from content field for non-encrypted revision', () => {
    const cipher = makeCipher();
    const result = decryptEditHistoryEntry({ content: 'plain edit' }, cipher);
    expect('plaintext' in result && result.plaintext).toBe('plain edit');
  });

  test('returns decryptionError for legacy serialized cipher in content', () => {
    const cipher = makeCipher();
    const legacy = JSON.stringify({ ciphertext: 'a', nonce: 'b', cipherId: 'c' });
    const result = decryptEditHistoryEntry({ content: legacy }, cipher);
    expect('decryptionError' in result).toBe(true);
  });

  test('returns decryptionError when wrong cipher is used', () => {
    const cipher1 = makeCipher();
    const cipher2 = deriveCommunityCipher([{ type: 'text', value: 'other' }]);
    const fields = encryptContent(cipher1, 'secret');
    const result = decryptEditHistoryEntry(fields, cipher2);
    expect('decryptionError' in result).toBe(true);
  });

  test('returns decryptionError when no content or cipher fields', () => {
    const cipher = makeCipher();
    const result = decryptEditHistoryEntry({}, cipher);
    expect('decryptionError' in result).toBe(true);
  });
});
