import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const playNotificationSoundMock = mock(() => Promise.resolve());
const getNativeNotificationsEnabledMock = mock(() => true);

mock.module('./notificationSound', () => ({
  playNotificationSound: playNotificationSoundMock,
}));

mock.module('../hooks/useNativeNotificationsPreference', () => ({
  getNativeNotificationsEnabled: getNativeNotificationsEnabledMock,
}));

const notificationsModule = await import('./conversationNotifications');
const fireConversationNotification = notificationsModule.fireConversationNotification;

describe('fireConversationNotification', () => {
  beforeEach(() => {
    playNotificationSoundMock.mockClear();
    getNativeNotificationsEnabledMock.mockClear();
    getNativeNotificationsEnabledMock.mockReturnValue(true);
    Object.defineProperty(globalThis, 'document', {
      value: {
        hasFocus: () => false,
        visibilityState: 'visible',
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    playNotificationSoundMock.mockClear();
  });

  test('shows toast, plays sound, and sends native notification when enabled', () => {
    const toastInfo = mock(() => undefined);
    const notificationsShow = mock(() => undefined);
    fireConversationNotification(
      'Title',
      'Body',
      { nativeTag: 'conversation-event' },
      {
        toast: { info: toastInfo },
        soundPref: {
          enabled: true,
          soundId: 'win-low',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        notifications: {
          hasPermission: () => true,
          show: notificationsShow,
        },
      }
    );
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    expect(notificationsShow).toHaveBeenCalledTimes(1);
  });

  test('does not send native notification when disabled', () => {
    getNativeNotificationsEnabledMock.mockReturnValue(false);
    const notificationsShow = mock(() => undefined);
    fireConversationNotification(
      'Title',
      'Body',
      { nativeTag: 'friend-event' },
      {
        toast: { info: () => undefined },
        soundPref: {
          enabled: true,
          soundId: 'win-low',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        notifications: {
          hasPermission: () => true,
          show: notificationsShow,
        },
      }
    );
    expect(notificationsShow).toHaveBeenCalledTimes(0);
  });
});
