import { useState, useCallback, useEffect, createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  deriveCommunityCipher,
  createTextEntropy,
  createFileEntropy,
  createUrlEntropy,
  verifyCipherEntropy,
  shortCipherId,
  type EntropyPiece,
  type CommunityCipher,
  type CryptoProfile,
} from '@adieuu/crypto';
import { useIdentity } from './useIdentity';

// ============================================================================
// Cipher Store Types
// ============================================================================

/**
 * Stored cipher record with all metadata.
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
  /** Entropy pieces used to derive this cipher */
  entropyPieces: EntropyPiece[];
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
 * Cipher store state.
 */
export interface CipherStoreState {
  /** Loading state */
  loading: boolean;
  /** All stored ciphers for the current identity */
  ciphers: StoredCipher[];
  /** Error message if any */
  error: string | null;
}

export interface CipherStoreContextValue extends CipherStoreState {
  /** Create a new cipher from entropy */
  createCipher: (input: CreateCipherInput) => Promise<{ success: boolean; cipher?: StoredCipher; error?: string }>;
  /** Delete a cipher by ID */
  deleteCipher: (id: string) => Promise<{ success: boolean; error?: string }>;
  /** Rename a cipher */
  renameCipher: (id: string, newName: string) => Promise<{ success: boolean; error?: string }>;
  /** Get a derived cipher key by ID (for encryption/decryption) */
  getCipherKey: (id: string) => CommunityCipher | null;
  /** Update last used timestamp */
  touchCipher: (id: string) => Promise<void>;
  /** Verify entropy matches an existing cipher */
  verifyCipherById: (id: string, entropyPieces: EntropyPiece[]) => boolean;
  /** Refresh ciphers from storage */
  refresh: () => Promise<void>;
}

// ============================================================================
// IndexedDB Helpers
// ============================================================================

const DB_NAME = 'adieuu-ciphers';
const DB_VERSION = 1;
const STORE_NAME = 'ciphers';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('identityId', 'identityId', { unique: false });
        store.createIndex('cipherId', 'cipherId', { unique: false });
      }
    };
  });
}

async function getAllCiphers(identityId: string): Promise<StoredCipher[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('identityId');
    const request = index.getAll(identityId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const ciphers = request.result as StoredCipher[];
      // Sort by createdAt descending (newest first)
      ciphers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      resolve(ciphers);
    };
  });
}

async function saveCipher(cipher: StoredCipher): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(cipher);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteCipherFromDb(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function getCipherById(id: string): Promise<StoredCipher | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as StoredCipher | undefined);
  });
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
  const { identity, status: identityStatus } = useIdentity();

  const [state, setState] = useState<CipherStoreState>({
    loading: true,
    ciphers: [],
    error: null,
  });

  // Derived cipher keys cache (kept in memory, not stored)
  const cipherKeysRef = useMemo(() => new Map<string, CommunityCipher>(), []);

  // Current identity ID
  const identityId = identity?.id;

  // Load ciphers when identity changes
  const loadCiphers = useCallback(async () => {
    if (!identityId) {
      setState({ loading: false, ciphers: [], error: null });
      cipherKeysRef.clear();
      return;
    }

    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const ciphers = await getAllCiphers(identityId);

      // Re-derive keys for all ciphers
      cipherKeysRef.clear();
      for (const cipher of ciphers) {
        try {
          const derived = deriveCommunityCipher(cipher.entropyPieces, cipher.profile);
          cipherKeysRef.set(cipher.id, derived);
        } catch {
          // If a cipher can't be derived, skip it but log
          console.warn(`Failed to derive cipher ${cipher.id}`);
        }
      }

      setState({ loading: false, ciphers, error: null });
    } catch (err) {
      setState({
        loading: false,
        ciphers: [],
        error: err instanceof Error ? err.message : 'Failed to load ciphers',
      });
    }
  }, [identityId, cipherKeysRef]);

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
        // Derive the cipher
        const profile = input.profile ?? 'default';
        const derived = deriveCommunityCipher(input.entropyPieces, profile);

        const now = new Date().toISOString();
        const id = generateId();

        const storedCipher: StoredCipher = {
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

        // Save to IndexedDB
        await saveCipher(storedCipher);

        // Cache the derived key
        cipherKeysRef.set(id, derived);

        // Update state
        setState((prev) => ({
          ...prev,
          ciphers: [storedCipher, ...prev.ciphers],
        }));

        return { success: true, cipher: storedCipher };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to create cipher',
        };
      }
    },
    [identityId, cipherKeysRef]
  );

  const deleteCipherAction = useCallback(
    async (id: string) => {
      try {
        await deleteCipherFromDb(id);
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
        const cipher = await getCipherById(id);
        if (!cipher) {
          return { success: false, error: 'Cipher not found' };
        }

        const updated = { ...cipher, name: newName.trim() };
        await saveCipher(updated);

        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) => (c.id === id ? updated : c)),
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

  const getCipherKey = useCallback(
    (id: string): CommunityCipher | null => {
      return cipherKeysRef.get(id) ?? null;
    },
    [cipherKeysRef]
  );

  const touchCipher = useCallback(async (id: string) => {
    try {
      const cipher = await getCipherById(id);
      if (cipher) {
        cipher.lastUsedAt = new Date().toISOString();
        await saveCipher(cipher);
        setState((prev) => ({
          ...prev,
          ciphers: prev.ciphers.map((c) => (c.id === id ? cipher : c)),
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

  return {
    ...state,
    createCipher,
    deleteCipher: deleteCipherAction,
    renameCipher,
    getCipherKey,
    touchCipher,
    verifyCipherById,
    refresh: loadCiphers,
  };
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
