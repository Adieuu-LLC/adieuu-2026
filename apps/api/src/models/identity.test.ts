import { describe, expect, test } from 'bun:test';
import { DEFAULT_PRIVACY_SETTINGS } from './identity';

describe('DEFAULT_PRIVACY_SETTINGS', () => {
  test('matches expected per-field defaults (kept in sync with profile UI and achievements gating)', () => {
    expect(DEFAULT_PRIVACY_SETTINGS).toEqual({
      avatar: 'public',
      banner: 'public',
      bio: 'public',
      lastActiveAt: 'friends',
      profileColors: 'public',
      achievements: 'friends',
    });
  });
});
