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
  type CommunityCipher,
} from '@adieuu/crypto';
import { useIdentity } from './useIdentity';
import {
  deleteStoredCipher,
  getStoredCipherById,
  getStoredCiphers,
  saveStoredCipher,
} from '../services/cipherStoreDb';
import { decryptStoredEntropy } from '../services/cipherStoreOperations';
import {
  getSpaceCipherLink,
  registerSpaceCipherLink,
  removeSpaceCipherLink,
} from '../services/spaceCipherService';
import {
  normalizeCipherSpaceIds,
  type StoredCipher,
  type DecryptedCipher,
  type CreateCipherInput,
  type UpdateCipherInput,
  type CipherStoreContextValue,
  type CipherStoreState,
} from './cipherStoreTypes';

export type {
  StoredCipher,
  DecryptedCipher,
  CreateCipherInput,
  UpdateCipherInput,
  CipherStoreContextValue,
  CipherStoreState,
} from './cipherStoreTypes';
export { normalizeCipherSpaceIds } from './cipherStoreTypes';

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

          const spaceIds = normalizeCipherSpaceIds(stored);

          // Migrate legacy singular spaceId → spaceIds on read (best-effort rewrite).
          if (stored.spaceId && (!stored.spaceIds || stored.spaceIds.length === 0)) {
            const migrated: StoredCipher = {
              ...stored,
              spaceIds,
            };
            delete migrated.spaceId;
            void saveStoredCipher(migrated).catch(() => {
              /* best-effort */
            });
          }

          // Create decrypted cipher for state
          const decrypted: DecryptedCipher = {
            id: stored.id,
            name: stored.name,
            identityId: stored.identityId,
            ...(spaceIds.length > 0 ? { spaceIds } : {}),
            epochId: stored.epochId,
            entropyPieces: entropy,
            cipherId: stored.cipherId,
            shortId: stored.shortId,
            profile: stored.profile,
            createdAt: stored.createdAt,
            lastUsedAt: stored.lastUsedAt,
          };
          decryptedCiphers.push(decrypted);

          // Hydrate in-memory spaceId → local cipher links from durable bookmarks.
          for (const sid of spaceIds) {
            registerSpaceCipherLink(sid, stored.id);
          }
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
        const spaceIds = input.spaceIds?.length
          ? [...new Set(input.spaceIds.filter(Boolean))]
          : [];

        // Encrypt entropy
        const encryptedEntropy = await wrapEntropy(input.entropyPieces, wrappingKey, salt);

        const storedCipher: StoredCipher = {
          id,
          name: input.name.trim(),
          identityId,
          ...(spaceIds.length > 0 ? { spaceIds } : {}),
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

        for (const sid of spaceIds) {
          registerSpaceCipherLink(sid, id);
        }

        // Create decrypted cipher for state
        const decryptedCipher: DecryptedCipher = {
          id,
          name: input.name.trim(),
          identityId,
          ...(spaceIds.length > 0 ? { spaceIds } : {}),
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

        const prevSpaceIds = normalizeCipherSpaceIds(storedCipher);
        let nextSpaceIds = prevSpaceIds;
        if (input.spaceIds === null) {
          nextSpaceIds = [];
        } else if (input.spaceIds !== undefined) {
          nextSpaceIds = [...new Set(input.spaceIds.filter(Boolean))];
        }

        // Build updated stored cipher (drop legacy singular spaceId).
        const updatedStored: StoredCipher = {
          ...storedCipher,
          name: input.name !== undefined ? input.name.trim() : storedCipher.name,
          ...(nextSpaceIds.length > 0 ? { spaceIds: nextSpaceIds } : {}),
          epochId: input.epochId === null ? undefined : (input.epochId ?? storedCipher.epochId),
          encryptedEntropy,
          cipherId: newCipherId,
          shortId: newShortId,
        };
        delete updatedStored.spaceId;
        if (nextSpaceIds.length === 0) {
          delete updatedStored.spaceIds;
        }

        await saveStoredCipher(updatedStored);

        // Sync in-memory links for removed / added bookmarks.
        for (const sid of prevSpaceIds) {
          if (!nextSpaceIds.includes(sid) && getSpaceCipherLink(sid) === id) {
            removeSpaceCipherLink(sid);
          }
        }
        for (const sid of nextSpaceIds) {
          registerSpaceCipherLink(sid, id);
        }

        // Update state
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: updatedStored.name,
                  spaceIds: nextSpaceIds.length > 0 ? nextSpaceIds : undefined,
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

  const bookmarkSpaceCipher = useCallback(
    async (localCipherId: string, spaceId: string) => {
      if (!spaceId) {
        return { success: false, error: 'Space id is required' };
      }
      const current = state.ciphers.find((c) => c.id === localCipherId);
      if (!current) {
        return { success: false, error: 'Cipher not found' };
      }
      const existing = current.spaceIds ?? [];
      if (existing.includes(spaceId)) {
        registerSpaceCipherLink(spaceId, localCipherId);
        return { success: true };
      }
      return updateCipher(localCipherId, { spaceIds: [...existing, spaceId] });
    },
    [state.ciphers, updateCipher],
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
        spaceIds: sourceCipher.spaceIds,
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

  const findLocalIdByCipherId = useCallback(
    (cipherId: string): string | undefined => {
      return state.ciphers.find((c) => c.cipherId === cipherId)?.id;
    },
    [state.ciphers],
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
      bookmarkSpaceCipher,
      duplicateCipher,
      getCipherById: getCipherByIdFromState,
      findLocalIdByCipherId,
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
      bookmarkSpaceCipher,
      duplicateCipher,
      getCipherByIdFromState,
      findLocalIdByCipherId,
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
