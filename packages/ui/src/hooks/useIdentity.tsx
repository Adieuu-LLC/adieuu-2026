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
    console.debug('[Identity] openWrappingKeyDb: opening database:', WRAPPING_KEY_DB_NAME);
    const request = indexedDB.open(WRAPPING_KEY_DB_NAME, WRAPPING_KEY_DB_VERSION);
    request.onerror = () => {
      console.error('[Identity] openWrappingKeyDb: failed to open database:', request.error);
      reject(request.error);
    };
    request.onsuccess = () => {
      console.debug('[Identity] openWrappingKeyDb: database opened successfully');
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      console.debug('[Identity] openWrappingKeyDb: upgrading database schema...');
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(WRAPPING_KEY_STORE_NAME)) {
        db.createObjectStore(WRAPPING_KEY_STORE_NAME, { keyPath: 'identityId' });
        console.debug('[Identity] openWrappingKeyDb: created object store:', WRAPPING_KEY_STORE_NAME);
      }
    };
  });
}

/**
 * Gets or creates the wrapping key salt for an identity.
 */
async function getOrCreateWrappingSalt(identityId: string): Promise<Uint8Array> {
  console.debug('[Identity] getOrCreateWrappingSalt: opening IndexedDB...');
  const db = await openWrappingKeyDb();
  console.debug('[Identity] getOrCreateWrappingSalt: IndexedDB opened successfully');

  return new Promise((resolve, reject) => {
    const tx = db.transaction(WRAPPING_KEY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WRAPPING_KEY_STORE_NAME);
    const getRequest = store.get(identityId);

    getRequest.onerror = () => {
      console.error('[Identity] getOrCreateWrappingSalt: failed to get salt from IndexedDB:', getRequest.error);
      reject(getRequest.error);
    };
    getRequest.onsuccess = () => {
      if (getRequest.result?.salt) {
        console.debug('[Identity] getOrCreateWrappingSalt: found existing salt for identity');
        resolve(fromBase64(getRequest.result.salt));
      } else {
        console.debug('[Identity] getOrCreateWrappingSalt: no existing salt, generating new one...');
        const salt = generateWrappingSalt();
        const putRequest = store.put({ identityId, salt: toBase64(salt) });
        putRequest.onerror = () => {
          console.error('[Identity] getOrCreateWrappingSalt: failed to store new salt:', putRequest.error);
          reject(putRequest.error);
        };
        putRequest.onsuccess = () => {
          console.debug('[Identity] getOrCreateWrappingSalt: new salt stored successfully');
          resolve(salt);
        };
      }
    };
  });
}


// ============================================================================
// Identity State Types
// ============================================================================

/**
 * Identity session status:
 * - `loading`: Initial state, checking session
 * - `logged_in`: Fully authenticated with wrapping key available
 * - `locked`: Server session valid but wrapping key not available (needs passphrase)
 * - `logged_out`: No active identity session
 * - `no_identity`: User has no identity created yet
 */
export type IdentityStatus = 'loading' | 'logged_in' | 'locked' | 'logged_out' | 'no_identity';

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

export interface UnlockIdentityResult {
  success: boolean;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'NO_SESSION';
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
  errorCode?: 'INVALID_PASSPHRASE' | 'LOCKED_OUT' | 'RATE_LIMITED' | 'KEY_DERIVATION_FAILED';
  attemptNumber?: number;
  retryAfter?: number;
}

export interface IdentityContextValue extends IdentityState {
  /** Create a new identity */
  createIdentity: (passphrase: string, username: string, displayName: string) => Promise<CreateIdentityResult>;
  /** Login to identity with passphrase */
  loginToIdentity: (passphrase: string) => Promise<LoginIdentityResult>;
  /**
   * Unlock a locked identity session by providing the passphrase.
   * Used after page refresh when server session is valid but wrapping key is lost.
   * This is lighter than full login - doesn't hit the server, just derives the key.
   */
  unlockIdentity: (passphrase: string) => Promise<UnlockIdentityResult>;
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
        const identityData = response.data;

        // Check if we have the wrapping key available.
        // The wrapping key is derived from passphrase and kept in memory only.
        // After a page refresh, server session may be valid but wrapping key is lost.
        // In this case, set status to 'locked' - user needs to enter passphrase to unlock.
        if (!wrappingKeyRef.current) {
          setState({
            status: 'locked',
            identity: identityData,
            hasIdentity,
            identityCount,
            maxIdentities,
            canCreateMore,
          });
          return;
        }

        setState({
          status: 'logged_in',
          identity: identityData,
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
        // This is required for cipher operations - fail login if it fails
        try {
          console.debug('[Identity] loginToIdentity: starting wrapping key derivation for identity:', loggedInIdentity.id);

          console.debug('[Identity] loginToIdentity: getting or creating salt...');
          const salt = await getOrCreateWrappingSalt(loggedInIdentity.id);
          console.debug('[Identity] loginToIdentity: salt obtained, length:', salt.length);

          console.debug('[Identity] loginToIdentity: deriving wrapping key with Argon2...');
          const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
          console.debug('[Identity] loginToIdentity: wrapping key derived, length:', wrappingKey.length);

          wrappingKeyRef.current = wrappingKey;
          wrappingSaltRef.current = salt;
          console.debug('[Identity] loginToIdentity: wrapping key stored in memory');
        } catch (err) {
          // Wrapping key is required for cipher operations - treat as login failure
          console.error('[Identity] loginToIdentity: failed to derive wrapping key:', err);
          console.error('[Identity] loginToIdentity: error details:', {
            name: err instanceof Error ? err.name : 'unknown',
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });

          // Logout from server since we can't complete local setup
          try {
            await api.identity.logout();
          } catch {
            // Ignore logout errors
          }

          return {
            success: false,
            error: 'Failed to initialize encryption keys. Please try again.',
            errorCode: 'KEY_DERIVATION_FAILED',
          };
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

  const unlockIdentity = useCallback(
    async (passphrase: string): Promise<UnlockIdentityResult> => {
      // Can only unlock if in locked state
      if (state.status !== 'locked' || !state.identity) {
        return {
          success: false,
          error: 'No locked session to unlock',
          errorCode: 'NO_SESSION',
        };
      }

      try {
        // Derive wrapping key from passphrase (no server call needed)
        console.debug('[Identity] unlockIdentity: starting wrapping key derivation for identity:', state.identity.id);

        console.debug('[Identity] unlockIdentity: getting or creating salt...');
        const salt = await getOrCreateWrappingSalt(state.identity.id);
        console.debug('[Identity] unlockIdentity: salt obtained, length:', salt.length);

        console.debug('[Identity] unlockIdentity: deriving wrapping key with Argon2...');
        const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
        console.debug('[Identity] unlockIdentity: wrapping key derived, length:', wrappingKey.length);

        // Verify the passphrase is correct by attempting to load and decrypt a cipher
        // For now, we trust that if key derivation succeeds, the passphrase is correct
        // The cipher store will fail to decrypt if the passphrase was wrong
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        console.debug('[Identity] unlockIdentity: wrapping key stored in memory');

        setState((prev) => ({
          ...prev,
          status: 'logged_in',
        }));

        return { success: true };
      } catch (err) {
        console.error('[Identity] unlockIdentity: failed to derive wrapping key:', err);
        console.error('[Identity] unlockIdentity: error details:', {
          name: err instanceof Error ? err.name : 'unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to unlock',
          errorCode: 'INVALID_PASSPHRASE',
        };
      }
    },
    [state.status, state.identity]
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
    unlockIdentity,
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
