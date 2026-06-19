import { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  deriveCommunityCipher,
  createTextEntropy,
  createFileEntropy,
  createUrlEntropy,
  verifyCipherEntropy,
  shortCipherId,
  wrapEntropy,
  type EntropyPiece,
  type CommunityCipher,
  type CryptoProfile,
  type WrappedEntropy,
} from '@adieuu/crypto';
import { useIdentity } from './useIdentity';
import {
  deleteStoredCipher,
  getStoredCipherById,
  getStoredCiphers,
  saveStoredCipher,
} from '../services/cipherStoreDb';
import { decryptStoredEntropy } from '../services/cipherStoreOperations';

// ============================================================================
// Cipher Store Types
// ============================================================================

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
  /** Associated Space ID (if known) */
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
export interface DecryptedCipher extends Omit<StoredCipher, 'entropyPieces' | 'encryptedEntropy'> {
  /** Decrypted entropy pieces (in memory only) */
  entropyPieces: EntropyPiece[];
}

/**
 * Input for creating a new cipher.
 */
export interface CreateCipherInput {
  name: string;
  entropyPieces: EntropyPiece[];
  spaceId?: string;
  epochId?: string;
  profile?: CryptoProfile;
}

/**
 * Input for updating a cipher.
 *
 * When entropy pieces are changed, the cipher key and cipherId will be
 * re-derived. This is expected for epoch rotation use cases. The UI should
 * warn users that changing entropy will change the cipher.
 */
export interface UpdateCipherInput {
  /** New name (optional) */
  name?: string;
  /**
   * Updated entropy pieces (optional).
   * WARNING: Changing entropy re-derives the cipher key and cipherId.
   * Content encrypted with the old cipher will NOT decrypt with the new one.
   */
  entropyPieces?: EntropyPiece[];
  /** Associated Space ID (optional, use null to clear) */
  spaceId?: string | null;
  /** Epoch identifier (optional, use null to clear) */
  epochId?: string | null;
}

/**
 * Cipher store state.
 */
export interface CipherStoreState {
  /** Loading state */
  loading: boolean;
  /** All stored ciphers for the current identity (with decrypted entropy) */
  ciphers: DecryptedCipher[];
  /** Error message if any */
  error: string | null;
}

export interface CipherStoreContextValue extends CipherStoreState {
  /** Create a new cipher from entropy */
  createCipher: (input: CreateCipherInput) => Promise<{ success: boolean; cipher?: DecryptedCipher; error?: string }>;
  /** Delete a cipher by ID */
  deleteCipher: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** Rename a cipher */
  renameCipher: (id: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  /** Update cipher (name, entropy, spaceId, epochId). Changing entropy re-derives the cipher. */
  updateCipher: (id: string, input: UpdateCipherInput) => Promise<{ success: boolean; error?: string }>;
  /** Duplicate a cipher with a new name */
  duplicateCipher: (id: string, newName: string) => Promise<{ success: boolean; cipher?: DecryptedCipher; error?: string }>;
  /** Get a cipher by ID */
  getCipherById: (id: string) => DecryptedCipher | undefined;
  /** Get a derived cipher key by ID (for encryption/decryption) */
  getCipherKey: (id: string) => CommunityCipher | null;
  /** Update last used timestamp */
  touchCipher: (id: string) => Promise<void>;
  /** Verify entropy matches an existing cipher */
  verifyCipherById: (id: string, entropyPieces: EntropyPiece[]) => boolean;
  /** Refresh ciphers from storage */
  refresh: () => Promise<void>;
  /** Whether entropy encryption is available (wrapping key is present) */
  encryptionAvailable: boolean;
}

// ============================================================================
// Cipher Store Context
// ============================================================================

const CipherStoreContext = createContext<CipherStoreContextValue | null>(null);

/**
 * Hook to access cipher store state and methods.
 * Must be used within a CipherStoreProvider.
 */
export function useCipherStore(): CipherStoreContextValue {
  const context = useContext(CipherStoreContext);
  if (!context) {
    throw new Error('useCipherStore must be used within a CipherStoreProvider');
  }
  return context;
}

/**
 * Generate a unique ID for a new cipher.
 */
function generateId(): string {
  return `cipher-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Internal hook that manages cipher state.
 */
function useCipherStoreState(): CipherStoreContextValue {
  const { identity, status: identityStatus, getWrappingKey, getWrappingSalt } = useIdentity();

  const [state, setState] = useState<CipherStoreState>({
    loading: true,
    ciphers: [],
    error: null,
  });

  // Derived cipher keys cache (kept in memory, not stored)
  const cipherKeysRef = useMemo(() => new Map<string, CommunityCipher>(), []);

  // Current identity ID
  const identityId = identity?.id;

  // Check if encryption is available
  const encryptionAvailable = getWrappingKey() !== null && getWrappingSalt() !== null;

  /**
   * Decrypt a stored cipher's encrypted entropy.
   */
  const decryptCipherEntropy = useCallback(
    async (stored: StoredCipher): Promise<EntropyPiece[]> => {
      return decryptStoredEntropy(stored.encryptedEntropy, getWrappingKey());
    },
    [getWrappingKey]
  );

  // Load ciphers when identity changes
  const loadCiphers = useCallback(async () => {
    if (!identityId) {
      setState({ loading: false, ciphers: [], error: null });
      cipherKeysRef.clear();
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const storedCiphers = (await getStoredCiphers(identityId)) as StoredCipher[];

      // Decrypt entropy and derive keys for all ciphers
      cipherKeysRef.clear();
      const decryptedCiphers: DecryptedCipher[] = [];

      for (const stored of storedCiphers) {
        try {
          const entropy = await decryptCipherEntropy(stored);

          // Derive the cipher key
          const derived = deriveCommunityCipher(entropy, stored.profile);
          cipherKeysRef.set(stored.id, derived);

          // Create decrypted cipher for state
          const decrypted: DecryptedCipher = {
            id: stored.id,
            name: stored.name,
            identityId: stored.identityId,
            spaceId: stored.spaceId,
            epochId: stored.epochId,
            entropyPieces: entropy,
            cipherId: stored.cipherId,
            shortId: stored.shortId,
            profile: stored.profile,
            createdAt: stored.createdAt,
            lastUsedAt: stored.lastUsedAt,
          };
          decryptedCiphers.push(decrypted);
        } catch (err) {
          console.warn(`Failed to load cipher ${stored.id}:`, err);
        }
      }

      setState({ loading: false, ciphers: decryptedCiphers, error: null });
    } catch (err) {
      setState({
        loading: false,
        ciphers: [],
        error: err instanceof Error ? err.message : 'Failed to load ciphers',
      });
    }
  }, [identityId, cipherKeysRef, decryptCipherEntropy]);

  // Load ciphers when identity changes
  useEffect(() => {
    if (identityStatus === 'logged_in' && identityId) {
      loadCiphers();
    } else {
      setState({ loading: false, ciphers: [], error: null });
      cipherKeysRef.clear();
    }
  }, [identityStatus, identityId, loadCiphers, cipherKeysRef]);

  const createCipher = useCallback(
    async (input: CreateCipherInput) => {
      if (!identityId) {
        return { success: false, error: 'Not logged into an identity' };
      }

      if (!input.name.trim()) {
        return { success: false, error: 'Cipher name is required' };
      }

      if (input.entropyPieces.length === 0) {
        return { success: false, error: 'At least one entropy piece is required' };
      }

      try {
        // Require wrapping key for encryption
        const wrappingKey = getWrappingKey();
        const salt = getWrappingSalt();

        if (!wrappingKey || !salt) {
          return { success: false, error: 'Cannot create cipher: encryption key not available' };
        }

        // Derive the cipher
        const profile = input.profile ?? 'default';
        const derived = deriveCommunityCipher(input.entropyPieces, profile);

        const now = new Date().toISOString();
        const id = generateId();

        // Encrypt entropy
        const encryptedEntropy = await wrapEntropy(input.entropyPieces, wrappingKey, salt);

        const storedCipher: StoredCipher = {
          id,
          name: input.name.trim(),
          identityId,
          spaceId: input.spaceId,
          epochId: input.epochId,
          encryptedEntropy,
          cipherId: derived.cipherId,
          shortId: shortCipherId(derived.cipherId),
          profile,
          createdAt: now,
          lastUsedAt: now,
        };

        // Save to IndexedDB
        await saveStoredCipher(storedCipher);

        // Cache the derived key
        cipherKeysRef.set(id, derived);

        // Create decrypted cipher for state
        const decryptedCipher: DecryptedCipher = {
          id,
          name: input.name.trim(),
          identityId,
          spaceId: input.spaceId,
          epochId: input.epochId,
          entropyPieces: input.entropyPieces,
          cipherId: derived.cipherId,
          shortId: shortCipherId(derived.cipherId),
          profile,
          createdAt: now,
          lastUsedAt: now,
        };

        // Update state
        setState((prev) => ({
          ...prev,
          ciphers: [decryptedCipher, ...prev.ciphers],
        }));

        return { success: true, cipher: decryptedCipher };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create cipher',
        };
      }
    },
    [identityId, cipherKeysRef, getWrappingKey, getWrappingSalt]
  );

  const deleteCipherAction = useCallback(
    async (id: string) => {
      try {
        await deleteStoredCipher(id);
        cipherKeysRef.delete(id);
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.filter((c) => c.id !== id),
        }));
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to delete cipher',
        };
      }
    },
    [cipherKeysRef]
  );

  const renameCipher = useCallback(
    async (id: string, newName: string) => {
      if (!newName.trim()) {
        return { success: false, error: 'Name cannot be empty' };
      }

      try {
        const storedCipher = (await getStoredCipherById(id)) as StoredCipher | undefined;
        if (!storedCipher) {
          return { success: false, error: 'Cipher not found' };
        }

        // Update stored cipher with new name
        const updatedStored = { ...storedCipher, name: newName.trim() };
        await saveStoredCipher(updatedStored);

        // Update only the name in state (keep decrypted entropy intact)
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) =>
            c.id === id ? { ...c, name: newName.trim() } : c
          ),
        }));

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to rename cipher',
        };
      }
    },
    []
  );

  const updateCipher = useCallback(
    async (id: string, input: UpdateCipherInput) => {
      try {
        // Require wrapping key for encryption
        const wrappingKey = getWrappingKey();
        const salt = getWrappingSalt();

        if (!wrappingKey || !salt) {
          return { success: false, error: 'Cannot update cipher: encryption key not available' };
        }

        const storedCipher = (await getStoredCipherById(id)) as StoredCipher | undefined;
        if (!storedCipher) {
          return { success: false, error: 'Cipher not found' };
        }

        // Find the current decrypted cipher to get entropy pieces
        const currentCipher = state.ciphers.find((c) => c.id === id);
        if (!currentCipher) {
          return { success: false, error: 'Cipher not found in state' };
        }

        // Determine final entropy pieces
        const updatedEntropyPieces = input.entropyPieces ?? currentCipher.entropyPieces;

        // Validate entropy
        if (updatedEntropyPieces.length === 0) {
          return { success: false, error: 'At least one entropy piece is required' };
        }

        // Check if entropy actually changed (need to re-derive cipher)
        const entropyChanged = input.entropyPieces !== undefined;

        // Re-derive cipher if entropy changed
        let newCipherId = storedCipher.cipherId;
        let newShortId = storedCipher.shortId;
        if (entropyChanged) {
          const derived = deriveCommunityCipher(updatedEntropyPieces, storedCipher.profile);
          newCipherId = derived.cipherId;
          newShortId = shortCipherId(derived.cipherId);
          // Update the cached key
          cipherKeysRef.set(id, derived);
        }

        // Encrypt entropy
        const encryptedEntropy = await wrapEntropy(updatedEntropyPieces, wrappingKey, salt);

        // Build updated stored cipher
        const updatedStored: StoredCipher = {
          ...storedCipher,
          name: input.name !== undefined ? input.name.trim() : storedCipher.name,
          spaceId: input.spaceId === null ? undefined : (input.spaceId ?? storedCipher.spaceId),
          epochId: input.epochId === null ? undefined : (input.epochId ?? storedCipher.epochId),
          encryptedEntropy,
          cipherId: newCipherId,
          shortId: newShortId,
        };

        await saveStoredCipher(updatedStored);

        // Update state
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: updatedStored.name,
                  spaceId: updatedStored.spaceId,
                  epochId: updatedStored.epochId,
                  entropyPieces: updatedEntropyPieces,
                  cipherId: newCipherId,
                  shortId: newShortId,
                }
              : c
          ),
        }));

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to update cipher',
        };
      }
    },
    [state.ciphers, getWrappingKey, getWrappingSalt, cipherKeysRef]
  );

  const duplicateCipher = useCallback(
    async (id: string, newName: string) => {
      if (!identityId) {
        return { success: false, error: 'Not logged into an identity' };
      }

      if (!newName.trim()) {
        return { success: false, error: 'Name is required' };
      }

      // Find the cipher to duplicate
      const sourceCipher = state.ciphers.find((c) => c.id === id);
      if (!sourceCipher) {
        return { success: false, error: 'Cipher not found' };
      }

      // Create a new cipher with the same entropy
      return createCipher({
        name: newName.trim(),
        entropyPieces: sourceCipher.entropyPieces,
        spaceId: sourceCipher.spaceId,
        epochId: sourceCipher.epochId,
        profile: sourceCipher.profile,
      });
    },
    [identityId, state.ciphers, createCipher]
  );

  const getCipherByIdFromState = useCallback(
    (id: string): DecryptedCipher | undefined => {
      return state.ciphers.find((c) => c.id === id);
    },
    [state.ciphers]
  );

  const getCipherKey = useCallback(
    (id: string): CommunityCipher | null => {
      return cipherKeysRef.get(id) ?? null;
    },
    [cipherKeysRef]
  );

  const touchCipher = useCallback(async (id: string) => {
    try {
      const storedCipher = (await getStoredCipherById(id)) as StoredCipher | undefined;
      if (storedCipher) {
        const newLastUsedAt = new Date().toISOString();
        storedCipher.lastUsedAt = newLastUsedAt;
        await saveStoredCipher(storedCipher);

        // Update only the lastUsedAt in state (keep decrypted entropy intact)
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) =>
            c.id === id ? { ...c, lastUsedAt: newLastUsedAt } : c
          ),
        }));
      }
    } catch {
      // Silently fail touch operations
    }
  }, []);

  const verifyCipherById = useCallback(
    (id: string, entropyPieces: EntropyPiece[]): boolean => {
      const cipher = state.ciphers.find((c) => c.id === id);
      if (!cipher) return false;
      return verifyCipherEntropy(entropyPieces, cipher.cipherId, cipher.profile);
    },
    [state.ciphers]
  );

  return useMemo<CipherStoreContextValue>(
    () => ({
      ...state,
      createCipher,
      deleteCipher: deleteCipherAction,
      renameCipher,
      updateCipher,
      duplicateCipher,
      getCipherById: getCipherByIdFromState,
      getCipherKey,
      touchCipher,
      verifyCipherById,
      refresh: loadCiphers,
      encryptionAvailable,
    }),
    [
      state,
      createCipher,
      deleteCipherAction,
      renameCipher,
      updateCipher,
      duplicateCipher,
      getCipherByIdFromState,
      getCipherKey,
      touchCipher,
      verifyCipherById,
      loadCiphers,
      encryptionAvailable,
    ],
  );
}

// ============================================================================
// Cipher Store Provider Component
// ============================================================================

export interface CipherStoreProviderProps {
  children: ReactNode;
}

/**
 * Provider component that supplies cipher store to the app.
 * Must be nested inside an IdentityProvider.
 */
export function CipherStoreProvider({ children }: CipherStoreProviderProps) {
  const cipherStore = useCipherStoreState();

  return <CipherStoreContext.Provider value={cipherStore}>{children}</CipherStoreContext.Provider>;
}

// ============================================================================
// Utility exports for creating entropy pieces
// ============================================================================

export { createTextEntropy, createFileEntropy, createUrlEntropy };

// ============================================================================
// Direct IDB access for backup export/import
// ============================================================================

export { getStoredCiphers as getStoredCiphersForIdentity };

/**
 * Stores a pre-encrypted StoredCipher record directly.
 * Used by backup import where records are already encrypted with
 * the identity wrapping key.
 */
export async function storePreEncryptedCipher(cipher: StoredCipher): Promise<void> {
  return saveStoredCipher(cipher);
}
