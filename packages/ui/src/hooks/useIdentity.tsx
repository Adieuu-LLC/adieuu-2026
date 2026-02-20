import { useState, useCallback, useEffect, createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type PublicIdentity } from '@adieuu/shared';
import { deriveEntropyWrappingKey, generateWrappingSalt, fromBase64, toBase64 } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';

// ============================================================================
// Wrapping Key Storage (IndexedDB)
// ============================================================================

const WRAPPING_KEY_DB_NAME = 'adieuu-wrapping-keys';
const WRAPPING_KEY_DB_VERSION = 1;
const WRAPPING_KEY_STORE_NAME = 'salts';

/**
 * Opens the wrapping key salt database.
 */
function openWrappingKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WRAPPING_KEY_DB_NAME, WRAPPING_KEY_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WRAPPING_KEY_STORE_NAME)) {
        db.createObjectStore(WRAPPING_KEY_STORE_NAME, { keyPath: 'identityId' });
      }
    };
  });
}

/**
 * Gets or creates the wrapping key salt for an identity.
 */
async function getOrCreateWrappingSalt(identityId: string): Promise<Uint8Array> {
  const db = await openWrappingKeyDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRAPPING_KEY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WRAPPING_KEY_STORE_NAME);
    const getRequest = store.get(identityId);

    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      if (getRequest.result?.salt) {
        resolve(fromBase64(getRequest.result.salt));
      } else {
        // Generate new salt
        const salt = generateWrappingSalt();
        const putRequest = store.put({ identityId, salt: toBase64(salt) });
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve(salt);
      }
    };
  });
}

// ============================================================================
// Identity State Types
// ============================================================================

export type IdentityStatus = 'loading' | 'logged_in' | 'logged_out' | 'no_identity';

export interface IdentityState {
  status: IdentityStatus;
  identity: PublicIdentity | null;
  /** Whether the user has created at least one identity (but may not be logged in) */
  hasIdentity: boolean;
  /** Number of identities the user has created */
  identityCount: number;
  /** Maximum number of identities allowed */
  maxIdentities: number;
  /** Whether the user can create more identities */
  canCreateMore: boolean;
}

export interface CreateIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'USERNAME_TAKEN' | 'MAX_IDENTITIES' | 'VALIDATION_ERROR';
}

export interface LoginIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'LOCKED_OUT' | 'RATE_LIMITED';
  attemptNumber?: number;
  retryAfter?: number;
}

export interface IdentityContextValue extends IdentityState {
  /** Create a new identity */
  createIdentity: (passphrase: string, username: string, displayName: string) => Promise<CreateIdentityResult>;
  /** Login to identity with passphrase */
  loginToIdentity: (passphrase: string) => Promise<LoginIdentityResult>;
  /** Logout from identity (but stay logged in as user) */
  logoutFromIdentity: () => Promise<void>;
  /** Delete the current identity */
  deleteIdentity: () => Promise<{ success: boolean; error?: string }>;
  /** Refresh identity session status */
  refreshIdentitySession: () => Promise<void>;
  /**
   * Get the entropy wrapping key for the current identity session.
   * Returns null if not logged in or key not yet derived.
   * Used by cipher store to encrypt/decrypt entropy at rest.
   */
  getWrappingKey: () => Uint8Array | null;
  /**
   * Get the wrapping salt for the current identity.
   * Returns null if not logged in.
   */
  getWrappingSalt: () => Uint8Array | null;
}

// ============================================================================
// Identity Context
// ============================================================================

const IdentityContext = createContext<IdentityContextValue | null>(null);

// ============================================================================
// Identity Hook
// ============================================================================

/**
 * Hook to access identity state and methods.
 * Must be used within an IdentityProvider.
 */
export function useIdentity(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error('useIdentity must be used within an IdentityProvider');
  }
  return context;
}

/**
 * Internal hook that manages identity state.
 */
function useIdentityState(): IdentityContextValue {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus, session } = useAuth();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  // Derive identity counts from auth session
  const identityCount = session?.identityCount ?? 0;
  const maxIdentities = session?.maxIdentities ?? 1;
  const hasIdentity = identityCount > 0;
  const canCreateMore = identityCount < maxIdentities;

  const [state, setState] = useState<IdentityState>({
    status: 'loading',
    identity: null,
    hasIdentity: false,
    identityCount: 0,
    maxIdentities: 1,
    canCreateMore: true,
  });

  // Wrapping key for cipher entropy encryption (kept in memory only)
  const wrappingKeyRef = useRef<Uint8Array | null>(null);
  const wrappingSaltRef = useRef<Uint8Array | null>(null);

  // Getters for wrapping key (used by cipher store)
  const getWrappingKey = useCallback(() => wrappingKeyRef.current, []);
  const getWrappingSalt = useCallback(() => wrappingSaltRef.current, []);

  // Clear wrapping key on logout
  const clearWrappingKey = useCallback(() => {
    if (wrappingKeyRef.current) {
      // Zero out the key material for security
      wrappingKeyRef.current.fill(0);
      wrappingKeyRef.current = null;
    }
    wrappingSaltRef.current = null;
  }, []);

  // Check identity session status
  const refreshIdentitySession = useCallback(async () => {
    // Only check if user is authenticated
    if (authStatus !== 'authenticated') {
      setState({
        status: 'logged_out',
        identity: null,
        hasIdentity: false,
        identityCount: 0,
        maxIdentities: 1,
        canCreateMore: true,
      });
      return;
    }

    try {
      const response = await api.identity.getSession();

      if (response.success && response.data) {
        setState({
          status: 'logged_in',
          identity: response.data,
          hasIdentity,
          identityCount,
          maxIdentities,
          canCreateMore,
        });
      } else {
        // Not logged into identity, but might have one
        setState({
          status: hasIdentity ? 'logged_out' : 'no_identity',
          identity: null,
          hasIdentity,
          identityCount,
          maxIdentities,
          canCreateMore,
        });
      }
    } catch {
      setState({
        status: hasIdentity ? 'logged_out' : 'no_identity',
        identity: null,
        hasIdentity,
        identityCount,
        maxIdentities,
        canCreateMore,
      });
    }
  }, [api, authStatus, hasIdentity, identityCount, maxIdentities, canCreateMore]);

  // Check identity session when auth status or identity counts change
  useEffect(() => {
    if (authStatus === 'authenticated') {
      refreshIdentitySession();
    } else if (authStatus === 'unauthenticated') {
      setState({
        status: 'logged_out',
        identity: null,
        hasIdentity: false,
        identityCount: 0,
        maxIdentities: 1,
        canCreateMore: true,
      });
    }
  }, [authStatus, refreshIdentitySession, identityCount]);

  const createIdentity = useCallback(
    async (passphrase: string, username: string, displayName: string): Promise<CreateIdentityResult> => {
      const response = await api.identity.create({ passphrase, username, displayName });

      if (!response.success) {
        const errorMessage = response.error?.message ?? 'Failed to create identity';
        let errorCode: CreateIdentityResult['errorCode'];

        if (errorMessage.includes('taken')) {
          errorCode = 'USERNAME_TAKEN';
        } else if (errorMessage.includes('maximum')) {
          errorCode = 'MAX_IDENTITIES';
        } else {
          errorCode = 'VALIDATION_ERROR';
        }

        return {
          success: false,
          error: errorMessage,
          errorCode,
        };
      }

      // Update state with the new identity - note: identityCount will be refreshed from auth session
      setState((prev) => ({
        ...prev,
        status: 'no_identity', // Still need to login
        identity: null,
        hasIdentity: true,
        identityCount: prev.identityCount + 1,
        canCreateMore: prev.identityCount + 1 < prev.maxIdentities,
      }));

      return {
        success: true,
        identity: response.data,
      };
    },
    [api]
  );

  const loginToIdentity = useCallback(
    async (passphrase: string): Promise<LoginIdentityResult> => {
      const response = await api.identity.login({ passphrase });

      if (!response.success) {
        const errorMessage = response.error?.message ?? 'Invalid passphrase';
        let errorCode: LoginIdentityResult['errorCode'] = 'INVALID_PASSPHRASE';

        if (response.error?.code === 'LOCKED_OUT' || errorMessage.includes('locked')) {
          errorCode = 'LOCKED_OUT';
        } else if (response.error?.code === 'RATE_LIMITED' || errorMessage.includes('wait')) {
          errorCode = 'RATE_LIMITED';
        }

        return {
          success: false,
          error: errorMessage,
          errorCode,
        };
      }

      // Update state with the identity
      const loggedInIdentity = response.data?.identity;
      if (loggedInIdentity) {
        // Derive wrapping key for cipher entropy encryption
        try {
          const salt = await getOrCreateWrappingSalt(loggedInIdentity.id);
          const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
          wrappingKeyRef.current = wrappingKey;
          wrappingSaltRef.current = salt;
        } catch (err) {
          console.warn('Failed to derive wrapping key:', err);
          // Non-fatal: ciphers will work but entropy won't be encrypted
        }

        setState((prev) => ({
          ...prev,
          status: 'logged_in',
          identity: loggedInIdentity,
          hasIdentity: true,
        }));

        return {
          success: true,
          identity: loggedInIdentity,
        };
      }

      return {
        success: false,
        error: 'Unexpected response',
      };
    },
    [api]
  );

  const logoutFromIdentity = useCallback(async () => {
    await api.identity.logout();
    clearWrappingKey();
    setState((prev) => ({
      ...prev,
      status: prev.hasIdentity ? 'logged_out' : 'no_identity',
      identity: null,
    }));
  }, [api, clearWrappingKey]);

  const deleteIdentity = useCallback(async () => {
    const response = await api.identity.delete();

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Failed to delete identity',
      };
    }

    // Note: identityCount doesn't decrement on delete (per user requirement)
    setState((prev) => ({
      ...prev,
      status: 'no_identity',
      identity: null,
      // hasIdentity stays true because identityCount doesn't decrement
    }));

    return { success: true };
  }, [api]);

  return {
    ...state,
    createIdentity,
    loginToIdentity,
    logoutFromIdentity,
    deleteIdentity,
    refreshIdentitySession,
    getWrappingKey,
    getWrappingSalt,
  };
}

// ============================================================================
// Identity Provider Component
// ============================================================================

export interface IdentityProviderProps {
  children: ReactNode;
}

/**
 * Provider component that supplies identity state to the app.
 * Must be nested inside an AuthProvider.
 */
export function IdentityProvider({ children }: IdentityProviderProps) {
  const identityState = useIdentityState();

  return <IdentityContext.Provider value={identityState}>{children}</IdentityContext.Provider>;
}
