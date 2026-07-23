/**
 * Space Cipher Verification (blind-relay challenge)
 *
 * Spaces bind a Community Cipher without the server ever seeing entropy, keys,
 * or cipherIds. The server stores only a `SpaceCipherCheck` challenge:
 * a short random `knownValue` in plaintext plus its encryption under a
 * per-Space key. A joining client finds its matching Cipher by re-deriving the
 * per-Space key for each candidate and decrypting the challenge.
 *
 * ## Per-Space key derivation (slow KDF)
 *
 * The per-Space key is derived in two stages:
 *
 * 1. **HKDF bind** — domain-separate the Community Cipher key to this Space by
 *    HKDF with the Space `_id` as salt. Fast; binds the key to the Space.
 * 2. **Argon2id harden** — run a memory-hard KDF (salt = Space `_id`) over the
 *    bound key. This makes offline brute-force of weak Cipher entropy (via the
 *    server-stored challenge) expensive.
 *
 * The per-Space key is a **one-time** derivation per (Cipher, Space); callers
 * should cache it and reuse the fast AEAD key for per-message crypto, so the
 * Argon2id cost is paid once, not per message.
 *
 * @module crypto/ciphers/verify
 */

import { encrypt, decrypt } from '../encrypt';
import { deriveKey } from '../kdf/hkdf';
import { deriveKeyFromPassword, ARGON2_DEFAULTS } from '../kdf/argon2';
import {
  toBytes,
  toBase64,
  fromBase64,
  toBase64Url,
  randomBytes,
  constantTimeEqual,
} from '../utils';
import type { CommunityCipher } from './types';

/** HKDF/context info string for per-Space cipher binding. */
export const SPACE_CIPHER_CHECK_INFO = 'adieuu-space-cipher-check-v1';

/** Random plaintext length (bytes) for the challenge `knownValue`. */
export const CIPHER_CHECK_KNOWN_VALUE_BYTES = 16;

/**
 * Argon2id parameters for the per-Space key. These MUST stay fixed and
 * identical across all clients — changing them changes the derived key and
 * breaks verification. (Matches the app-wide Argon2id defaults.)
 */
export const SPACE_CIPHER_CHECK_ARGON2 = {
  memoryCost: ARGON2_DEFAULTS.memoryCost,
  timeCost: ARGON2_DEFAULTS.timeCost,
  parallelism: ARGON2_DEFAULTS.parallelism,
  outputLength: 32,
} as const;

/**
 * Blind-relay cipher verification challenge stored on a Space (or channel).
 * Structurally identical to `@adieuu/shared`'s `CipherCheck` (kept local so
 * `@adieuu/crypto` has no dependency on `@adieuu/shared`).
 */
export interface SpaceCipherCheck {
  /** Short random plaintext (base64url). */
  knownValue: string;
  /** `knownValue` encrypted under the per-Space key (base64). */
  encryptedKnownValue: string;
  /** AEAD nonce (base64). */
  nonce: string;
}

function requireSpaceId(spaceId: string): void {
  if (!spaceId || spaceId.length < 8) {
    // Space `_id` is a 24-hex ObjectId; also serves as the Argon2 salt (>= 8 bytes).
    throw new Error('deriveSpaceCipherKey requires a Space id of at least 8 characters');
  }
}

/**
 * Derives the per-Space AEAD key for a Community Cipher.
 *
 * Two-stage: HKDF bind (salt = spaceId) then Argon2id harden (salt = spaceId).
 * Deterministic for a given (cipher, spaceId): the same inputs always yield the
 * same key, which is what makes the blind-relay challenge verifiable.
 *
 * Expensive (memory-hard) by design — derive once per (Cipher, Space) and cache.
 *
 * @param cipher - The derived Community Cipher (holds key + profile).
 * @param spaceId - The Space `_id` (hex string); used as HKDF + Argon2 salt.
 * @returns 32-byte per-Space key.
 */
export async function deriveSpaceCipherKey(
  cipher: CommunityCipher,
  spaceId: string,
): Promise<Uint8Array> {
  requireSpaceId(spaceId);

  const saltBytes = toBytes(spaceId);

  // Stage 1 — HKDF bind the Cipher key to this Space.
  const bound = deriveKey(
    { ikm: cipher.key, salt: saltBytes, info: SPACE_CIPHER_CHECK_INFO, length: 32 },
    cipher.profile,
  );

  // Stage 2 — Argon2id harden. `password` is typed as string, so pass the bound
  // key material as base64 (deterministic, full entropy preserved).
  return deriveKeyFromPassword({
    password: toBase64(bound),
    salt: saltBytes,
    memoryCost: SPACE_CIPHER_CHECK_ARGON2.memoryCost,
    timeCost: SPACE_CIPHER_CHECK_ARGON2.timeCost,
    parallelism: SPACE_CIPHER_CHECK_ARGON2.parallelism,
    outputLength: SPACE_CIPHER_CHECK_ARGON2.outputLength,
  });
}

/**
 * Generates a random `knownValue` for a new challenge.
 */
export function generateKnownValue(): string {
  return toBase64Url(randomBytes(CIPHER_CHECK_KNOWN_VALUE_BYTES));
}

/**
 * Builds a blind-relay challenge for a Space using a Community Cipher.
 *
 * Run at Space (or channel) creation. Upload the returned challenge verbatim to
 * the server; store the local `spaceId -> cipherId` link and cache the derived
 * per-Space key client-side.
 *
 * @param cipher - Community Cipher to bind.
 * @param spaceId - Space `_id`.
 * @param options.knownValue - Override the random plaintext (tests/determinism).
 * @param options.spaceKey - Pre-derived per-Space key to reuse (avoids re-deriving).
 */
export async function createCipherCheck(
  cipher: CommunityCipher,
  spaceId: string,
  options?: { knownValue?: string; spaceKey?: Uint8Array },
): Promise<SpaceCipherCheck> {
  const knownValue = options?.knownValue ?? generateKnownValue();
  const spaceKey = options?.spaceKey ?? (await deriveSpaceCipherKey(cipher, spaceId));

  const { ciphertext, nonce } = encrypt(spaceKey, toBytes(knownValue), cipher.profile);

  return {
    knownValue,
    encryptedKnownValue: toBase64(ciphertext),
    nonce: toBase64(nonce),
  };
}

/**
 * Verifies that a Community Cipher matches a Space's challenge by decrypting
 * `encryptedKnownValue` and comparing (constant-time) to `knownValue`.
 *
 * @param cipher - Candidate Community Cipher.
 * @param spaceId - Space `_id`.
 * @param check - The server-stored challenge.
 * @param options.spaceKey - Pre-derived per-Space key to reuse.
 * @returns true when the Cipher can decrypt the Space.
 */
export async function verifyCipherCheck(
  cipher: CommunityCipher,
  spaceId: string,
  check: SpaceCipherCheck,
  options?: { spaceKey?: Uint8Array },
): Promise<boolean> {
  let spaceKey: Uint8Array;
  try {
    spaceKey = options?.spaceKey ?? (await deriveSpaceCipherKey(cipher, spaceId));
  } catch {
    return false;
  }

  try {
    const plaintext = decrypt(
      spaceKey,
      fromBase64(check.encryptedKnownValue),
      fromBase64(check.nonce),
      cipher.profile,
    );
    return constantTimeEqual(plaintext, toBytes(check.knownValue));
  } catch {
    // AEAD auth failure (wrong key) or malformed challenge.
    return false;
  }
}

/**
 * Join-time detection: returns the first candidate Cipher whose per-Space key
 * decrypts the Space's challenge, or null when none match.
 *
 * Iterates candidates sequentially (each derivation is memory-hard); callers
 * should keep the candidate set small (e.g. the identity's stored Ciphers).
 */
export async function detectSpaceCipher<T extends CommunityCipher>(
  ciphers: readonly T[],
  spaceId: string,
  check: SpaceCipherCheck,
): Promise<T | null> {
  for (const cipher of ciphers) {
    if (await verifyCipherCheck(cipher, spaceId, check)) {
      return cipher;
    }
  }
  return null;
}
