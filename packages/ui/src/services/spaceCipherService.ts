/**
 * Space cipher orchestration (client-side).
 *
 * Thin, framework-agnostic layer over `@adieuu/crypto`'s per-Space cipher
 * verification primitives. Its two jobs:
 *
 * 1. **Per-Space key cache** — deriving a per-Space key runs a memory-hard
 *    Argon2id (see `deriveSpaceCipherKey`). That cost must be paid only once per
 *    (Cipher, Space); this module caches the derived key in memory so per-message
 *    crypto reuses the fast AEAD key.
 * 2. **Local `spaceId -> cipherId` link** — an in-memory map of which Cipher a
 *    Space is bound to, so we never iterate every Cipher for every message.
 *    Durable persistence lives on `StoredCipher.spaceIds` (bookmarks) in the
 *    cipher store; call {@link registerSpaceCipherLink} after persisting, and
 *    hydrate this map from the store on load.
 *
 * All state here is in-memory only and holds derived key material, so it MUST be
 * cleared on logout / identity switch / local wipe via {@link clearSpaceCipherState}.
 *
 * @module services/spaceCipherService
 */

import {
  createCipherCheck,
  verifyCipherCheck,
  deriveSpaceCipherKey,
  randomBytes,
  toHex,
  type CommunityCipher,
  type SpaceCipherCheck,
} from '@adieuu/crypto';

/** Cache of per-Space AEAD keys, keyed by `${spaceId}:${cipherId}`. */
const spaceKeyCache = new Map<string, Uint8Array>();

/** Local link of `spaceId -> local cipher id` (the cipher store's `StoredCipher.id`). */
const spaceCipherLinks = new Map<string, string>();

/** Local link of `channelId -> local cipher id` for per-channel Cipher overrides. */
const channelCipherLinks = new Map<string, string>();

function keyCacheKey(spaceId: string, cipherId: string): string {
  return `${spaceId}:${cipherId}`;
}

/**
 * Generates a client-side Space id (24-hex, ObjectId-compatible).
 *
 * A Space's cipher challenge is bound to its `_id`, so an E2EE create must know
 * the id before the atomic server create. The server accepts this id verbatim
 * (validated as an ObjectId) so the challenge computed here stays valid.
 */
export function generateSpaceId(): string {
  return toHex(randomBytes(12));
}

/**
 * Returns the per-Space key for a Cipher, deriving (and caching) it on first use.
 *
 * The first call for a given (Cipher, Space) runs Argon2id; subsequent calls are
 * a Map lookup.
 */
export async function getSpaceKey(
  cipher: CommunityCipher,
  spaceId: string,
): Promise<Uint8Array> {
  const cacheKey = keyCacheKey(spaceId, cipher.cipherId);
  const cached = spaceKeyCache.get(cacheKey);
  if (cached) return cached;

  const derived = await deriveSpaceCipherKey(cipher, spaceId);
  spaceKeyCache.set(cacheKey, derived);
  return derived;
}

/**
 * Creates a blind-relay challenge for a Space, reusing the cached per-Space key.
 * Upload the result to the server when creating the Space (or channel).
 */
export async function createSpaceCipherCheck(
  cipher: CommunityCipher,
  spaceId: string,
  options?: { knownValue?: string },
): Promise<SpaceCipherCheck> {
  const spaceKey = await getSpaceKey(cipher, spaceId);
  return createCipherCheck(cipher, spaceId, { ...options, spaceKey });
}

/**
 * Verifies a Cipher against a Space's challenge, reusing the cached per-Space key.
 */
export async function verifySpaceCipherCheck(
  cipher: CommunityCipher,
  spaceId: string,
  check: SpaceCipherCheck,
): Promise<boolean> {
  const spaceKey = await getSpaceKey(cipher, spaceId);
  return verifyCipherCheck(cipher, spaceId, check, { spaceKey });
}

/**
 * Join-time detection: returns the first candidate Cipher that decrypts the
 * Space's challenge, or null when none match. Matching (Cipher, Space) keys are
 * cached as a side effect; failed candidates are evicted after each check.
 */
export async function detectSpaceCipher(
  ciphers: readonly CommunityCipher[],
  spaceId: string,
  check: SpaceCipherCheck,
): Promise<CommunityCipher | null> {
  for (const cipher of ciphers) {
    if (await verifySpaceCipherCheck(cipher, spaceId, check)) {
      return cipher;
    }
    evictSpaceKey(spaceId, cipher.cipherId);
  }
  return null;
}

/** Records the local `spaceId -> local cipher id` link (persist via the cipher store separately). */
export function registerSpaceCipherLink(spaceId: string, cipherLocalId: string): void {
  spaceCipherLinks.set(spaceId, cipherLocalId);
}

/** Returns the local cipher id bound to a Space, or null if unknown. */
export function getSpaceCipherLink(spaceId: string): string | null {
  return spaceCipherLinks.get(spaceId) ?? null;
}

/** Removes the local link for a Space (e.g. on leave). */
export function removeSpaceCipherLink(spaceId: string): void {
  spaceCipherLinks.delete(spaceId);
}

/** Records a per-channel Cipher link (in-memory; re-detected via Cipher gate after reload). */
export function registerChannelCipherLink(channelId: string, cipherLocalId: string): void {
  channelCipherLinks.set(channelId, cipherLocalId);
}

/** Returns the local cipher id bound to a channel, or null if unknown. */
export function getChannelCipherLink(channelId: string): string | null {
  return channelCipherLinks.get(channelId) ?? null;
}

/** Removes the local link for a channel. */
export function removeChannelCipherLink(channelId: string): void {
  channelCipherLinks.delete(channelId);
}

/** Evicts a single cached per-Space key. */
export function evictSpaceKey(spaceId: string, cipherId: string): void {
  spaceKeyCache.delete(keyCacheKey(spaceId, cipherId));
}

/** Evicts all cached per-Space keys for a Space. */
export function clearSpaceKeyCacheForSpace(spaceId: string): void {
  const prefix = `${spaceId}:`;
  for (const key of spaceKeyCache.keys()) {
    if (key.startsWith(prefix)) {
      spaceKeyCache.delete(key);
    }
  }
}

/**
 * Clears all in-memory Space cipher state (derived keys + links).
 * MUST be called on logout, identity switch, and local wipe.
 */
export function clearSpaceCipherState(): void {
  spaceKeyCache.clear();
  spaceCipherLinks.clear();
  channelCipherLinks.clear();
}
