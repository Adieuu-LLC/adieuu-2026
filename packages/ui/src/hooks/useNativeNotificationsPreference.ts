/**
 * Client-side preference for whether to show OS-level (Web Notification API)
 * alerts for DMs, in addition to in-app toasts. Stored in localStorage so it
 * applies per browser profile / device.
 */

import { useSyncExternalStore } from 'react';
import {
  getNativeNotificationsEnabled,
  subscribeNativeNotificationsEnabled,
} from './nativeNotificationsPreferenceStorage';

/**
 * Subscribe to preference changes across tabs and within the same tab.
 */
export function useNativeNotificationsPreference(): boolean {
  return useSyncExternalStore(
    subscribeNativeNotificationsEnabled,
    getNativeNotificationsEnabled,
    () => false
  );
}

export {
  getNativeNotificationsEnabled,
  setNativeNotificationsEnabled,
} from './nativeNotificationsPreferenceStorage';
