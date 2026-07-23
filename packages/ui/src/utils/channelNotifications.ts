import { getNativeNotificationsEnabled } from '../hooks/useNativeNotificationsPreference';
import { playNotificationSound, type FocusVisibilitySnapshot } from './notificationSound';
import type { NotificationSoundId } from '../constants/notificationSoundPreferenceShared';
import type { ToastOptions } from '../components/Toast';

export interface NotificationSoundPreferenceLike {
  enabled: boolean;
  soundId: NotificationSoundId;
  customPath: string | null;
  suppressWhenFocused: boolean;
  volume: number;
}

export interface NotificationPlatformLike {
  hasPermission: () => boolean;
  show: (
    title: string,
    body: string,
    options?: { tag?: string; onClick?: () => void }
  ) => void;
}

export interface ChannelNotificationDeps {
  toast: {
    info: (title: string, body: string, onClick?: () => void) => void;
    toast?: (options: ToastOptions) => void;
  };
  soundPref: NotificationSoundPreferenceLike;
  ttlSoundPref?: NotificationSoundPreferenceLike;
  mentionSoundPref?: NotificationSoundPreferenceLike;
  notifications: NotificationPlatformLike;
  audio?: { loadSoundFromPath?: (path: string) => Promise<ArrayBuffer | null> };
  nativeEnabled?: () => boolean;
  onWilhelmScream?: () => void;
}

export interface ChannelNotificationOptions {
  onClick?: () => void;
  isViewingChannel?: boolean;
  nativeTag: string;
  expiresAt?: string;
  isMention?: boolean;
}

/**
 * Shared notification dispatcher for any channel type (conversation or space).
 * Fires an in-app toast, plays a notification sound, and shows a native OS
 * notification when enabled.
 */
export function fireChannelNotification(
  title: string,
  body: string,
  options: ChannelNotificationOptions,
  deps: ChannelNotificationDeps,
): void {
  if (options.expiresAt && deps.toast.toast) {
    deps.toast.toast({
      title,
      description: body,
      variant: 'info',
      duration: 8000,
      onClick: options.onClick,
      expiresAt: options.expiresAt,
    });
  } else {
    deps.toast.info(title, body, options.onClick);
  }

  const isMention = !!options.isMention;
  const isExpiring = !!options.expiresAt;
  const effectivePref =
    isMention && deps.mentionSoundPref ? deps.mentionSoundPref
    : isExpiring && deps.ttlSoundPref  ? deps.ttlSoundPref
    :                                     deps.soundPref;

  const snapshot: FocusVisibilitySnapshot = {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
  };

  void playNotificationSound({
    enabled: effectivePref.enabled,
    soundId: effectivePref.soundId,
    customPath: effectivePref.customPath,
    suppressWhenFocused: effectivePref.suppressWhenFocused,
    isViewingConversation: options.isViewingChannel ?? false,
    snapshot,
    volume: effectivePref.volume,
    loadCustomSound: deps.audio?.loadSoundFromPath,
    onWilhelmScream: deps.onWilhelmScream,
  });

  const nativeEnabled = deps.nativeEnabled ?? getNativeNotificationsEnabled;
  if (nativeEnabled() && deps.notifications.hasPermission()) {
    deps.notifications.show(title, body, { tag: options.nativeTag, onClick: options.onClick });
  }
}
