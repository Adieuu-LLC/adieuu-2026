/**
 * Types and helpers for the local Community Cipher store (IndexedDB).
 */

import type {
  EntropyPiece,
  CommunityCipher,
  CryptoProfile,
  WrappedEntropy,
} from '@adieuu/crypto';

/**
 * Stored cipher record with all metadata.
 *
 * Entropy is always stored encrypted with identity passphrase-derived key.
 */
export interface StoredCipher {
  /** Unique local ID */
  id: string;
  /** User-friendly name */
  name: string;
  /** Associated identity ID */
  identityId: string;
  /**
   * Bookmarked Space ids this Cipher is known to unlock. Not exclusive —
   * the same Cipher may be bookmarked for many Spaces to speed lookup.
   * Legacy records may still carry singular `spaceId` (migrated on load).
   */
  spaceIds?: string[];
  /** @deprecated Prefer `spaceIds`. Read on load for migration only. */
  spaceId?: string;
  /** Epoch identifier */
  epochId?: string;
  /**
   * Encrypted entropy pieces (wrapped with identity passphrase-derived key).
   * Protects entropy from XSS exfiltration.
   */
  encryptedEntropy: WrappedEntropy;
  /** Cipher ID (derived from key, safe to store) */
  cipherId: string;
  /** Short cipher ID for display */
  shortId: string;
  /** Crypto profile used */
  profile: CryptoProfile;
  /** When this cipher was created */
  createdAt: string;
  /** When this cipher was last used */
  lastUsedAt: string;
}

/**
 * Runtime cipher data with decrypted entropy (never persisted).
 */
export interface DecryptedCipher
  extends Omit<StoredCipher, 'entropyPieces' | 'encryptedEntropy' | 'spaceId'> {
  /** Decrypted entropy pieces (in memory only) */
  entropyPieces: EntropyPiece[];
  spaceIds?: string[];
}

/** Input for creating a new cipher. */
export interface CreateCipherInput {
  name: string;
  entropyPieces: EntropyPiece[];
  /** Optional initial Space bookmark(s). */
  spaceIds?: string[];
  epochId?: string;
  profile?: CryptoProfile;
}

/**
 * Input for updating a cipher.
 *
 * When entropy pieces are changed, the cipher key and cipherId will be
 * re-derived. This is expected for epoch rotation use cases.
 */
export interface UpdateCipherInput {
  name?: string;
  /**
   * Updated entropy pieces (optional).
   * WARNING: Changing entropy re-derives the cipher key and cipherId.
   */
  entropyPieces?: EntropyPiece[];
  /** Replace bookmarked Space ids (use null/[] to clear). */
  spaceIds?: string[] | null;
  epochId?: string | null;
}

/** Normalize durable Space bookmarks, migrating legacy singular `spaceId`. */
export function normalizeCipherSpaceIds(
  stored: Pick<StoredCipher, 'spaceIds' | 'spaceId'>,
): string[] {
  if (stored.spaceIds && stored.spaceIds.length > 0) {
    return [...new Set(stored.spaceIds.filter(Boolean))];
  }
  if (stored.spaceId) return [stored.spaceId];
  return [];
}

export interface CipherStoreState {
  loading: boolean;
  ciphers: DecryptedCipher[];
  error: string | null;
}

export interface CipherStoreContextValue extends CipherStoreState {
  createCipher: (
    input: CreateCipherInput,
  ) => Promise<{ success: boolean; cipher?: DecryptedCipher; error?: string }>;
  deleteCipher: (id: string) => Promise<{ success: boolean; error?: string }>;
  renameCipher: (id: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  updateCipher: (
    id: string,
    input: UpdateCipherInput,
  ) => Promise<{ success: boolean; error?: string }>;
  bookmarkSpaceCipher: (
    localCipherId: string,
    spaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  duplicateCipher: (
    id: string,
    newName: string,
  ) => Promise<{ success: boolean; cipher?: DecryptedCipher; error?: string }>;
  getCipherById: (id: string) => DecryptedCipher | undefined;
  findLocalIdByCipherId: (cipherId: string) => string | undefined;
  getCipherKey: (id: string) => CommunityCipher | null;
  touchCipher: (id: string) => Promise<void>;
  verifyCipherById: (id: string, entropyPieces: EntropyPiece[]) => boolean;
  refresh: () => Promise<void>;
  encryptionAvailable: boolean;
}
