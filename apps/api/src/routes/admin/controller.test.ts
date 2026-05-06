/**
 * Admin controller unit tests — parsing helpers (deterministic, no mocks).
 */

import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../../constants/platform-settings-keys';
import {
  parseRegisteredPlatformSettingKey,
  parseSanitizedObjectIdHex,
  safeDecodeUriComponent,
} from './controller';

describe('safeDecodeUriComponent', () => {
  test('decodes percent-encoding', () => {
    expect(safeDecodeUriComponent('platform-auth-%61llowlist-enforced')).toBe(
      PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED,
    );
  });

  test('returns empty on malformed escapes', () => {
    expect(safeDecodeUriComponent('%')).toBe('');
    expect(safeDecodeUriComponent('%ZZ')).toBe('');
  });
});

describe('parseRegisteredPlatformSettingKey', () => {
  test('accepts registered keys after decode and alphanumdash sanitization', () => {
    const key = PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED;
    expect(parseRegisteredPlatformSettingKey(key)).toBe(key);
    expect(parseRegisteredPlatformSettingKey(encodeURIComponent(key))).toBe(key);
  });

  test('returns null for unknown keys', () => {
    expect(parseRegisteredPlatformSettingKey('not-a-real-setting')).toBe(null);
    expect(parseRegisteredPlatformSettingKey('platform-auth_allowlist')).toBe(null);
  });
});

describe('parseSanitizedObjectIdHex', () => {
  test('parses valid hex after decode', () => {
    const id = new ObjectId();
    expect(parseSanitizedObjectIdHex(id.toHexString())).toBe(id.toHexString());
  });

  test('returns null for invalid segments', () => {
    expect(parseSanitizedObjectIdHex('not-valid')).toBe(null);
    expect(parseSanitizedObjectIdHex('%')).toBe(null);
  });
});
