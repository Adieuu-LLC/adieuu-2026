import { getNativeNotificationsEnabled } from '../hooks/useNativeNotificationsPreference';
import { playNotificationSound, type FocusVisibilitySnapshot } from './notificationSound';
import type { NotificationSoundId } from '../hooks/useNotificationSoundPreference';

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

export interface ConversationNotificationDeps {
  toast: { info: (title: string, body: string, onClick?: () => void) => void };
  soundPref: NotificationSoundPreferenceLike;
  notifications: NotificationPlatformLike;
  audio?: { loadSoundFromPath?: (path: string) => Promise<ArrayBuffer | null> };
  nativeEnabled?: () => boolean;
}

export interface ConversationNotificationOptions {
  onClick?: () => void;
  isViewingConversation?: boolean;
  nativeTag: string;
}

export function fireConversationNotification(
  title: string,
  body: string,
  options: ConversationNotificationOptions,
  deps: ConversationNotificationDeps
): void {
  deps.toast.info(title, body, options.onClick);

  const snapshot: FocusVisibilitySnapshot = {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
  };

  void playNotificationSound({
    enabled: deps.soundPref.enabled,
    soundId: deps.soundPref.soundId,
    customPath: deps.soundPref.customPath,
    suppressWhenFocused: deps.soundPref.suppressWhenFocused,
    isViewingConversation: options.isViewingConversation ?? false,
    snapshot,
    volume: deps.soundPref.volume,
    loadCustomSound: deps.audio?.loadSoundFromPath,
  });

  const nativeEnabled = deps.nativeEnabled ?? getNativeNotificationsEnabled;
  if (nativeEnabled() && deps.notifications.hasPermission()) {
    deps.notifications.show(title, body, { tag: options.nativeTag, onClick: options.onClick });
  }
}
