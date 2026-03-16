/**
 * Pre-Key Lifecycle Hook
 *
 * Manages SPK rotation, OTPK replenishment, retired SPK cleanup,
 * and FS configuration. Provides both automatic lifecycle
 * (on-mount check + in-app timer) and manual rotation for the
 * "panic button" use case.
 *
 * Mount this hook once in the authenticated app shell. It is a no-op
 * when the user is not logged in.
 *
 * @module hooks/usePreKeys
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import {
  checkAndRotateSpk,
  checkAndReplenishOtpks,
  cleanupRetiredSpks,
  loadFsConfig,
  saveFsConfig,
  SECURITY_LEVEL_CONFIG,
  type ForwardSecrecyConfig,
  type Platform,
} from '../services/preKeyService';
import {
  PREKEY_REPLENISH_DEBOUNCE_MS,
  PREKEY_ROTATION_RETRY_MS,
  createDebouncedAsyncTrigger,
  rescheduleTimer,
  type DebouncedAsyncTrigger,
} from './usePreKeys.scheduler';

export interface UsePreKeysResult {
  /** Whether a rotation is currently in progress */
  isRotating: boolean;
  /** Timestamp of last successful rotation (null if none this session) */
  lastRotation: number | null;
  /** Trigger immediate SPK rotation (manual / panic button) */
  rotateNow: () => Promise<void>;
  /** Delete all retired SPK private keys immediately, optionally clearing FS message cache */
  purgeRetiredKeys: (clearCache?: boolean) => Promise<number>;
  /** Trigger OTPK replenishment check (call after decrypting OTPK messages) */
  triggerReplenishCheck: () => void;
  /** Current FS configuration for this identity */
  config: ForwardSecrecyConfig;
  /** Update the FS configuration (persisted per-identity) */
  updateConfig: (updates: Partial<ForwardSecrecyConfig>) => void;
}

export function usePreKeys(): UsePreKeysResult {
  const { apiBaseUrl, platform } = useAppConfig();
  const {
    status,
    identity,
    getSigningKey,
    getCurrentDeviceId,
    getWrappingKey,
  } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [isRotating, setIsRotating] = useState(false);
  const [lastRotation, setLastRotation] = useState<number | null>(null);
  const [config, setConfig] = useState<ForwardSecrecyConfig>(
    () => identity ? loadFsConfig(identity.id) : loadFsConfig('')
  );

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotatingRef = useRef(false);
  const replenishDebouncerRef = useRef<DebouncedAsyncTrigger | null>(null);

  // Reload config when identity changes
  useEffect(() => {
    if (identity) {
      setConfig(loadFsConfig(identity.id));
    }
  }, [identity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateConfig = useCallback(
    (updates: Partial<ForwardSecrecyConfig>) => {
      setConfig((prev) => {
        const next: ForwardSecrecyConfig = { ...prev, ...updates };
        if (identity) {
          saveFsConfig(identity.id, next);
        }
        return next;
      });
    },
    [identity]
  );

  const performReplenishCheck = useCallback(async () => {
    if (status !== 'logged_in' || !identity) return;

    const signingKey = getSigningKey();
    const deviceId = getCurrentDeviceId();
    const wrappingKey = getWrappingKey();
    if (!signingKey || !deviceId || !wrappingKey) return;

    try {
      const count = await checkAndReplenishOtpks(
        {
          identityId: identity.id,
          deviceId,
          signingPrivateKey: signingKey,
          wrappingKey,
          platform: platform as Platform,
        },
        api.identity
      );
      if (count > 0) {
        console.debug(`[PreKeys] Replenished ${count} OTPKs`);
      }
    } catch (err) {
      console.error('[PreKeys] OTPK replenishment failed:', err);
    }
  }, [status, identity, getSigningKey, getCurrentDeviceId, getWrappingKey, api, platform]);

  const performRotationCheck = useCallback(async () => {
    if (rotatingRef.current) return;
    if (status !== 'logged_in' || !identity) return;

    const signingKey = getSigningKey();
    const deviceId = getCurrentDeviceId();
    const wrappingKey = getWrappingKey();
    if (!signingKey || !deviceId || !wrappingKey) return;

    rotatingRef.current = true;
    setIsRotating(true);

    try {
      const currentConfig = identity ? loadFsConfig(identity.id) : config;

      const result = await checkAndRotateSpk(
        {
          identityId: identity.id,
          deviceId,
          signingPrivateKey: signingKey,
          wrappingKey,
        },
        api.identity,
        currentConfig
      );

      if (result.rotated) {
        setLastRotation(Date.now());
        console.debug(`[PreKeys] SPK rotated to ${result.newKeyId}`);
      }

      // Run cleanup after rotation check
      const deleted = await cleanupRetiredSpks(identity.id, deviceId, currentConfig);
      if (deleted > 0) {
        console.debug(`[PreKeys] Cleaned up ${deleted} retired SPK(s)`);
        if (currentConfig.clearCacheOnRotation) {
          const { clearFsMessageCache } = await import('../services/localMessageStorage');
          await clearFsMessageCache();
          console.debug('[PreKeys] Cleared FS message cache after rotation cleanup');
        }
      }

      // Also check OTPK replenishment (runs on app open and periodic checks)
      await performReplenishCheck();

      // Schedule next check
      timerRef.current = rescheduleTimer(
        timerRef.current,
        () => {
          void performRotationCheck();
        },
        result.nextRotationMs
      );
    } catch (err) {
      console.error('[PreKeys] Rotation check failed:', err);
      timerRef.current = rescheduleTimer(
        timerRef.current,
        () => {
          void performRotationCheck();
        },
        PREKEY_ROTATION_RETRY_MS
      );
    } finally {
      rotatingRef.current = false;
      setIsRotating(false);
    }
  }, [status, identity, getSigningKey, getCurrentDeviceId, getWrappingKey, api, config, performReplenishCheck]);

  // On mount / login: perform initial rotation check
  useEffect(() => {
    if (status === 'logged_in' && identity) {
      performRotationCheck();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, identity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    replenishDebouncerRef.current = createDebouncedAsyncTrigger(
      performReplenishCheck,
      PREKEY_REPLENISH_DEBOUNCE_MS
    );
    return () => {
      replenishDebouncerRef.current?.cancel();
      replenishDebouncerRef.current = null;
    };
  }, [performReplenishCheck]);

  // When config changes (e.g. user switches security level), reschedule
  useEffect(() => {
    if (status === 'logged_in' && identity) {
      // Clear existing timer and re-check with new config
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      performRotationCheck();
    }
  }, [config.securityLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  const rotateNow = useCallback(async () => {
    if (status !== 'logged_in' || !identity) return;

    const signingKey = getSigningKey();
    const deviceId = getCurrentDeviceId();
    const wrappingKey = getWrappingKey();
    if (!signingKey || !deviceId || !wrappingKey) return;

    setIsRotating(true);
    try {
      const { rotateSignedPreKey } = await import('../services/preKeyService');
      const newKeyId = await rotateSignedPreKey(
        {
          identityId: identity.id,
          deviceId,
          signingPrivateKey: signingKey,
          wrappingKey,
        },
        api.identity
      );

      setLastRotation(Date.now());
      console.debug(`[PreKeys] Manual SPK rotation to ${newKeyId}`);

      const currentConfig = loadFsConfig(identity.id);
      const deleted = await cleanupRetiredSpks(identity.id, deviceId, currentConfig);
      if (deleted > 0) {
        console.debug(`[PreKeys] Cleaned up ${deleted} retired SPK(s) after manual rotation`);
        if (currentConfig.clearCacheOnRotation) {
          const { clearFsMessageCache } = await import('../services/localMessageStorage');
          await clearFsMessageCache();
          console.debug('[PreKeys] Cleared FS message cache after manual rotation cleanup');
        }
      }

      // Reset the timer from now
      const levelConfig = SECURITY_LEVEL_CONFIG[currentConfig.securityLevel];
      timerRef.current = rescheduleTimer(
        timerRef.current,
        () => {
          void performRotationCheck();
        },
        levelConfig.spkRotationIntervalMs
      );
    } catch (err) {
      console.error('[PreKeys] Manual rotation failed:', err);
      throw err;
    } finally {
      setIsRotating(false);
    }
  }, [status, identity, getSigningKey, getCurrentDeviceId, getWrappingKey, api, performRotationCheck]);

  const purgeRetiredKeysAction = useCallback(async (clearCache?: boolean): Promise<number> => {
    if (status !== 'logged_in' || !identity) return 0;

    const deviceId = getCurrentDeviceId();
    if (!deviceId) return 0;

    const { purgeRetiredKeys: doPurge } = await import('../services/preKeyService');
    const deleted = await doPurge(identity.id, deviceId);
    if (deleted > 0) {
      console.debug(`[PreKeys] Purged ${deleted} retired SPK(s)`);
    }

    if (clearCache) {
      const { clearFsMessageCache } = await import('../services/localMessageStorage');
      await clearFsMessageCache();
      console.debug('[PreKeys] Cleared FS message cache alongside purge');
    }

    return deleted;
  }, [status, identity, getCurrentDeviceId]);

  const triggerReplenishCheck = useCallback(() => {
    replenishDebouncerRef.current?.trigger();
  }, []);

  return {
    isRotating,
    lastRotation,
    rotateNow,
    purgeRetiredKeys: purgeRetiredKeysAction,
    triggerReplenishCheck,
    config,
    updateConfig,
  };
}
