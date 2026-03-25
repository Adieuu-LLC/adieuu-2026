import { describe, it, expect } from 'bun:test';
import { shouldPlayNotificationSound } from './notificationSound';

describe('shouldPlayNotificationSound', () => {
  const visibleFocused = { hasFocus: true, visibilityState: 'visible' as const };
  const unfocused = { hasFocus: false, visibilityState: 'visible' as const };

  it('returns false when disabled', () => {
    expect(
      shouldPlayNotificationSound(false, 'chime', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns false for none', () => {
    expect(
      shouldPlayNotificationSound(true, 'none', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns false for custom without path', () => {
    expect(
      shouldPlayNotificationSound(true, 'custom', null, true, false, unfocused)
    ).toBe(false);
  });

  it('returns true for built-in preset when unfocused', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, true, false, unfocused)
    ).toBe(true);
  });

  it('suppresses when viewing focused conversation and suppressWhenFocused is true', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, true, true, visibleFocused)
    ).toBe(false);
  });

  it('plays when suppressWhenFocused is false even if viewing focused conversation', () => {
    expect(
      shouldPlayNotificationSound(true, 'chime', null, false, true, visibleFocused)
    ).toBe(true);
  });

  it('allows custom when path is set', () => {
    expect(
      shouldPlayNotificationSound(true, 'custom', '/x/y.mp3', true, false, unfocused)
    ).toBe(true);
  });
});
