import { describe, expect, test, mock, afterAll } from 'bun:test';

mock.module('../config', () => ({
  config: {},
}));

mock.module('../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mock(() => Promise.resolve(null)),
  }),
}));

import { FOUNDER_LIFETIME_DM_CONV_MAX_BYTES } from '@adieuu/shared';
import { resolveMaxUploadBytes, resolveMaxVideoDurationSecondsForAccount } from './media-limits.service';
import { UPLOAD_PURPOSE_CONFIG } from '../models/media-upload';

afterAll(() => {
  mock.restore();
});

describe('resolveMaxUploadBytes', () => {
  const BASE_DM = UPLOAD_PURPOSE_CONFIG.dm_attachment.maxBytes;
  const BASE_CONV = UPLOAD_PURPOSE_CONFIG.conv_media.maxBytes;
  const BASE_AVATAR = UPLOAD_PURPOSE_CONFIG.avatar.maxBytes;
  const BASE_BANNER = UPLOAD_PURPOSE_CONFIG.banner.maxBytes;
  const BASE_SPACE = UPLOAD_PURPOSE_CONFIG.space_media.maxBytes;
  const BASE_SCAN = UPLOAD_PURPOSE_CONFIG.conv_scan.maxBytes;

  // --- Free users ---

  test('free user gets base limit for dm_attachment', () => {
    expect(resolveMaxUploadBytes('dm_attachment', [])).toBe(BASE_DM);
  });

  test('free user gets base limit for conv_media', () => {
    expect(resolveMaxUploadBytes('conv_media', [])).toBe(BASE_CONV);
  });

  test('free user gets base limit for avatar', () => {
    expect(resolveMaxUploadBytes('avatar', [])).toBe(BASE_AVATAR);
  });

  // --- Access-only subscribers ---

  test('access subscriber gets base limit for dm_attachment', () => {
    expect(resolveMaxUploadBytes('dm_attachment', ['access'])).toBe(BASE_DM);
  });

  test('access subscriber gets base limit for conv_media', () => {
    expect(resolveMaxUploadBytes('conv_media', ['access'])).toBe(BASE_CONV);
  });

  // --- Insider subscribers (explicit overrides for scalable purposes) ---

  test('insider subscriber gets 4.20 GB limit for dm_attachment', () => {
    expect(resolveMaxUploadBytes('dm_attachment', ['insider'])).toBe(4_200_000_000);
  });

  test('insider subscriber gets 4.20 GB limit for conv_media', () => {
    expect(resolveMaxUploadBytes('conv_media', ['insider'])).toBe(4_200_000_000);
  });

  test('insider subscriber gets base limit for avatar (not scalable)', () => {
    expect(resolveMaxUploadBytes('avatar', ['insider'])).toBe(BASE_AVATAR);
  });

  test('insider subscriber gets base limit for banner (not scalable)', () => {
    expect(resolveMaxUploadBytes('banner', ['insider'])).toBe(BASE_BANNER);
  });

  test('insider subscriber gets base limit for space_media (not scalable)', () => {
    expect(resolveMaxUploadBytes('space_media', ['insider'])).toBe(BASE_SPACE);
  });

  test('insider subscriber gets base limit for conv_scan (not scalable)', () => {
    expect(resolveMaxUploadBytes('conv_scan', ['insider'])).toBe(BASE_SCAN);
  });

  // --- Both tiers ---

  test('user with both access and insider gets insider override', () => {
    expect(resolveMaxUploadBytes('dm_attachment', ['access', 'insider'])).toBe(4_200_000_000);
  });

  test('lifetime founder gets 9.001 GB scalable cap on conv_media (over insider)', () => {
    expect(
      resolveMaxUploadBytes('conv_media', ['insider'], {
        entitlements: ['founder'],
        isLifetime: true,
      }),
    ).toBe(FOUNDER_LIFETIME_DM_CONV_MAX_BYTES);
  });

  test('lifetime founder gets 9.001 GB scalable cap on dm_attachment', () => {
    expect(
      resolveMaxUploadBytes('dm_attachment', ['access'], {
        entitlements: ['founder'],
        isLifetime: true,
      }),
    ).toBe(FOUNDER_LIFETIME_DM_CONV_MAX_BYTES);
  });

  test('founder entitlement without lifetime does not elevate past insider', () => {
    expect(
      resolveMaxUploadBytes('conv_media', ['insider'], {
        entitlements: ['founder'],
        isLifetime: false,
      }),
    ).toBe(4_200_000_000);
  });
});

describe('resolveMaxVideoDurationSecondsForAccount', () => {
  test('returns platform max when user has no account cap', () => {
    expect(resolveMaxVideoDurationSecondsForAccount(300, null)).toBe(300);
    expect(resolveMaxVideoDurationSecondsForAccount(300, undefined)).toBe(300);
    expect(resolveMaxVideoDurationSecondsForAccount(300, {})).toBe(300);
  });

  test('returns min of platform and account cap', () => {
    expect(resolveMaxVideoDurationSecondsForAccount(300, { maxVideoDurationSeconds: 60 })).toBe(60);
    expect(resolveMaxVideoDurationSecondsForAccount(60, { maxVideoDurationSeconds: 300 })).toBe(60);
  });

  test('falls back to default for invalid platform value', () => {
    expect(resolveMaxVideoDurationSecondsForAccount(0, null)).toBe(300);
    expect(resolveMaxVideoDurationSecondsForAccount(-1, null)).toBe(300);
    expect(resolveMaxVideoDurationSecondsForAccount(NaN, null)).toBe(300);
  });
});
