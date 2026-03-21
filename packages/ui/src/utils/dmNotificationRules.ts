/**
 * Pure rules for DM toast + native notification eligibility (testable without DOM).
 */

import type { Notifications } from '../config/types';

export interface FocusVisibilitySnapshot {
  hasFocus: boolean;
  visibilityState: DocumentVisibilityState;
}

export function readFocusVisibilitySnapshot(): FocusVisibilitySnapshot | null {
  if (typeof document === 'undefined') return null;
  return {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
  };
}

/**
 * Skip in-app toast when the user is already reading this thread in a focused, visible window.
 */
export function shouldSuppressInAppToastForConversation(
  isViewingConversation: boolean,
  doc: FocusVisibilitySnapshot | null
): boolean {
  if (!isViewingConversation) return false;
  if (!doc) return true;
  return doc.visibilityState === 'visible' && doc.hasFocus;
}

/**
 * Show OS notification when the window is unfocused or the tab is hidden.
 */
export function shouldShowOsNotificationNow(doc: FocusVisibilitySnapshot | null): boolean {
  if (!doc) return false;
  return !doc.hasFocus || doc.visibilityState === 'hidden';
}

export function maybeShowNativeNotification(
  notifications: Notifications,
  nativeEnabled: boolean,
  title: string,
  body: string,
  tag: string,
  navigate: (path: string) => void,
  path: string,
  snapshot: FocusVisibilitySnapshot | null
): void {
  if (!nativeEnabled || !notifications.hasPermission() || !shouldShowOsNotificationNow(snapshot)) {
    return;
  }
  notifications.show(title, body, {
    tag,
    onClick: () => navigate(path),
  });
}
