/**
 * Identity Encrypted Preferences model.
 *
 * Stores E2E-encrypted identity preferences (including theme selection).
 * The server sees only opaque ciphertext; decryption happens client-side
 * using the entropy wrapping key derived from the identity passphrase.
 *
 * The prefsId is derived as SHA3-256(ident || DOMAIN_SEPARATOR), mirroring
 * the key-bundle pattern to obfuscate identity-preferences relationships.
 *
 * @module models/identity-preferences
 */

import type { BaseDocument } from './base';

export const IDENTITY_PREFS_DOMAIN = 'adieuu-identity-prefs-v1';

export interface IdentityEncryptedPrefsDocument extends BaseDocument {
  prefsId: string;
  encryptedData: string;
  nonce: string;
  schemeVersion: number;
}

export interface CreateIdentityPrefsInput {
  prefsId: string;
  encryptedData: string;
  nonce: string;
  schemeVersion: number;
}

export interface UpdateIdentityPrefsInput {
  encryptedData: string;
  nonce: string;
  schemeVersion?: number;
}
