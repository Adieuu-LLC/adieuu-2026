import { randomBytes } from 'crypto';

export type RandomBytesFn = (size: number) => Buffer;

/**
 * Map a single uniform byte to a uniform index in `[0, alphabetLength)` using rejection
 * sampling, or `null` if the byte should be discarded.
 *
 * Naive `byte % alphabetLength` is uniform only when `alphabetLength` divides 256 (because
 * 256 possible byte values split evenly). When it does not, some indices are slightly more
 * likely. Rejecting bytes `>= limit` removes that bias.
 */
export function tryUniformIndexFromByte(byte: number, alphabetLength: number): number | null {
  if (alphabetLength < 1 || alphabetLength > 256) {
    throw new RangeError('alphabetLength must be between 1 and 256');
  }
  const limit = 256 - (256 % alphabetLength);
  if (byte >= limit) return null;
  return byte % alphabetLength;
}

/**
 * Uniform random integer in `[0, alphabetLength)` using `crypto.randomBytes` and rejection
 * sampling. Unbiased for any `alphabetLength` in `1..256` (single-byte range).
 *
 * @param rng - Optional `randomBytes` implementation (for tests).
 */
export function randomUniformIndex(alphabetLength: number, rng: RandomBytesFn = randomBytes): number {
  if (alphabetLength < 1 || alphabetLength > 256) {
    throw new RangeError('alphabetLength must be between 1 and 256');
  }
  for (;;) {
    const [b] = rng(1);
    const idx = tryUniformIndexFromByte(b, alphabetLength);
    if (idx !== null) return idx;
  }
}
