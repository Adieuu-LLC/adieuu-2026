import { describe, expect, test } from 'bun:test';
import {
  looksLikeCipherPayload,
  decryptBody,
  encryptContent,
  decryptEditHistoryEntry,
} from './spaceChannelCipher';
import {
  encryptWithCipher,
  fromBytes,
  deserializeCipherPayload,
  decryptWithCipher,
  deriveCommunityCipher,
  toBytes,
} from '@adieuu/crypto';

function makeCipher() {
  return deriveCommunityCipher([{ type: 'text', value: 'test-entropy' }]);
}

function makeEncryptedJson(cipher: ReturnType<typeof makeCipher>, plaintext: string): string {
  return encryptContent(cipher, plaintext);
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
  test('returns empty string for undefined content', () => {
    expect(decryptBody(undefined, null, 'fallback')).toBe('');
  });

  test('returns empty string for empty content', () => {
    expect(decryptBody('', null, 'fallback')).toBe('');
  });

  test('returns plaintext when no cipher and content is not cipher payload', () => {
    expect(decryptBody('hello', null, 'fallback')).toBe('hello');
  });

  test('returns fallback when no cipher but content looks like cipher payload', () => {
    const payload = JSON.stringify({ ciphertext: 'a', nonce: 'b', cipherId: 'c' });
    expect(decryptBody(payload, null, 'fallback')).toBe('fallback');
  });

  test('decrypts content when cipher is provided', () => {
    const cipher = makeCipher();
    const encrypted = makeEncryptedJson(cipher, 'secret message');
    expect(decryptBody(encrypted, cipher, 'fallback')).toBe('secret message');
  });

  test('returns fallback when cipher cannot decrypt', () => {
    const cipher1 = makeCipher();
    const cipher2 = deriveCommunityCipher([{ type: 'text', value: 'different-entropy' }]);
    const encrypted = makeEncryptedJson(cipher1, 'secret');
    expect(decryptBody(encrypted, cipher2, 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// encryptContent
// ---------------------------------------------------------------------------

describe('encryptContent', () => {
  test('produces JSON with ciphertext, nonce, and cipherId fields', () => {
    const cipher = makeCipher();
    const result = encryptContent(cipher, 'hello');
    const parsed = JSON.parse(result);
    expect(parsed.ciphertext).toBeString();
    expect(parsed.nonce).toBeString();
    expect(parsed.cipherId).toBe(cipher.cipherId);
  });

  test('round-trips through decrypt', () => {
    const cipher = makeCipher();
    const json = encryptContent(cipher, 'round trip');
    const parsed = JSON.parse(json);
    const payload = deserializeCipherPayload(parsed);
    expect(fromBytes(decryptWithCipher(cipher, payload))).toBe('round trip');
  });
});

// ---------------------------------------------------------------------------
// decryptEditHistoryEntry
// ---------------------------------------------------------------------------

describe('decryptEditHistoryEntry', () => {
  test('returns plaintext on success', () => {
    const cipher = makeCipher();
    const encrypted = encryptContent(cipher, 'edited text');
    const result = decryptEditHistoryEntry(encrypted, cipher);
    expect('plaintext' in result && result.plaintext).toBe('edited text');
  });

  test('returns decryptionError on failure', () => {
    const cipher = makeCipher();
    const result = decryptEditHistoryEntry('not-valid-json', cipher);
    expect('decryptionError' in result).toBe(true);
  });

  test('returns decryptionError when wrong cipher is used', () => {
    const cipher1 = makeCipher();
    const cipher2 = deriveCommunityCipher([{ type: 'text', value: 'other' }]);
    const encrypted = encryptContent(cipher1, 'secret');
    const result = decryptEditHistoryEntry(encrypted, cipher2);
    expect('decryptionError' in result).toBe(true);
  });
});
