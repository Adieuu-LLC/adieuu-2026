/**
 * Content moderation cryptographic primitives (placeholder).
 *
 * This module defines interfaces and stub implementations for future
 * client-side perceptual hashing against known-bad-hash databases.
 * No actual hashing implementation is included in this build.
 *
 * FUTURE WORK:
 * - Implement perceptual hashing (pHash, dHash, or similar) in a
 *   Web Worker to avoid blocking the main thread
 * - Integrate with known-bad-hash database comparison (format TBD:
 *   could be a local bloom filter, or a privacy-preserving server
 *   lookup using PSI or similar)
 * - Video frame extraction for video perceptual hashing
 *
 * @module crypto/moderation
 */

/**
 * Result of a perceptual hash computation.
 */
export interface PerceptualHashResult {
  /** Algorithm used (e.g. 'phash', 'dhash', 'ahash') */
  algorithm: string;
  /** Hex-encoded hash value */
  hash: string;
}

/**
 * Result of comparing a perceptual hash against a known-bad database.
 */
export interface KnownBadHashCheckResult {
  /** Whether a match was found */
  matched: boolean;
  /** Hamming distance to the closest known-bad hash (lower = closer match) */
  distance?: number;
  /** Category of the matched content (e.g. 'csam', 'terrorism') */
  category?: string;
}

/**
 * Compute a perceptual hash of an image.
 *
 * @throws Error - Always throws "not implemented" in this build.
 *
 * TODO: Implement using a library like blockhash-js or a custom
 * pHash implementation in a Web Worker.
 */
export async function computePerceptualHash(
  _imageData: Uint8Array
): Promise<PerceptualHashResult> {
  throw new Error(
    'Perceptual hashing is not implemented in this build. ' +
    'See packages/crypto/src/moderation/index.ts for planned interface.'
  );
}

/**
 * Check a perceptual hash against a known-bad-hash database.
 *
 * @throws Error - Always throws "not implemented" in this build.
 *
 * TODO: Implement privacy-preserving lookup. Options include:
 * - Client-side bloom filter (downloaded periodically)
 * - Private set intersection (PSI) protocol
 * - k-anonymous hash prefix lookup (similar to HIBP)
 */
export async function checkKnownBadHash(
  _hash: PerceptualHashResult
): Promise<KnownBadHashCheckResult> {
  throw new Error(
    'Known-bad-hash checking is not implemented in this build. ' +
    'See packages/crypto/src/moderation/index.ts for planned interface.'
  );
}
