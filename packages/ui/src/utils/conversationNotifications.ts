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

export interface ConversationNotificationDeps {
  toast: {
    info: (title: string, body: string, onClick?: () => void) => void;
    /** Full toast API — used for TTL message toasts with countdown metadata. */
    toast?: (options: ToastOptions) => void;
  };
  soundPref: NotificationSoundPreferenceLike;
  /** Separate sound preference for disappearing/TTL messages. Falls back to soundPref when absent. */
  ttlSoundPref?: NotificationSoundPreferenceLike;
  /** Separate sound preference for @mention messages. Falls back to soundPref when absent. */
  mentionSoundPref?: NotificationSoundPreferenceLike;
  notifications: NotificationPlatformLike;
  audio?: { loadSoundFromPath?: (path: string) => Promise<ArrayBuffer | null> };
  nativeEnabled?: () => boolean;
  onWilhelmScream?: () => void;
}

export interface ConversationNotificationOptions {
  onClick?: () => void;
  isViewingConversation?: boolean;
  nativeTag: string;
  /** ISO-8601 expiry timestamp — triggers TTL sound + toast countdown. */
  expiresAt?: string;
  /** Whether this message mentions the current user. */
  isMention?: boolean;
}

export function fireConversationNotification(
  title: string,
  body: string,
  options: ConversationNotificationOptions,
  deps: ConversationNotificationDeps
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
    isViewingConversation: options.isViewingConversation ?? false,
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
