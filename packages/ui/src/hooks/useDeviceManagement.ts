/**
 * Device Management Hook
 *
 * Provides functionality for managing identity devices including:
 * - Listing devices
 * - Renaming devices
 * - Removing devices (with passphrase confirmation)
 * - Removing all other devices
 * - Activity heartbeat
 *
 * @module hooks/useDeviceManagement
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createApiClient, type PublicDevice } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useIdentity } from './useIdentity';
import { getOrCreateDeviceId } from '../services/deviceInfo';
import { deleteAllDeviceKeysForIdentity } from '../services/deviceKeyStorage';
import { clearParticipantCache } from '../services/participantCache';

/**
 * Activity tracking preference.
 */
export type ActivityTrackingMode = 'active-only' | 'periodic' | 'disabled';

/**
 * Periodic interval options (in minutes).
 */
export type ActivityInterval = 15 | 30 | 60;

/**
 * Activity preferences for device heartbeat.
 */
export interface ActivityPreferences {
  mode: ActivityTrackingMode;
  intervalMinutes: ActivityInterval;
}

/**
 * Device with extended information.
 */
export interface DeviceWithStatus extends PublicDevice {
  isCurrentDevice: boolean;
}

/**
 * Device management state.
 */
export interface DeviceManagementState {
  devices: DeviceWithStatus[];
  loading: boolean;
  error: string | null;
  currentDeviceId: string | null;
}

/**
 * Result of a device operation.
 */
export interface DeviceOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Storage key for activity preferences.
 */
const ACTIVITY_PREFS_KEY = 'adieuu-activity-prefs';

/**
 * Get activity preferences from localStorage.
 */
function getActivityPreferences(): ActivityPreferences {
  if (typeof localStorage === 'undefined') {
    return { mode: 'active-only', intervalMinutes: 15 };
  }

  try {
    const stored = localStorage.getItem(ACTIVITY_PREFS_KEY);
    if (stored) {
      return JSON.parse(stored) as ActivityPreferences;
    }
  } catch {
    // Ignore parse errors
  }

  return { mode: 'active-only', intervalMinutes: 15 };
}

/**
 * Save activity preferences to localStorage.
 */
function saveActivityPreferences(prefs: ActivityPreferences): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVITY_PREFS_KEY, JSON.stringify(prefs));
}

/**
 * Hook for managing identity devices.
 */
export function useDeviceManagement() {
  const { apiBaseUrl } = useAppConfig();
  const { identity, logoutFromIdentity } = useIdentity();

  const [state, setState] = useState<DeviceManagementState>({
    devices: [],
    loading: false,
    error: null,
    currentDeviceId: null,
  });

  const [activityPrefs, setActivityPrefsState] = useState<ActivityPreferences>(
    getActivityPreferences
  );

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const currentDeviceId = useMemo(() => getOrCreateDeviceId(), []);

  /**
   * Fetch all devices for the current identity.
   */
  const fetchDevices = useCallback(async (): Promise<void> => {
    if (!identity) {
      setState((prev) => ({ ...prev, devices: [], error: null }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await api.identity.listDevices(identity.id);

      if (!response.success || !response.data?.devices) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: response.error?.message ?? 'Failed to fetch devices',
        }));
        return;
      }

      const devicesWithStatus: DeviceWithStatus[] = response.data.devices.map((device) => ({
        ...device,
        isCurrentDevice: device.deviceId === currentDeviceId,
      }));

      setState({
        devices: devicesWithStatus,
        loading: false,
        error: null,
        currentDeviceId,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch devices',
      }));
    }
  }, [identity, api, currentDeviceId]);

  /**
   * Rename a device.
   */
  const renameDevice = useCallback(
    async (deviceId: string, newName: string): Promise<DeviceOperationResult> => {
      if (!identity) {
        return { success: false, error: 'Not logged in' };
      }

      try {
        const response = await api.identity.renameDevice(identity.id, deviceId, newName);

        if (!response.success) {
          return { success: false, error: response.error?.message ?? 'Failed to rename device' };
        }

        // Refresh device list
        await fetchDevices();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to rename device',
        };
      }
    },
    [identity, api, fetchDevices]
  );

  /**
   * Verify passphrase by attempting login.
   * Returns true if passphrase is correct.
   */
  const verifyPassphrase = useCallback(
    async (passphrase: string): Promise<boolean> => {
      try {
        // Attempt login to verify passphrase
        const response = await api.identity.login({ passphrase });
        return response.success;
      } catch {
        return false;
      }
    },
    [api]
  );

  /**
   * Remove a device after passphrase verification.
   */
  const removeDevice = useCallback(
    async (deviceId: string, passphrase: string): Promise<DeviceOperationResult> => {
      if (!identity) {
        return { success: false, error: 'Not logged in' };
      }

      // Verify passphrase first
      const isValid = await verifyPassphrase(passphrase);
      if (!isValid) {
        return { success: false, error: 'Invalid passphrase' };
      }

      const isCurrentDevice = deviceId === currentDeviceId;

      try {
        const response = await api.identity.removeDevice(identity.id, deviceId);

        if (!response.success) {
          return { success: false, error: response.error?.message ?? 'Failed to remove device' };
        }

        // If removing current device, clear local data and logout
        if (isCurrentDevice) {
          await clearLocalDataAndLogout();
          return { success: true };
        }

        // Refresh device list
        await fetchDevices();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove device',
        };
      }
    },
    [identity, api, currentDeviceId, fetchDevices, verifyPassphrase]
  );

  /**
   * Remove all other devices (not the current one) after passphrase verification.
   */
  const removeAllOtherDevices = useCallback(
    async (passphrase: string): Promise<DeviceOperationResult> => {
      if (!identity) {
        return { success: false, error: 'Not logged in' };
      }

      // Verify passphrase first
      const isValid = await verifyPassphrase(passphrase);
      if (!isValid) {
        return { success: false, error: 'Invalid passphrase' };
      }

      const otherDevices = state.devices.filter((d) => !d.isCurrentDevice);

      if (otherDevices.length === 0) {
        return { success: true };
      }

      try {
        // Remove all other devices
        const results = await Promise.all(
          otherDevices.map((device) => api.identity.removeDevice(identity.id, device.deviceId))
        );

        const failures = results.filter((r) => !r.success);
        if (failures.length > 0) {
          return {
            success: false,
            error: `Failed to remove ${failures.length} device(s)`,
          };
        }

        // Refresh device list
        await fetchDevices();
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Failed to remove devices',
        };
      }
    },
    [identity, api, state.devices, fetchDevices, verifyPassphrase]
  );

  /**
   * Clear all local data and logout.
   */
  const clearLocalDataAndLogout = useCallback(async (): Promise<void> => {
    if (!identity) return;

    try {
      // Clear device keys from IndexedDB
      await deleteAllDeviceKeysForIdentity(identity.id);

      // Clear participant cache
      await clearParticipantCache(identity.id);

      // Clear device ID from localStorage
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('adieuu-device-id');
      }
    } catch (err) {
      console.error('Failed to clear local data:', err);
    }

    // Logout from identity
    await logoutFromIdentity();
  }, [identity, logoutFromIdentity]);

  /**
   * Update activity preferences.
   */
  const setActivityPreferences = useCallback((prefs: ActivityPreferences): void => {
    setActivityPrefsState(prefs);
    saveActivityPreferences(prefs);
  }, []);

  /**
   * Send activity heartbeat.
   */
  const sendHeartbeat = useCallback(async (): Promise<void> => {
    if (!identity || !currentDeviceId) return;

    try {
      await api.identity.updateDeviceActivity(identity.id, currentDeviceId);
    } catch (err) {
      console.warn('Failed to send activity heartbeat:', err);
    }
  }, [identity, currentDeviceId, api]);

  /**
   * Track user activity for active-only mode.
   */
  const trackActivity = useCallback((): void => {
    lastActivityRef.current = Date.now();
  }, []);

  // Setup activity heartbeat based on preferences
  useEffect(() => {
    if (!identity || activityPrefs.mode === 'disabled') {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    const intervalMs = activityPrefs.intervalMinutes * 60 * 1000;

    const heartbeatFn = async () => {
      if (activityPrefs.mode === 'active-only') {
        // Only send if there was activity in the last interval
        const timeSinceActivity = Date.now() - lastActivityRef.current;
        if (timeSinceActivity < intervalMs) {
          await sendHeartbeat();
        }
      } else {
        // Periodic mode - always send
        await sendHeartbeat();
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Setup interval
    heartbeatIntervalRef.current = setInterval(heartbeatFn, intervalMs);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [identity, activityPrefs, sendHeartbeat]);

  // Track user activity events for active-only mode
  useEffect(() => {
    if (typeof window === 'undefined' || activityPrefs.mode !== 'active-only') {
      return;
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];

    events.forEach((event) => {
      window.addEventListener(event, trackActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, trackActivity);
      });
    };
  }, [activityPrefs.mode, trackActivity]);

  // Fetch devices on mount and when identity changes
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  return {
    ...state,
    fetchDevices,
    renameDevice,
    removeDevice,
    removeAllOtherDevices,
    activityPrefs,
    setActivityPreferences,
    sendHeartbeat,
    trackActivity,
  };
}
