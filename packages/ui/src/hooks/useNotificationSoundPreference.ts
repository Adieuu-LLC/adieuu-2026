/**
 * React hooks for notification sound preferences. Imperative getters/setters and
 * `useSyncExternalStore` subscriptions live in `notificationSoundPreferenceStorage.ts`
 * so tests need not load `react`.
 */

import { useSyncExternalStore } from 'react';
import { DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID } from '../constants/builtinNotificationSounds';
import {
  DEFAULT_MENTION_NOTIFICATION_SOUND_ID,
  DEFAULT_TTL_NOTIFICATION_SOUND_ID,
  getCallRingtoneSoundCustomPath,
  getCallRingtoneSoundId,
  getCallRingtoneSoundVolume,
  getMentionNotificationSoundCustomPath,
  getMentionNotificationSoundId,
  getMentionNotificationSoundVolume,
  getNotificationSoundCustomPath,
  getNotificationSoundEnabled,
  getNotificationSoundId,
  getNotificationSoundSuppressWhenFocused,
  getNotificationSoundVolume,
  getTtlNotificationSoundCustomPath,
  getTtlNotificationSoundId,
  getTtlNotificationSoundVolume,
  subscribeCallRingtoneSoundPreference,
  subscribeMentionNotificationSoundPreference,
  subscribeNotificationSoundPreference,
  subscribeTtlNotificationSoundPreference,
  DEFAULT_CALL_RINGTONE_NOTIFICATION_SOUND_ID,
  type NotificationSoundPreferenceSnapshot,
} from './notificationSoundPreferenceStorage';

export * from './notificationSoundPreferenceStorage';

/**
 * React requires getSnapshot to return a cached reference when values are unchanged;
 * a fresh object each call triggers infinite re-renders (useSyncExternalStore + Object.is).
 */
let cachedClientSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getNotificationSoundId();
  const customPath = getNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getNotificationSoundVolume();

  if (
    cachedClientSnapshot &&
    cachedClientSnapshot.enabled === enabled &&
    cachedClientSnapshot.soundId === soundId &&
    cachedClientSnapshot.customPath === customPath &&
    cachedClientSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedClientSnapshot.volume === volume
  ) {
    return cachedClientSnapshot;
  }

  cachedClientSnapshot = {
    enabled,
    soundId,
    customPath,
    suppressWhenFocused,
    volume,
  };
  return cachedClientSnapshot;
}

const SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: 1,
};

export function useNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeNotificationSoundPreference,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );
}

let cachedTtlSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getTtlSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getTtlNotificationSoundId();
  const customPath = getTtlNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getTtlNotificationSoundVolume();

  if (
    cachedTtlSnapshot &&
    cachedTtlSnapshot.enabled === enabled &&
    cachedTtlSnapshot.soundId === soundId &&
    cachedTtlSnapshot.customPath === customPath &&
    cachedTtlSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedTtlSnapshot.volume === volume
  ) {
    return cachedTtlSnapshot;
  }

  cachedTtlSnapshot = { enabled, soundId, customPath, suppressWhenFocused, volume };
  return cachedTtlSnapshot;
}

const TTL_SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_TTL_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: 1,
};

export function useTtlNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeTtlNotificationSoundPreference,
    getTtlSnapshot,
    () => TTL_SERVER_SNAPSHOT
  );
}

let cachedMentionSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getMentionSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getMentionNotificationSoundId();
  const customPath = getMentionNotificationSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getMentionNotificationSoundVolume();

  if (
    cachedMentionSnapshot &&
    cachedMentionSnapshot.enabled === enabled &&
    cachedMentionSnapshot.soundId === soundId &&
    cachedMentionSnapshot.customPath === customPath &&
    cachedMentionSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedMentionSnapshot.volume === volume
  ) {
    return cachedMentionSnapshot;
  }

  cachedMentionSnapshot = { enabled, soundId, customPath, suppressWhenFocused, volume };
  return cachedMentionSnapshot;
}

const MENTION_SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_MENTION_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: 1,
};

export function useMentionNotificationSoundPreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeMentionNotificationSoundPreference,
    getMentionSnapshot,
    () => MENTION_SERVER_SNAPSHOT
  );
}

let cachedCallRingtoneSnapshot: NotificationSoundPreferenceSnapshot | null = null;

function getCallRingtoneSnapshot(): NotificationSoundPreferenceSnapshot {
  const enabled = getNotificationSoundEnabled();
  const soundId = getCallRingtoneSoundId();
  const customPath = getCallRingtoneSoundCustomPath();
  const suppressWhenFocused = getNotificationSoundSuppressWhenFocused();
  const volume = getCallRingtoneSoundVolume();

  if (
    cachedCallRingtoneSnapshot &&
    cachedCallRingtoneSnapshot.enabled === enabled &&
    cachedCallRingtoneSnapshot.soundId === soundId &&
    cachedCallRingtoneSnapshot.customPath === customPath &&
    cachedCallRingtoneSnapshot.suppressWhenFocused === suppressWhenFocused &&
    cachedCallRingtoneSnapshot.volume === volume
  ) {
    return cachedCallRingtoneSnapshot;
  }

  cachedCallRingtoneSnapshot = { enabled, soundId, customPath, suppressWhenFocused, volume };
  return cachedCallRingtoneSnapshot;
}

const CALL_RINGTONE_SERVER_SNAPSHOT: NotificationSoundPreferenceSnapshot = {
  enabled: true,
  soundId: DEFAULT_CALL_RINGTONE_NOTIFICATION_SOUND_ID,
  customPath: null,
  suppressWhenFocused: true,
  volume: 1,
};

export function useCallRingtonePreference(): NotificationSoundPreferenceSnapshot {
  return useSyncExternalStore(
    subscribeCallRingtoneSoundPreference,
    getCallRingtoneSnapshot,
    () => CALL_RINGTONE_SERVER_SNAPSHOT
  );
}
