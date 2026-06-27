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
          soundId: 'adieuu_arrival',
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
          soundId: 'adieuu_arrival',
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

  test('uses mentionSoundPref when isMention is true', () => {
    const mentionPref = {
      enabled: true,
      soundId: 'magic' as const,
      customPath: null,
      suppressWhenFocused: true,
      volume: 0.8,
    };
    fireConversationNotification(
      'Mention',
      'Body',
      { nativeTag: 'conversation-event', isMention: true },
      {
        toast: { info: () => undefined },
        soundPref: {
          enabled: true,
          soundId: 'adieuu_arrival',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        mentionSoundPref: mentionPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      }
    );
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.soundId).toBe('magic');
    expect(callArgs.volume).toBe(0.8);
  });

  test('mention takes priority over TTL when both flags are set', () => {
    const mentionPref = {
      enabled: true,
      soundId: 'magic' as const,
      customPath: null,
      suppressWhenFocused: true,
      volume: 0.7,
    };
    const ttlPref = {
      enabled: true,
      soundId: 'adieuu_click' as const,
      customPath: null,
      suppressWhenFocused: true,
      volume: 0.9,
    };
    fireConversationNotification(
      'Both',
      'Body',
      { nativeTag: 'conversation-event', isMention: true, expiresAt: '2026-12-01T00:00:00Z' },
      {
        toast: { info: () => undefined },
        soundPref: {
          enabled: true,
          soundId: 'adieuu_arrival',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        ttlSoundPref: ttlPref,
        mentionSoundPref: mentionPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      }
    );
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.soundId).toBe('magic');
    expect(callArgs.volume).toBe(0.7);
  });

  test('uses ttlSoundPref when expiresAt is set and message is not a mention', () => {
    const ttlPref = {
      enabled: true,
      soundId: 'adieuu_click' as const,
      customPath: null,
      suppressWhenFocused: true,
      volume: 0.85,
    };
    const toastWithExpiry = mock(() => undefined);
    fireConversationNotification(
      'TTL msg',
      'Body',
      { nativeTag: 'conversation-event', expiresAt: '2026-12-01T00:00:00Z' },
      {
        toast: { info: () => undefined, toast: toastWithExpiry },
        soundPref: {
          enabled: true,
          soundId: 'adieuu_arrival',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        ttlSoundPref: ttlPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      }
    );
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.soundId).toBe('adieuu_click');
    expect(callArgs.volume).toBe(0.85);
    expect(toastWithExpiry).toHaveBeenCalledTimes(1);
  });

  test('falls back to soundPref when isMention is false', () => {
    const mentionPref = {
      enabled: true,
      soundId: 'magic' as const,
      customPath: null,
      suppressWhenFocused: true,
      volume: 0.8,
    };
    fireConversationNotification(
      'Normal',
      'Body',
      { nativeTag: 'conversation-event' },
      {
        toast: { info: () => undefined },
        soundPref: {
          enabled: true,
          soundId: 'adieuu_arrival',
          customPath: null,
          suppressWhenFocused: true,
          volume: 1,
        },
        mentionSoundPref: mentionPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      }
    );
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.soundId).toBe('adieuu_arrival');
    expect(callArgs.volume).toBe(1);
  });
});
