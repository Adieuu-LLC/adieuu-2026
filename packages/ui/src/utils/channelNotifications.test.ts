import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const playNotificationSoundMock = mock(() => Promise.resolve());
const getNativeNotificationsEnabledMock = mock(() => true);

mock.module('./notificationSound', () => ({
  playNotificationSound: playNotificationSoundMock,
}));

mock.module('../hooks/useNativeNotificationsPreference', () => ({
  getNativeNotificationsEnabled: getNativeNotificationsEnabledMock,
}));

const { fireChannelNotification } = await import('./channelNotifications');

describe('fireChannelNotification', () => {
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

  const baseSoundPref = {
    enabled: true,
    soundId: 'adieuu_arrival' as const,
    customPath: null,
    suppressWhenFocused: true,
    volume: 1,
  };

  test('shows toast, plays sound, and sends native notification when enabled', () => {
    const toastInfo = mock(() => undefined);
    const notificationsShow = mock(() => undefined);
    fireChannelNotification(
      'Title',
      'Body',
      { nativeTag: 'channel-event' },
      {
        toast: { info: toastInfo },
        soundPref: baseSoundPref,
        notifications: { hasPermission: () => true, show: notificationsShow },
      },
    );
    expect(toastInfo).toHaveBeenCalledTimes(1);
    expect(playNotificationSoundMock).toHaveBeenCalledTimes(1);
    expect(notificationsShow).toHaveBeenCalledTimes(1);
  });

  test('uses TTL toast when expiresAt is set and toast.toast is available', () => {
    const toastFn = mock(() => undefined);
    fireChannelNotification(
      'TTL',
      'Body',
      { nativeTag: 'ch', expiresAt: '2026-12-01T00:00:00Z' },
      {
        toast: { info: () => undefined, toast: toastFn },
        soundPref: baseSoundPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      },
    );
    expect(toastFn).toHaveBeenCalledTimes(1);
    const call = toastFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(call.expiresAt).toBe('2026-12-01T00:00:00Z');
  });

  test('passes isViewingChannel through to sound player', () => {
    fireChannelNotification(
      'Test',
      'Body',
      { nativeTag: 'ch', isViewingChannel: true },
      {
        toast: { info: () => undefined },
        soundPref: baseSoundPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      },
    );
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.isViewingConversation).toBe(true);
  });

  test('mention sound takes priority over TTL sound', () => {
    const mentionPref = { ...baseSoundPref, soundId: 'magic' as const, volume: 0.7 };
    const ttlPref = { ...baseSoundPref, soundId: 'adieuu_click' as const, volume: 0.9 };
    fireChannelNotification(
      'Both',
      'Body',
      { nativeTag: 'ch', isMention: true, expiresAt: '2026-12-01T00:00:00Z' },
      {
        toast: { info: () => undefined },
        soundPref: baseSoundPref,
        mentionSoundPref: mentionPref,
        ttlSoundPref: ttlPref,
        notifications: { hasPermission: () => false, show: () => undefined },
      },
    );
    const callArgs = playNotificationSoundMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.soundId).toBe('magic');
  });
});
