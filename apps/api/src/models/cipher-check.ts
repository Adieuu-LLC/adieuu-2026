/**
 * Blind-relay cipher challenge helpers.
 *
 * The server is a blind relay for E2EE Spaces: it stores and echoes only the
 * `CipherCheck` verification challenge (`knownValue`, `encryptedKnownValue`,
 * `nonce`) and never any Cipher entropy, derived keys, or cipherIds.
 *
 * @module models/cipher-check
 */

import type { CipherCheck } from '@adieuu/shared';

/**
 * Whitelist a stored cipher challenge down to exactly the three public fields.
 *
 * Defense-in-depth for the blind-relay guarantee: request validation already
 * strips unknown keys on write, but public serializers route the stored
 * challenge through this helper so a response can never echo anything beyond the
 * challenge itself — even if a malformed document were somehow persisted.
 */
export function toPublicCipherCheck(cipherCheck: CipherCheck): CipherCheck {
  return {
    knownValue: cipherCheck.knownValue,
    encryptedKnownValue: cipherCheck.encryptedKnownValue,
    nonce: cipherCheck.nonce,
  };
}
