import { useState, useCallback, useEffect, createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  createApiClient,
  type PublicIdentity,
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  jsonUtf8ByteLength,
} from '@adieuu/shared';
import { deriveEntropyWrappingKey, toBase64, clearBytes, getSigningPublicKey, computeRoutingTag } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import {
  generateE2EKeys,
  generateDeviceKeys,
  decryptKeyBundle,
  getDefaultDeviceName,
  type E2EInitResult,
  type DecryptedWebDevice,
} from '../services/e2eKeyService';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
  getOrCreateWrappingSalt,
  hasSecureStorageBackend,
} from '../services/deviceKeyStorage';
import { generateAndUploadPreKeys } from '../services/preKeyService';

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
  errorCode?: 'USERNAME_TAKEN' | 'MAX_IDENTITIES' | 'VALIDATION_ERROR' | 'E2E_INIT_FAILED' | 'PAYLOAD_TOO_LARGE';
}

export interface LoginIdentityResult {
  success: boolean;
  identity?: PublicIdentity;
  error?: string;
  errorCode?: 'INVALID_PASSPHRASE' | 'LOCKED_OUT' | 'RATE_LIMITED' | 'KEY_DERIVATION_FAILED' | 'E2E_SETUP_FAILED' | 'BUNDLE_DECRYPT_FAILED';
  attemptNumber?: number;
  retryAfter?: number;
  /** Whether this was a new device registration (for showing first-login toast) */
  isNewDevice?: boolean;
  /** The device name that was registered */
  deviceName?: string;
}

/** Web device mode choice returned by the onWebDeviceChoice callback. */
export type WebDeviceChoice = 'shared' | 'individual';

/**
 * Login status steps for progress display.
 */
export type LoginStatus = 'authenticating' | 'deriving_keys' | 'loading_device' | 'decrypting_bundle' | 'web_device_choice' | 'complete';

/**
 * Options for loginToIdentity
 */
export interface LoginIdentityOptions {
  /** Callback for status updates during login */
  onStatusChange?: (status: LoginStatus) => void;
  /**
   * Callback invoked on web (no SecureStorage backend) when no cached device
   * keys exist and the shared web device has not been registered yet.
   * The UI should present a modal and resolve with the user's choice.
   * If not provided, defaults to 'individual' (current behavior).
   */
  onWebDeviceChoice?: () => Promise<WebDeviceChoice>;
}

export interface IdentityContextValue extends IdentityState {
  /** Create a new identity */
  createIdentity: (passphrase: string, username: string, displayName: string) => Promise<CreateIdentityResult>;
  /** Login to identity with passphrase */
  loginToIdentity: (passphrase: string, options?: LoginIdentityOptions) => Promise<LoginIdentityResult>;
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

function clearWebDeviceKeys(webDev: DecryptedWebDevice): void {
  clearBytes(webDev.ecdhPrivateKey);
  clearBytes(webDev.kemPrivateKey);
}

/**
 * Internal hook that manages identity state.
 */
function useIdentityState(): IdentityContextValue {
  const { apiBaseUrl, platform } = useAppConfig();
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
        console.log('[Identity] createIdentity: SIGNING KEY DEBUG - public key to upload:', e2eResult.signingPublicKey);
        console.log('[Identity] createIdentity: SIGNING KEY DEBUG - derived from private:', toBase64(getSigningPublicKey(e2eResult.signingPrivateKey)));
      } catch (err) {
        console.error('[Identity] createIdentity: failed to generate E2E keys:', err);
        return {
          success: false,
          error: 'Failed to generate encryption keys',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Web device private keys are encrypted inside the bundle — clear from memory
      clearBytes(e2eResult.webDevice.privateKeys.ecdh);
      clearBytes(e2eResult.webDevice.privateKeys.kem);

      // Verify identity session is established before uploading E2E keys
      console.debug('[Identity] createIdentity: verifying identity session is established...');
      try {
        const sessionCheck = await api.identity.getSession();
        if (!sessionCheck.success || sessionCheck.data?.id !== createdIdentity.id) {
          console.error('[Identity] createIdentity: identity session not established after creation');
          clearBytes(e2eResult.signingPrivateKey);
          clearBytes(e2eResult.devicePrivateKeys.ecdh);
          clearBytes(e2eResult.devicePrivateKeys.kem);
          return {
            success: false,
            error: 'Identity session not established. Please try again.',
            errorCode: 'E2E_INIT_FAILED',
          };
        }
        console.debug('[Identity] createIdentity: identity session verified');
      } catch (err) {
        console.error('[Identity] createIdentity: failed to verify identity session:', err);
        clearBytes(e2eResult.signingPrivateKey);
        clearBytes(e2eResult.devicePrivateKeys.ecdh);
        clearBytes(e2eResult.devicePrivateKeys.kem);
        return {
          success: false,
          error: 'Failed to verify identity session',
          errorCode: 'E2E_INIT_FAILED',
        };
      }

      // Upload E2E keys to server (web device keys are in the bundle but NOT registered as a device yet).
      // Preflight below applies to apps/web and apps/desktop (shared IdentityProvider / App).
      console.debug('[Identity] createIdentity: uploading E2E keys to server...');
      try {
        const initBody = {
          signingPublicKey: e2eResult.signingPublicKey,
          preferredCryptoProfile: 'default' as const,
          device: e2eResult.device,
          bundle: e2eResult.encryptedBundle,
        };
        const initBytes = jsonUtf8ByteLength(initBody);
        if (initBytes > DEFAULT_MAX_REQUEST_BODY_BYTES) {
          clearBytes(e2eResult.signingPrivateKey);
          clearBytes(e2eResult.devicePrivateKeys.ecdh);
          clearBytes(e2eResult.devicePrivateKeys.kem);
          return {
            success: false,
            error: `Encryption setup payload is too large (${(initBytes / 1024).toFixed(1)} KiB; max ${(DEFAULT_MAX_REQUEST_BODY_BYTES / 1024).toFixed(0)} KiB).`,
            errorCode: 'PAYLOAD_TOO_LARGE',
          };
        }
        const initResponse = await api.identity.initializeE2E(createdIdentity.id, initBody);

        if (!initResponse.success) {
          console.error('[Identity] createIdentity: failed to upload E2E keys:', initResponse.error);
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
          wrappingKey,
          e2eResult.device.routingTag
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

      // Generate and upload pre-keys for forward secrecy
      try {
        await generateAndUploadPreKeys({
          identityId: createdIdentity.id,
          deviceId: e2eResult.device.deviceId,
          signingPrivateKey: e2eResult.signingPrivateKey,
          wrappingKey,
          platform,
        }, api.identity);
        console.debug('[Identity] createIdentity: pre-keys generated and uploaded');
      } catch (err) {
        // Non-fatal: device works without pre-keys, FS just won't be available until next attempt
        console.warn('[Identity] createIdentity: pre-key upload failed (non-fatal):', err);
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
    [api, platform]
  );

  const loginToIdentity = useCallback(
    async (passphrase: string, options?: LoginIdentityOptions): Promise<LoginIdentityResult> => {
      const onStatus = options?.onStatusChange;
      const onWebDeviceChoice = options?.onWebDeviceChoice;
      
      onStatus?.('authenticating');
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
        onStatus?.('deriving_keys');
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
        onStatus?.('loading_device');
        console.debug('[Identity] loginToIdentity: checking for existing device keys...');
        const hasExistingDeviceKeys = await hasDeviceKeys(loggedInIdentity.id);

        let deviceId = '';
        let isNewDevice = false;
        let newDeviceName = '';
        let signingPrivateKey: Uint8Array | undefined;
        let bundleAlreadyDecrypted = false;

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
          // No cached device keys — behaviour depends on platform.
          //
          // Desktop (SecureStorage backend): generate a fresh per-device keypair
          //   and register it on the server (existing behaviour).
          //
          // Web (no backend): fetch the bundle first so we can check for a
          //   shared web device. If one is registered, use it automatically.
          //   Otherwise ask the user whether they want shared or individual.

          const isWebApp = !hasSecureStorageBackend();

          if (isWebApp) {
            // --- Web path: try shared web device from bundle ---
            console.debug('[Identity] loginToIdentity: web platform, fetching bundle for web device check...');
            onStatus?.('decrypting_bundle');

            try {
              const bundleResponse = await api.identity.getKeyBundle(loggedInIdentity.id);
              if (!bundleResponse.success || !bundleResponse.data) {
                throw new Error('Failed to fetch key bundle');
              }

              const bundle = bundleResponse.data;
              if (bundle.useSeparatePassphrase) {
                console.warn('[Identity] loginToIdentity: separate bundle passphrase not yet supported');
              }

              const decryptedBundle = await decryptKeyBundle(bundle, passphrase);
              signingPrivateKey = decryptedBundle.signingPrivateKey;
              bundleAlreadyDecrypted = true;

              if (decryptedBundle.webDevice) {
                const webDev = decryptedBundle.webDevice;

                // Check if this web device is already registered on the server
                const keysResponse = await api.identity.getPublicKeys(loggedInIdentity.id);
                const registeredDevices = keysResponse.success ? keysResponse.data?.devices ?? [] : [];
                const webDeviceRegistered = registeredDevices.some((d) => d.deviceId === webDev.deviceId);

                let useShared: boolean;

                if (webDeviceRegistered) {
                  // Already registered — use automatically
                  console.debug('[Identity] loginToIdentity: shared web device already registered, using it');
                  useShared = true;
                } else {
                  // Not registered — ask user
                  onStatus?.('web_device_choice');
                  const choice = onWebDeviceChoice ? await onWebDeviceChoice() : 'individual';
                  useShared = choice === 'shared';

                  if (useShared) {
                    // Register the web device on the server
                    console.debug('[Identity] loginToIdentity: registering shared web device...');
                    const regResponse = await api.identity.registerDevice(loggedInIdentity.id, {
                      deviceId: webDev.deviceId,
                      name: 'Web (shared)',
                      ecdhPublicKey: toBase64(webDev.ecdhPublicKey),
                      kemPublicKey: toBase64(webDev.kemPublicKey),
                    });

                    if (!regResponse.success) {
                      console.error('[Identity] loginToIdentity: failed to register web device:', regResponse.error);
                      clearWebDeviceKeys(webDev);
                      clearBytes(signingPrivateKey!);
                      clearBytes(wrappingKey);
                      try { await api.identity.logout(); } catch { /* ignore */ }
                      return {
                        success: false,
                        error: 'Failed to register shared web device',
                        errorCode: 'E2E_SETUP_FAILED',
                      };
                    }
                  }
                }

                if (useShared) {
                  // Cache web device keys locally so subsequent operations work
                  deviceId = webDev.deviceId;
                  await storeDeviceKeys(
                    webDev.deviceId,
                    loggedInIdentity.id,
                    webDev.ecdhPrivateKey,
                    webDev.kemPrivateKey,
                    wrappingKey,
                    computeRoutingTag(webDev.ecdhPublicKey, webDev.kemPublicKey)
                  );
                  console.debug('[Identity] loginToIdentity: shared web device keys cached in IndexedDB');
                } else {
                  // User chose individual — fall through to generate fresh device
                  clearWebDeviceKeys(webDev);
                }
              }
              // If no webDevice in bundle, fall through to individual device path
            } catch (err) {
              console.error('[Identity] loginToIdentity: failed to decrypt bundle during web device check:', err);
              clearBytes(wrappingKey);
              try { await api.identity.logout(); } catch { /* ignore */ }
              return {
                success: false,
                error: 'Failed to decrypt signing key. Check your passphrase.',
                errorCode: 'BUNDLE_DECRYPT_FAILED',
              };
            }
          }

          // If deviceId was not set yet (desktop, or web user chose individual, or no webDevice in bundle)
          if (!deviceId) {
            console.debug('[Identity] loginToIdentity: generating individual device keys...');
            try {
              const newDeviceKeys = generateDeviceKeys(getDefaultDeviceName(), 'default');
              deviceId = newDeviceKeys.deviceId;

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
                try { await api.identity.logout(); } catch { /* ignore */ }
                return {
                  success: false,
                  error: 'Failed to register device for encryption',
                  errorCode: 'E2E_SETUP_FAILED',
                };
              }

              await storeDeviceKeys(
                newDeviceKeys.deviceId,
                loggedInIdentity.id,
                newDeviceKeys.privateKeys.ecdh,
                newDeviceKeys.privateKeys.kem,
                wrappingKey,
                newDeviceKeys.routingTag
              );
              console.debug('[Identity] loginToIdentity: new device registered and keys stored');

              isNewDevice = true;
              newDeviceName = newDeviceKeys.name;
            } catch (err) {
              console.error('[Identity] loginToIdentity: failed to setup new device:', err);
              clearBytes(wrappingKey);
              try { await api.identity.logout(); } catch { /* ignore */ }
              return {
                success: false,
                error: 'Failed to setup device encryption',
                errorCode: 'E2E_SETUP_FAILED',
              };
            }
          }
        }

        // Fetch and decrypt the signing key bundle (skip if already done in the web path)
        if (!bundleAlreadyDecrypted) {
          onStatus?.('decrypting_bundle');
          console.debug('[Identity] loginToIdentity: fetching signing key bundle...');
          try {
            const bundleResponse = await api.identity.getKeyBundle(loggedInIdentity.id);
            if (!bundleResponse.success || !bundleResponse.data) {
              throw new Error('Failed to fetch key bundle');
            }

            const bundle = bundleResponse.data;
            console.debug('[Identity] loginToIdentity: decrypting signing key bundle...');

            if (bundle.useSeparatePassphrase) {
              console.warn('[Identity] loginToIdentity: separate bundle passphrase not yet supported');
            }

            const decryptedBundle = await decryptKeyBundle(bundle, passphrase);
            signingPrivateKey = decryptedBundle.signingPrivateKey;
            const derivedPublicKey = getSigningPublicKey(signingPrivateKey);
            console.debug('[Identity] loginToIdentity: signing key decrypted');
            console.log('[Identity] loginToIdentity: SIGNING KEY DEBUG - derived public key from bundle:', toBase64(derivedPublicKey));
          } catch (err) {
            console.error('[Identity] loginToIdentity: failed to decrypt bundle:', err);
            clearBytes(wrappingKey);
            try { await api.identity.logout(); } catch { /* ignore */ }
            return {
              success: false,
              error: 'Failed to decrypt signing key. Check your passphrase.',
              errorCode: 'BUNDLE_DECRYPT_FAILED',
            };
          }
        }

        // Cache keys in memory
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        signingKeyRef.current = signingPrivateKey ?? null;
        currentDeviceIdRef.current = deviceId;
        console.debug('[Identity] loginToIdentity: all keys cached in memory');

        // Generate and upload pre-keys for new devices (forward secrecy)
        if (isNewDevice && signingPrivateKey && deviceId) {
          try {
            await generateAndUploadPreKeys({
              identityId: loggedInIdentity.id,
              deviceId,
              signingPrivateKey,
              wrappingKey,
              platform,
            }, api.identity);
            console.debug('[Identity] loginToIdentity: pre-keys generated and uploaded for new device');
          } catch (err) {
            // Non-fatal: device works without pre-keys, FS just won't be available until next attempt
            console.warn('[Identity] loginToIdentity: pre-key upload failed (non-fatal):', err);
          }
        }

        onStatus?.('complete');

        setState((prev) => ({
          ...prev,
          status: 'logged_in',
          identity: loggedInIdentity,
          hasIdentity: true,
        }));

        return {
          success: true,
          identity: loggedInIdentity,
          isNewDevice,
          deviceName: newDeviceName || undefined,
        };
      }

      return {
        success: false,
        error: 'Unexpected response',
      };
    },
    [api, platform]
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
        let deviceId = '';
        let deviceKeysLoaded = false;
        try {
          const storedKeys = await getDeviceKeysForIdentity(identityId);
          if (storedKeys.length === 0) {
            throw new Error('No device keys found');
          }
          const deviceKeys = storedKeys[0];
          if (!deviceKeys) {
            throw new Error('Device key data missing');
          }
          const decryptedKeys = await decryptDeviceKeys(deviceKeys, wrappingKey);
          deviceId = decryptedKeys.deviceId;
          deviceKeysLoaded = true;
          console.debug('[Identity] unlockIdentity: device keys verified, deviceId:', deviceId);

          clearBytes(decryptedKeys.ecdhPrivateKey);
          clearBytes(decryptedKeys.kemPrivateKey);
        } catch (err) {
          // On web, device keys may have been wiped by a cache clear.
          // Try to recover from the bundle if a shared web device was enrolled.
          if (!hasSecureStorageBackend()) {
            console.debug('[Identity] unlockIdentity: device keys missing on web, will try bundle recovery');
          } else {
            console.error('[Identity] unlockIdentity: failed to decrypt device keys (wrong passphrase?):', err);
            clearBytes(wrappingKey);
            return {
              success: false,
              error: 'Invalid passphrase',
              errorCode: 'INVALID_PASSPHRASE',
            };
          }
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

          // If device keys were not loaded (web cache cleared), recover from bundle
          if (!deviceKeysLoaded && !hasSecureStorageBackend() && decryptedBundle.webDevice) {
            const webDev = decryptedBundle.webDevice;
            console.debug('[Identity] unlockIdentity: recovering shared web device keys from bundle');

            // Verify the web device is still registered on the server
            const keysResponse = await api.identity.getPublicKeys(identityId);
            const registeredDevices = keysResponse.success ? keysResponse.data?.devices ?? [] : [];
            const webDeviceRegistered = registeredDevices.some((d) => d.deviceId === webDev.deviceId);

            if (webDeviceRegistered) {
              deviceId = webDev.deviceId;
              await storeDeviceKeys(
                webDev.deviceId,
                identityId,
                webDev.ecdhPrivateKey,
                webDev.kemPrivateKey,
                wrappingKey,
                computeRoutingTag(webDev.ecdhPublicKey, webDev.kemPublicKey)
              );
              deviceKeysLoaded = true;
              console.debug('[Identity] unlockIdentity: web device keys recovered and cached');
            } else {
              clearWebDeviceKeys(webDev);
              console.warn('[Identity] unlockIdentity: web device found in bundle but not registered on server');
            }
          }

          if (!deviceKeysLoaded) {
            clearBytes(signingPrivateKey);
            clearBytes(wrappingKey);
            return {
              success: false,
              error: 'Invalid passphrase',
              errorCode: 'INVALID_PASSPHRASE',
            };
          }
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
