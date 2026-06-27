/**
 * React hook for crash reporting preferences. Subscribes to localStorage
 * changes across tabs and within the same tab via `useSyncExternalStore`.
 */

import { useSyncExternalStore } from 'react';
import {
  getCrashReportingEnabled,
  getCrashReportingIncludeUser,
  subscribeCrashReportingPreference,
} from './crashReportingPreferenceStorage';

export function useCrashReportingPreference() {
  const enabled = useSyncExternalStore(
    subscribeCrashReportingPreference,
    getCrashReportingEnabled,
    () => false,
  );
  const includeUser = useSyncExternalStore(
    subscribeCrashReportingPreference,
    getCrashReportingIncludeUser,
    () => false,
  );
  return { enabled, includeUser };
}

export {
  getCrashReportingEnabled,
  setCrashReportingEnabled,
  getCrashReportingIncludeUser,
  setCrashReportingIncludeUser,
} from './crashReportingPreferenceStorage';
