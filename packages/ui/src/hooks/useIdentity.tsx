import { useState, useCallback, useEffect, createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createApiClient, type PublicIdentity } from '@adieuu/shared';
import { deriveEntropyWrappingKey, generateWrappingSalt, fromBase64, toBase64, clearBytes } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import {
  generateE2EKeys,
  generateDeviceKeys,
  decryptKeyBundle,
  getDefaultDeviceName,
  type E2EInitResult,
} from '../services/e2eKeyService';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
} from '../services/deviceKeyStorage';

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
  errorCode?: 'USERNAME_TAKEN' | 'MAX_IDENTITIES' | 'VALIDATION_ERROR' | 'E2E_INIT_FAILED';
}

export interface LoginIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'LOCKED_OUT' | 'RATE_LIMITED' | 'KEY_DERIVATION_FAILED' | 'E2E_SETUP_FAILED' | 'BUNDLE_DECRYPT_FAILED';
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
  /**
   * Get the signing private key for the current session.
   * Returns null if not logged in or E2E not initialized.
   * Used for signing messages.
   */
  getSigningKey: () => Uint8Array | null;
  /**
   * Get the current device ID.
   * Returns null if not logged in.
   */
  getCurrentDeviceId: () => string | null;
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

  // E2E encryption keys (kept in memory only)
  const signingKeyRef = useRef<Uint8Array | null>(null);
  const currentDeviceIdRef = useRef<string | null>(null);

  // Getters for wrapping key (used by cipher store)
  const getWrappingKey = useCallback(() => wrappingKeyRef.current, []);
  const getWrappingSalt = useCallback(() => wrappingSaltRef.current, []);
  const getSigningKey = useCallback(() => signingKeyRef.current, []);
  const getCurrentDeviceId = useCallback(() => currentDeviceIdRef.current, []);

  // Clear all in-memory keys on logout
  const clearSessionKeys = useCallback(() => {
    if (wrappingKeyRef.current) {
      clearBytes(wrappingKeyRef.current);
      wrappingKeyRef.current = null;
    }
    wrappingSaltRef.current = null;

    if (signingKeyRef.current) {
      clearBytes(signingKeyRef.current);
      signingKeyRef.current = null;
    }
    currentDeviceIdRef.current = null;
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

      const createdIdentity = response.data;
      if (!createdIdentity) {
        return {
          success: false,
          error: 'Identity creation returned no data',
          errorCode: 'VALIDATION_ERROR',
        };
      }

      // Generate E2E encryption keys
      console.debug('[Identity] createIdentity: generating E2E keys for identity:', createdIdentity.id);
      let e2eResult: E2EInitResult;
      try {
        e2eResult = await generateE2EKeys({
          identityId: createdIdentity.id,
          passphrase,
          deviceName: getDefaultDeviceName(),
          cryptoProfile: 'default',
        });
        console.debug('[Identity] createIdentity: E2E keys generated successfully');
      } catch (err) {
        console.error('[Identity] createIdentity: failed to generate E2E keys:', err);
        return {
          success: false,
          error: 'Failed to generate encryption keys',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Upload E2E keys to server
      console.debug('[Identity] createIdentity: uploading E2E keys to server...');
      try {
        const initResponse = await api.identity.initializeE2E(createdIdentity.id, {
          signingPublicKey: e2eResult.signingPublicKey,
          preferredCryptoProfile: 'default',
          device: e2eResult.device,
          bundle: e2eResult.encryptedBundle,
        });

        if (!initResponse.success) {
          console.error('[Identity] createIdentity: failed to upload E2E keys:', initResponse.error);
          // Clear generated keys
          clearBytes(e2eResult.signingPrivateKey);
          clearBytes(e2eResult.devicePrivateKeys.ecdh);
          clearBytes(e2eResult.devicePrivateKeys.kem);
          return {
            success: false,
            error: 'Failed to upload encryption keys to server',
            errorCode: 'E2E_INIT_FAILED',
          };
        }
        console.debug('[Identity] createIdentity: E2E keys uploaded successfully');
      } catch (err) {
        console.error('[Identity] createIdentity: E2E init API error:', err);
        clearBytes(e2eResult.signingPrivateKey);
        clearBytes(e2eResult.devicePrivateKeys.ecdh);
        clearBytes(e2eResult.devicePrivateKeys.kem);
        return {
          success: false,
          error: 'Failed to initialize encryption',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Derive wrapping key for device key storage
      console.debug('[Identity] createIdentity: deriving wrapping key...');
      let wrappingKey: Uint8Array;
      let salt: Uint8Array;
      try {
        salt = await getOrCreateWrappingSalt(createdIdentity.id);
        wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
        console.debug('[Identity] createIdentity: wrapping key derived');
      } catch (err) {
        console.error('[Identity] createIdentity: failed to derive wrapping key:', err);
        clearBytes(e2eResult.signingPrivateKey);
        clearBytes(e2eResult.devicePrivateKeys.ecdh);
        clearBytes(e2eResult.devicePrivateKeys.kem);
        return {
          success: false,
          error: 'Failed to derive wrapping key',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Store device keys in IndexedDB (encrypted with wrapping key)
      console.debug('[Identity] createIdentity: storing device keys in IndexedDB...');
      try {
        await storeDeviceKeys(
          e2eResult.device.deviceId,
          createdIdentity.id,
          e2eResult.devicePrivateKeys.ecdh,
          e2eResult.devicePrivateKeys.kem,
          wrappingKey
        );
        console.debug('[Identity] createIdentity: device keys stored');
      } catch (err) {
        console.error('[Identity] createIdentity: failed to store device keys:', err);
        clearBytes(wrappingKey);
        clearBytes(e2eResult.signingPrivateKey);
        return {
          success: false,
          error: 'Failed to store device keys',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Cache keys in memory
      wrappingKeyRef.current = wrappingKey;
      wrappingSaltRef.current = salt;
      signingKeyRef.current = e2eResult.signingPrivateKey;
      currentDeviceIdRef.current = e2eResult.device.deviceId;

      console.debug('[Identity] createIdentity: E2E initialization complete');

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
        identity: createdIdentity,
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
        let wrappingKey: Uint8Array;
        let salt: Uint8Array;
        try {
          console.debug('[Identity] loginToIdentity: starting wrapping key derivation for identity:', loggedInIdentity.id);

          console.debug('[Identity] loginToIdentity: getting or creating salt...');
          salt = await getOrCreateWrappingSalt(loggedInIdentity.id);
          console.debug('[Identity] loginToIdentity: salt obtained, length:', salt.length);

          console.debug('[Identity] loginToIdentity: deriving wrapping key with Argon2...');
          wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
          console.debug('[Identity] loginToIdentity: wrapping key derived, length:', wrappingKey.length);
        } catch (err) {
          // Wrapping key is required for cipher operations - treat as login failure
          console.error('[Identity] loginToIdentity: failed to derive wrapping key:', err);

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

        // E2E Key Setup: Check if this device has keys or is new
        console.debug('[Identity] loginToIdentity: checking for existing device keys...');
        const hasExistingDeviceKeys = await hasDeviceKeys(loggedInIdentity.id);

        let deviceId: string;

        if (hasExistingDeviceKeys) {
          // Existing device: Load and decrypt device keys
          console.debug('[Identity] loginToIdentity: existing device, loading keys...');
          try {
            const storedKeys = await getDeviceKeysForIdentity(loggedInIdentity.id);
            if (storedKeys.length === 0) {
              throw new Error('No device keys found');
            }
            // Use the first device (most recent)
            const deviceKeys = storedKeys[0];
            if (!deviceKeys) {
              throw new Error('Device key data missing');
            }
            const decryptedKeys = await decryptDeviceKeys(deviceKeys, wrappingKey);
            deviceId = decryptedKeys.deviceId;
            console.debug('[Identity] loginToIdentity: device keys loaded, deviceId:', deviceId);
            
            // Clear decrypted keys from memory (we don't need them cached here, 
            // they'll be loaded on-demand for encryption operations)
            clearBytes(decryptedKeys.ecdhPrivateKey);
            clearBytes(decryptedKeys.kemPrivateKey);
          } catch (err) {
            console.error('[Identity] loginToIdentity: failed to load device keys:', err);
            clearBytes(wrappingKey);
            try {
              await api.identity.logout();
            } catch {
              // Ignore
            }
            return {
              success: false,
              error: 'Failed to load device encryption keys. Try logging in again.',
              errorCode: 'E2E_SETUP_FAILED',
            };
          }
        } else {
          // New device: Generate and register device keys
          console.debug('[Identity] loginToIdentity: new device, generating keys...');
          try {
            const newDeviceKeys = generateDeviceKeys(getDefaultDeviceName(), 'default');
            deviceId = newDeviceKeys.deviceId;

            // Register device with server
            console.debug('[Identity] loginToIdentity: registering device with server...');
            const registerResponse = await api.identity.registerDevice(loggedInIdentity.id, {
              deviceId: newDeviceKeys.deviceId,
              name: newDeviceKeys.name,
              ecdhPublicKey: newDeviceKeys.ecdhPublicKey,
              kemPublicKey: newDeviceKeys.kemPublicKey,
            });

            if (!registerResponse.success) {
              console.error('[Identity] loginToIdentity: failed to register device:', registerResponse.error);
              clearBytes(newDeviceKeys.privateKeys.ecdh);
              clearBytes(newDeviceKeys.privateKeys.kem);
              clearBytes(wrappingKey);
              try {
                await api.identity.logout();
              } catch {
                // Ignore
              }
              return {
                success: false,
                error: 'Failed to register device for encryption',
                errorCode: 'E2E_SETUP_FAILED',
              };
            }

            // Store device keys in IndexedDB
            console.debug('[Identity] loginToIdentity: storing device keys...');
            await storeDeviceKeys(
              newDeviceKeys.deviceId,
              loggedInIdentity.id,
              newDeviceKeys.privateKeys.ecdh,
              newDeviceKeys.privateKeys.kem,
              wrappingKey
            );
            console.debug('[Identity] loginToIdentity: new device registered and keys stored');
          } catch (err) {
            console.error('[Identity] loginToIdentity: failed to setup new device:', err);
            clearBytes(wrappingKey);
            try {
              await api.identity.logout();
            } catch {
              // Ignore
            }
            return {
              success: false,
              error: 'Failed to setup device encryption',
              errorCode: 'E2E_SETUP_FAILED',
            };
          }
        }

        // Fetch and decrypt the signing key bundle
        console.debug('[Identity] loginToIdentity: fetching signing key bundle...');
        let signingPrivateKey: Uint8Array;
        try {
          const bundleResponse = await api.identity.getKeyBundle(loggedInIdentity.id);
          if (!bundleResponse.success || !bundleResponse.data) {
            throw new Error('Failed to fetch key bundle');
          }

          const bundle = bundleResponse.data;
          console.debug('[Identity] loginToIdentity: decrypting signing key bundle...');

          // Use the appropriate passphrase for bundle decryption
          // If useSeparatePassphrase is true, we would need to prompt for it
          // For now, assume same passphrase is used
          if (bundle.useSeparatePassphrase) {
            // TODO: Prompt user for separate bundle passphrase
            console.warn('[Identity] loginToIdentity: separate bundle passphrase not yet supported');
          }

          const decryptedBundle = await decryptKeyBundle(bundle, passphrase);
          signingPrivateKey = decryptedBundle.signingPrivateKey;
          console.debug('[Identity] loginToIdentity: signing key decrypted');
        } catch (err) {
          console.error('[Identity] loginToIdentity: failed to decrypt bundle:', err);
          clearBytes(wrappingKey);
          try {
            await api.identity.logout();
          } catch {
            // Ignore
          }
          return {
            success: false,
            error: 'Failed to decrypt signing key. Check your passphrase.',
            errorCode: 'BUNDLE_DECRYPT_FAILED',
          };
        }

        // Cache keys in memory
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        signingKeyRef.current = signingPrivateKey;
        currentDeviceIdRef.current = deviceId;
        console.debug('[Identity] loginToIdentity: all keys cached in memory');

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

      const identityId = state.identity.id;

      try {
        // Derive wrapping key from passphrase
        console.debug('[Identity] unlockIdentity: starting wrapping key derivation for identity:', identityId);

        console.debug('[Identity] unlockIdentity: getting or creating salt...');
        const salt = await getOrCreateWrappingSalt(identityId);
        console.debug('[Identity] unlockIdentity: salt obtained, length:', salt.length);

        console.debug('[Identity] unlockIdentity: deriving wrapping key with Argon2...');
        const wrappingKey = await deriveEntropyWrappingKey(passphrase, salt);
        console.debug('[Identity] unlockIdentity: wrapping key derived, length:', wrappingKey.length);

        // Load device keys to verify passphrase and get device ID
        console.debug('[Identity] unlockIdentity: loading device keys...');
        let deviceId: string;
        try {
          const storedKeys = await getDeviceKeysForIdentity(identityId);
          if (storedKeys.length === 0) {
            throw new Error('No device keys found');
          }
          const deviceKeys = storedKeys[0];
          if (!deviceKeys) {
            throw new Error('Device key data missing');
          }
          // Attempt to decrypt - this verifies the passphrase is correct
          const decryptedKeys = await decryptDeviceKeys(deviceKeys, wrappingKey);
          deviceId = decryptedKeys.deviceId;
          console.debug('[Identity] unlockIdentity: device keys verified, deviceId:', deviceId);

          // Clear decrypted keys from memory
          clearBytes(decryptedKeys.ecdhPrivateKey);
          clearBytes(decryptedKeys.kemPrivateKey);
        } catch (err) {
          console.error('[Identity] unlockIdentity: failed to decrypt device keys (wrong passphrase?):', err);
          clearBytes(wrappingKey);
          return {
            success: false,
            error: 'Invalid passphrase',
            errorCode: 'INVALID_PASSPHRASE',
          };
        }

        // Fetch and decrypt the signing key bundle
        console.debug('[Identity] unlockIdentity: fetching signing key bundle...');
        let signingPrivateKey: Uint8Array;
        try {
          const bundleResponse = await api.identity.getKeyBundle(identityId);
          if (!bundleResponse.success || !bundleResponse.data) {
            throw new Error('Failed to fetch key bundle');
          }

          const bundle = bundleResponse.data;
          console.debug('[Identity] unlockIdentity: decrypting signing key bundle...');

          if (bundle.useSeparatePassphrase) {
            console.warn('[Identity] unlockIdentity: separate bundle passphrase not yet supported');
          }

          const decryptedBundle = await decryptKeyBundle(bundle, passphrase);
          signingPrivateKey = decryptedBundle.signingPrivateKey;
          console.debug('[Identity] unlockIdentity: signing key decrypted');
        } catch (err) {
          console.error('[Identity] unlockIdentity: failed to decrypt bundle:', err);
          clearBytes(wrappingKey);
          return {
            success: false,
            error: 'Failed to decrypt signing key. Check your passphrase.',
            errorCode: 'INVALID_PASSPHRASE',
          };
        }

        // Cache keys in memory
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        signingKeyRef.current = signingPrivateKey;
        currentDeviceIdRef.current = deviceId;
        console.debug('[Identity] unlockIdentity: all keys cached in memory');

        setState((prev) => ({
          ...prev,
          status: 'logged_in',
        }));

        return { success: true };
      } catch (err) {
        console.error('[Identity] unlockIdentity: failed:', err);
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to unlock',
          errorCode: 'INVALID_PASSPHRASE',
        };
      }
    },
    [api, state.status, state.identity]
  );

  const logoutFromIdentity = useCallback(async () => {
    await api.identity.logout();
    clearSessionKeys();
    setState((prev) => ({
      ...prev,
      status: prev.hasIdentity ? 'logged_out' : 'no_identity',
      identity: null,
    }));
  }, [api, clearSessionKeys]);

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
    getSigningKey,
    getCurrentDeviceId,
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
