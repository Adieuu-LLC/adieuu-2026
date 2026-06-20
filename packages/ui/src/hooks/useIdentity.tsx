import { useState, useCallback, useEffect, createContext, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  createApiClient,
} from '@adieuu/shared';
import { deriveEntropyWrappingKey, toBase64, clearBytes, getSigningPublicKey, computeRoutingTag } from '@adieuu/crypto';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import {
  generateDeviceKeys,
  decryptKeyBundle,
  getDefaultDeviceName,
  type DeviceKeysResult,
  type DecryptedWebDevice,
} from '../services/e2eKeyService';
import {
  storeDeviceKeys,
  getDeviceKeysForIdentity,
  decryptDeviceKeys,
  hasDeviceKeys,
  getOrCreateWrappingSalt,
  hasSecureStorageBackend,
  deleteAllDeviceKeysForIdentity,
  setLastIdentityUnlockAt,
} from '../services/deviceKeyStorage';
import { generateAndUploadPreKeys } from '../services/preKeyService';
import { crashReporter } from '../services/crashReporter';
import type {
  CreateIdentityResult,
  IdentityContextValue,
  IdentityState,
  LoginIdentityOptions,
  LoginIdentityResult,
  LoginStatus,
  UnlockIdentityOptions,
  UnlockIdentityResult,
  WebDeviceChoice,
} from './useIdentity.types';
import { runCreateIdentityFlow } from '../services/identityCreateFlow';
import { resolveLoginFailure } from '../services/identityLoginFlow';
import { deriveUnlockWrappingKey } from '../services/identityUnlockFlow';
import { attemptPassphraseMigration as attemptPassphraseMigrationFlow } from '../services/passphraseMigrationPrompt';
export type {
  CreateIdentityResult,
  IdentityContextValue,
  IdentityState,
  IdentityStatus,
  LoginIdentityOptions,
  LoginIdentityResult,
  LoginStatus,
  PlatformApiClient,
  SuspensionInfo,
  UnlockIdentityResult,
  WebDeviceChoice,
} from './useIdentity.types';

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
  const { status: authStatus, session, refreshSession } = useAuth();

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
    suspensionInfo: undefined,
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

  // Swap the active in-memory wrapping key (e.g. after a passphrase change
  // re-wraps local material). Zero the previous key before replacing it.
  const updateWrappingKey = useCallback((newWrappingKey: Uint8Array) => {
    if (wrappingKeyRef.current && wrappingKeyRef.current !== newWrappingKey) {
      clearBytes(wrappingKeyRef.current);
    }
    wrappingKeyRef.current = newWrappingKey;
  }, []);
  const getSigningKey = useCallback(() => signingKeyRef.current, []);
  const getCurrentDeviceId = useCallback(() => currentDeviceIdRef.current, []);

  const clearSuspension = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'suspended') return prev;
      return {
        ...prev,
        status: prev.hasIdentity ? 'logged_out' : 'no_identity',
        suspensionInfo: undefined,
      };
    });
  }, []);

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

  const onSessionExpired = useCallback(() => {
    clearSessionKeys();
    setState((prev) => ({
      status: prev.hasIdentity ? 'logged_out' : 'no_identity',
      identity: null,
      hasIdentity: prev.hasIdentity,
      identityCount: prev.identityCount,
      maxIdentities: prev.maxIdentities,
      canCreateMore: prev.canCreateMore,
      suspensionInfo: undefined,
    }));
    void refreshSession();
  }, [clearSessionKeys, refreshSession]);

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl, onSessionExpired }),
    [apiBaseUrl, onSessionExpired],
  );

  // Check identity session status
  const refreshIdentitySession = useCallback(async () => {
    // Only check if user has a valid session of any type.
    // 'authenticated' = account session, 'identity_mode' = identity session.
    if (authStatus !== 'authenticated' && authStatus !== 'identity_mode') {
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

    // `authenticated` means the unified session cookie is an account session (see useAuth refreshSession).
    // There is no identity session in that case — GET /api/identity/session would only return 401.
    // Skip the probe so we avoid redundant traffic and subscription guard noise for unsubscribed accounts.
    if (authStatus === 'authenticated') {
      setState({
        status: hasIdentity ? 'logged_out' : 'no_identity',
        identity: null,
        hasIdentity,
        identityCount,
        maxIdentities,
        canCreateMore,
        suspensionInfo: undefined,
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
        const errorCode = response.error?.code;
        if (errorCode === 'IDENTITY_SUSPENDED' || errorCode === 'IDENTITY_BANNED') {
          const details = response.error?.details;
          clearSessionKeys();
          setState({
            status: 'suspended',
            identity: null,
            hasIdentity,
            identityCount,
            maxIdentities,
            canCreateMore,
            suspensionInfo: {
              type: errorCode === 'IDENTITY_BANNED' ? 'banned' : 'suspended',
              reason: details?.moderationReason,
              reportId: details?.moderationReportId,
              suspendedUntil: details?.suspendedUntil,
            },
          });
          return;
        }

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
  }, [api, authStatus, hasIdentity, identityCount, maxIdentities, canCreateMore, clearSessionKeys]);

  // Check identity session when auth status or identity counts change
  useEffect(() => {
    if (authStatus === 'authenticated' || authStatus === 'identity_mode') {
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
      const freshSession = await refreshSession();
      const signedToken = freshSession?.signedToken;
      if (!signedToken) {
        return { success: false, error: 'Session expired. Please sign in again.', errorCode: 'VALIDATION_ERROR' };
      }

      const flow = await runCreateIdentityFlow(api, platform, signedToken, passphrase, username, displayName);
      if (!flow.ok) return flow.result;

      wrappingKeyRef.current = flow.wrappingKey;
      wrappingSaltRef.current = flow.wrappingSalt;
      signingKeyRef.current = flow.signingPrivateKey;
      currentDeviceIdRef.current = flow.deviceId;

      // Baseline unlock timestamp so a later passphrase change is detected.
      try {
        await setLastIdentityUnlockAt(flow.identity.id);
      } catch (err) {
        console.warn('[Identity] createIdentity: failed to record unlock timestamp (non-fatal):', err);
      }

      setState((prev) => ({
        ...prev,
        status: 'no_identity',
        identity: null,
        hasIdentity: true,
        identityCount: prev.identityCount + 1,
        canCreateMore: prev.identityCount + 1 < prev.maxIdentities,
      }));

      return {
        success: true,
        identity: flow.identity,
      };
    },
    [api, platform, refreshSession]
  );

  // Attempt to re-wrap local key material after a remote passphrase change,
  // prompting the user for their OLD passphrase rather than destroying keys.
  // Returns the recovered deviceId on success, or null if migration is not
  // applicable / was declined / failed (caller falls back to delete+regenerate).
  // The loop lives in `services/passphraseMigrationPrompt` so it can be
  // unit-tested in isolation; this is a stable callback wrapper for it.
  const attemptPassphraseMigration = useCallback(attemptPassphraseMigrationFlow, []);

  const loginToIdentity = useCallback(
    async (passphrase: string, options?: LoginIdentityOptions): Promise<LoginIdentityResult> => {
      const freshSession = await refreshSession();
      const signedToken = freshSession?.signedToken;
      if (!signedToken) {
        return { success: false, error: 'Session expired. Please sign in again.' };
      }

      const onStatus = options?.onStatusChange;
      const onWebDeviceChoice = options?.onWebDeviceChoice;
      
      onStatus?.('authenticating');
      const response = await api.identity.login({ signedToken, passphrase });

      if (!response.success) {
        const errorMessage = response.error?.message ?? 'Invalid passphrase';
        const serverCode = response.error?.code;
        const resolution = resolveLoginFailure(
          errorMessage,
          serverCode,
          response.error?.details
        );
        if (resolution.suspensionInfo) {
          setState((prev) => ({
            ...prev,
            status: 'suspended',
            identity: null,
            suspensionInfo: resolution.suspensionInfo,
          }));
        }
        return resolution.result;
      }

      // Identity cookie is set on the response — sync useAuth before any slow
      // local work so routes (e.g. subscription) see identity_mode immediately.
      await refreshSession();

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
            // Device key decryption failed - likely due to a passphrase change
            // from another session/device. Before destroying the (still valid)
            // keys, offer the user a chance to re-wrap them with their old
            // passphrase so message history stays readable.
            console.warn('[Identity] loginToIdentity: device keys incompatible (passphrase changed?):', err);
            const migrated = await attemptPassphraseMigration(
              loggedInIdentity.id,
              passphrase,
              wrappingKey,
              loggedInIdentity.passphraseChangedAt,
              options?.onMigrationPrompt,
            );
            if (migrated) {
              deviceId = migrated.deviceId;
              console.debug('[Identity] loginToIdentity: keys re-wrapped via migration, deviceId:', deviceId);
            } else {
              // Declined / not applicable / failed: fall through to the
              // "no device keys" path which generates fresh keys.
              try {
                await deleteAllDeviceKeysForIdentity(loggedInIdentity.id);
              } catch (clearErr) {
                console.warn('[Identity] loginToIdentity: failed to clear stale device keys:', clearErr);
              }
            }
          }
        }

        if (!deviceId) {
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
          } else if (!deviceId) {
            // Desktop recovery (defense in depth): before generating brand-new
            // keys, try to restore a previously registered shared web device
            // from the v2 bundle. Only restores a device the server still
            // recognizes; otherwise falls through to fresh keygen.
            try {
              const bundleResponse = await api.identity.getKeyBundle(loggedInIdentity.id);
              if (bundleResponse.success && bundleResponse.data) {
                const decryptedBundle = await decryptKeyBundle(bundleResponse.data, passphrase);
                signingPrivateKey = decryptedBundle.signingPrivateKey;
                bundleAlreadyDecrypted = true;

                if (decryptedBundle.webDevice) {
                  const webDev = decryptedBundle.webDevice;
                  const keysResponse = await api.identity.getPublicKeys(loggedInIdentity.id);
                  const registeredDevices = keysResponse.success ? keysResponse.data?.devices ?? [] : [];
                  const webDeviceRegistered = registeredDevices.some((d) => d.deviceId === webDev.deviceId);

                  if (webDeviceRegistered) {
                    deviceId = webDev.deviceId;
                    await storeDeviceKeys(
                      webDev.deviceId,
                      loggedInIdentity.id,
                      webDev.ecdhPrivateKey,
                      webDev.kemPrivateKey,
                      wrappingKey,
                      computeRoutingTag(webDev.ecdhPublicKey, webDev.kemPublicKey)
                    );
                    console.debug('[Identity] loginToIdentity: desktop restored registered shared web device from bundle');
                  } else {
                    clearWebDeviceKeys(webDev);
                  }
                }
              }
            } catch (err) {
              // Non-fatal: fall through to fresh keygen, which also decrypts the bundle.
              console.warn('[Identity] loginToIdentity: desktop web-device restore failed, will generate fresh:', err);
            }
          }

          // If deviceId was not set yet (desktop, or web user chose individual, or no webDevice in bundle)
          if (!deviceId) {
            onStatus?.('generating_keys');
            // Yield the main thread before heavy ML-KEM lattice computation
            // so the browser can paint the status update and remain responsive.
            await new Promise((resolve) => setTimeout(resolve, 0));

            let newDeviceKeys: DeviceKeysResult;
            try {
              console.debug('[Identity] loginToIdentity: generating individual device keys...');
              newDeviceKeys = generateDeviceKeys(getDefaultDeviceName(), 'default');
              deviceId = newDeviceKeys.deviceId;
            } catch (err) {
              console.error('[Identity] loginToIdentity: failed to generate device keys:', err);
              clearBytes(wrappingKey);
              try { await api.identity.logout(); } catch { /* ignore */ }
              return {
                success: false,
                error: 'Failed to generate device encryption keys. Your browser may not support the required cryptographic operations.',
                errorCode: 'KEY_GENERATION_FAILED',
              };
            }

            onStatus?.('registering_device');
            try {
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
                  error: 'Failed to register device with server. Please try again.',
                  errorCode: 'DEVICE_REGISTRATION_FAILED',
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
              console.error('[Identity] loginToIdentity: failed to register/store device keys:', err);
              clearBytes(wrappingKey);
              try { await api.identity.logout(); } catch { /* ignore */ }
              return {
                success: false,
                error: 'Failed to setup device encryption. Please try again.',
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

        // Cache keys
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        signingKeyRef.current = signingPrivateKey ?? null;
        currentDeviceIdRef.current = deviceId;
        console.debug('[Identity] loginToIdentity: keys cached');

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

        // Record this successful unlock so a future remote passphrase change can
        // be detected (passphraseChangedAt > lastIdentityUnlockAt).
        try {
          await setLastIdentityUnlockAt(loggedInIdentity.id);
        } catch (err) {
          console.warn('[Identity] loginToIdentity: failed to record unlock timestamp (non-fatal):', err);
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
          isNewDevice,
          deviceName: newDeviceName || undefined,
        };
      }

      return {
        success: false,
        error: 'Unexpected response',
      };
    },
    [api, platform, refreshSession, attemptPassphraseMigration]
  );

  const unlockIdentity = useCallback(
    async (passphrase: string, options?: UnlockIdentityOptions): Promise<UnlockIdentityResult> => {
      // Can only unlock if in locked state
      if (state.status !== 'locked' || !state.identity) {
        return {
          success: false,
          error: 'No locked session to unlock',
          errorCode: 'NO_SESSION',
        };
      }

      const identityId = state.identity.id;
      const passphraseChangedAt = state.identity.passphraseChangedAt;

      try {
        const unlockSeed = await deriveUnlockWrappingKey(identityId, passphrase);
        if (!unlockSeed.ok) return unlockSeed.result;
        const { wrappingKey, salt } = unlockSeed;

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
          // Device key decryption failed - could be a passphrase change from
          // another session, or cache corruption. On web, device keys may have
          // been wiped. First offer to re-wrap local keys with the old
          // passphrase so message history survives.
          const migrated = await attemptPassphraseMigration(
            identityId,
            passphrase,
            wrappingKey,
            passphraseChangedAt,
            options?.onMigrationPrompt,
          );
          if (migrated) {
            deviceId = migrated.deviceId;
            deviceKeysLoaded = true;
            console.debug('[Identity] unlockIdentity: keys re-wrapped via migration, deviceId:', deviceId);
          } else if (!hasSecureStorageBackend()) {
            // Web: keep stale records and continue to bundle recovery which is
            // the authoritative passphrase check.
            console.debug('[Identity] unlockIdentity: device keys missing on web, will try bundle recovery');
          } else {
            console.warn('[Identity] unlockIdentity: device keys incompatible (passphrase changed?), will verify via bundle');
            try {
              await deleteAllDeviceKeysForIdentity(identityId);
            } catch (clearErr) {
              console.warn('[Identity] unlockIdentity: failed to clear stale device keys:', clearErr);
            }
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

          // If device keys were not loaded, recover a previously registered
          // shared web device from the bundle before generating fresh keys.
          // Applies to BOTH web and desktop (defense in depth): only restores a
          // device the server still recognizes.
          if (!deviceKeysLoaded && decryptedBundle.webDevice) {
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

          // If device keys still not loaded, generate fresh ones.
          // This handles the case where passphrase was changed from another
          // session/device, making the old device keys un-decryptable.
          if (!deviceKeysLoaded) {
            console.debug('[Identity] unlockIdentity: generating fresh device keys after passphrase change...');
            const newDeviceKeys = generateDeviceKeys(getDefaultDeviceName(), 'default');
            const regResponse = await api.identity.registerDevice(identityId, {
              deviceId: newDeviceKeys.deviceId,
              name: newDeviceKeys.name,
              ecdhPublicKey: newDeviceKeys.ecdhPublicKey,
              kemPublicKey: newDeviceKeys.kemPublicKey,
            });
            if (!regResponse.success) {
              clearBytes(newDeviceKeys.privateKeys.ecdh);
              clearBytes(newDeviceKeys.privateKeys.kem);
              clearBytes(signingPrivateKey);
              clearBytes(wrappingKey);
              return {
                success: false,
                error: 'Failed to register new device keys after passphrase change.',
                errorCode: 'DEVICE_REGISTRATION_FAILED',
              };
            }
            await storeDeviceKeys(
              newDeviceKeys.deviceId,
              identityId,
              newDeviceKeys.privateKeys.ecdh,
              newDeviceKeys.privateKeys.kem,
              wrappingKey,
              newDeviceKeys.routingTag
            );
            deviceId = newDeviceKeys.deviceId;
            deviceKeysLoaded = true;
            console.debug('[Identity] unlockIdentity: fresh device keys generated and registered');

            // Upload pre-keys for the fresh device (forward secrecy parity with
            // loginToIdentity). Without this, FS is degraded until usePreKeys
            // hooks mount and lazily generate them.
            try {
              await generateAndUploadPreKeys({
                identityId,
                deviceId,
                signingPrivateKey,
                wrappingKey,
                platform,
              }, api.identity);
              console.debug('[Identity] unlockIdentity: pre-keys generated and uploaded for fresh device');
            } catch (err) {
              console.warn('[Identity] unlockIdentity: pre-key upload failed (non-fatal):', err);
            }
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

        // Cache keys
        wrappingKeyRef.current = wrappingKey;
        wrappingSaltRef.current = salt;
        signingKeyRef.current = signingPrivateKey;
        currentDeviceIdRef.current = deviceId;
        console.debug('[Identity] unlockIdentity: keys cached');

        // Record this successful unlock for remote passphrase-change detection.
        try {
          await setLastIdentityUnlockAt(identityId);
        } catch (err) {
          console.warn('[Identity] unlockIdentity: failed to record unlock timestamp (non-fatal):', err);
        }

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
    [api, platform, state.status, state.identity, attemptPassphraseMigration]
  );

  const logoutFromIdentity = useCallback(async () => {
    await api.identity.logout();
    clearSessionKeys();
    setState((prev) => ({
      ...prev,
      status: prev.hasIdentity ? 'logged_out' : 'no_identity',
      identity: null,
    }));
    // Identity logout clears the unified cookie. Refresh auth state so the
    // app knows the user is now unauthenticated (must re-login as account).
    await refreshSession();
  }, [api, clearSessionKeys, refreshSession]);

  const deleteIdentity = useCallback(async () => {
    const response = await api.identity.delete();

    if (!response.success) {
      return {
        success: false,
        error: response.error?.message ?? 'Failed to delete identity',
      };
    }

    // Note: identityCount doesn't decrement on delete (per user requirement)
    clearSessionKeys();
    setState((prev) => ({
      ...prev,
      status: 'no_identity',
      identity: null,
      // hasIdentity stays true because identityCount doesn't decrement
    }));

    // Identity session is destroyed on delete; refresh auth to detect cookie state.
    await refreshSession();

    return { success: true };
  }, [api, clearSessionKeys, refreshSession]);

  return useMemo(() => ({
    ...state,
    api,
    createIdentity,
    loginToIdentity,
    unlockIdentity,
    logoutFromIdentity,
    deleteIdentity,
    refreshIdentitySession,
    clearSuspension,
    getWrappingKey,
    getWrappingSalt,
    getSigningKey,
    getCurrentDeviceId,
    updateWrappingKey,
  }), [
    state,
    api,
    createIdentity,
    loginToIdentity,
    unlockIdentity,
    logoutFromIdentity,
    deleteIdentity,
    refreshIdentitySession,
    clearSuspension,
    getWrappingKey,
    getWrappingSalt,
    getSigningKey,
    getCurrentDeviceId,
    updateWrappingKey,
  ]);
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

  useEffect(() => {
    if (identityState.status === 'logged_in' && identityState.identity?.username) {
      crashReporter.setUserContext({ type: 'alias', identifier: identityState.identity.username });
    } else if (identityState.status === 'logged_out' || identityState.status === 'no_identity') {
      crashReporter.setUserContext(null);
    }
  }, [identityState.status, identityState.identity?.username]);

  return <IdentityContext.Provider value={identityState}>{children}</IdentityContext.Provider>;
}
