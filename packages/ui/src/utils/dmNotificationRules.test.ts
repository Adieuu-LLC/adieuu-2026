import { describe, it, expect, mock } from 'bun:test';
import type { Notifications } from '../config/types';
import {
  maybeShowNativeNotification,
  shouldShowOsNotificationNow,
  shouldSuppressInAppToastForConversation,
} from './dmNotificationRules';

describe('dmNotificationRules', () => {
  describe('shouldSuppressInAppToastForConversation', () => {
    it('does not suppress when viewing another conversation', () => {
      expect(shouldSuppressInAppToastForConversation(false, { hasFocus: true, visibilityState: 'visible' })).toBe(
        false
      );
    });

    it('suppresses when viewing this conversation with focus and visible tab', () => {
      expect(shouldSuppressInAppToastForConversation(true, { hasFocus: true, visibilityState: 'visible' })).toBe(
        true
      );
    });

    it('does not suppress when viewing this conversation but window is unfocused', () => {
      expect(shouldSuppressInAppToastForConversation(true, { hasFocus: false, visibilityState: 'visible' })).toBe(
        false
      );
    });

    it('does not suppress when tab is hidden', () => {
      expect(shouldSuppressInAppToastForConversation(true, { hasFocus: true, visibilityState: 'hidden' })).toBe(
        false
      );
    });

    it('treats missing document snapshot as suppress (SSR)', () => {
      expect(shouldSuppressInAppToastForConversation(true, null)).toBe(true);
    });
  });

  describe('shouldShowOsNotificationNow', () => {
    it('is true when window lacks focus', () => {
      expect(shouldShowOsNotificationNow({ hasFocus: false, visibilityState: 'visible' })).toBe(true);
    });

    it('is true when tab is hidden', () => {
      expect(shouldShowOsNotificationNow({ hasFocus: true, visibilityState: 'hidden' })).toBe(true);
    });

    it('is false when focused and visible', () => {
      expect(shouldShowOsNotificationNow({ hasFocus: true, visibilityState: 'visible' })).toBe(false);
    });

    it('is false when snapshot is null', () => {
      expect(shouldShowOsNotificationNow(null)).toBe(false);
    });
  });

  describe('maybeShowNativeNotification', () => {
    it('calls notifications.show when enabled, permitted, and OS notification should show', () => {
      const show = mock(() => {});
      const notifications = {
        requestPermission: mock(async () => true),
        hasPermission: () => true,
        getPermissionState: () => 'granted' as NotificationPermission,
        show,
      } satisfies Notifications;
      const navigate = mock((_: string) => {});

      maybeShowNativeNotification(
        notifications,
        true,
        'Title',
        'Body',
        'tag-1',
        navigate,
        '/conversation/x',
        { hasFocus: false, visibilityState: 'visible' }
      );

      expect(show).toHaveBeenCalledTimes(1);
      expect(show.mock.calls[0]?.[0]).toBe('Title');
      expect(show.mock.calls[0]?.[1]).toBe('Body');
      expect(show.mock.calls[0]?.[2]).toEqual({ tag: 'tag-1', onClick: expect.any(Function) });
    });

    it('does not show when native is disabled', () => {
      const show = mock(() => {});
      const notifications = {
        requestPermission: mock(async () => true),
        hasPermission: () => true,
        getPermissionState: () => 'granted' as NotificationPermission,
        show,
      } satisfies Notifications;

      maybeShowNativeNotification(
        notifications,
        false,
        'T',
        'B',
        't',
        () => {},
        '/c',
        { hasFocus: false, visibilityState: 'visible' }
      );
      expect(show).not.toHaveBeenCalled();
    });

    it('does not show when permission is missing', () => {
      const show = mock(() => {});
      const notifications = {
        requestPermission: mock(async () => true),
        hasPermission: () => false,
        getPermissionState: () => 'default' as NotificationPermission,
        show,
      } satisfies Notifications;

      maybeShowNativeNotification(
        notifications,
        true,
        'T',
        'B',
        't',
        () => {},
        '/c',
        { hasFocus: false, visibilityState: 'visible' }
      );
      expect(show).not.toHaveBeenCalled();
    });

    it('does not show when focused visible window would duplicate toast', () => {
      const show = mock(() => {});
      const notifications = {
        requestPermission: mock(async () => true),
        hasPermission: () => true,
        getPermissionState: () => 'granted' as NotificationPermission,
        show,
      } satisfies Notifications;

      maybeShowNativeNotification(
        notifications,
        true,
        'T',
        'B',
        't',
        () => {},
        '/c',
        { hasFocus: true, visibilityState: 'visible' }
      );
      expect(show).not.toHaveBeenCalled();
    });
  });
});
