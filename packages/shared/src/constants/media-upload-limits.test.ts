import { describe, expect, test } from 'bun:test';
import {
  CONV_MEDIA_BASE_MAX_BYTES,
  FOUNDER_LIFETIME_DM_CONV_MAX_BYTES,
  INSIDER_DM_CONV_MAX_BYTES,
  resolveScalableDmOrConvMaxUploadBytes,
} from './media-upload-limits';

describe('resolveScalableDmOrConvMaxUploadBytes', () => {
  test('founder + lifetime beats insider on conv_media', () => {
    expect(
      resolveScalableDmOrConvMaxUploadBytes('conv_media', ['access', 'insider'], {
        entitlements: ['founder'],
        isLifetime: true,
      }),
    ).toBe(FOUNDER_LIFETIME_DM_CONV_MAX_BYTES);
  });

  test('founder without lifetime does not apply founder cap', () => {
    expect(
      resolveScalableDmOrConvMaxUploadBytes('conv_media', ['insider'], {
        entitlements: ['founder'],
        isLifetime: false,
      }),
    ).toBe(INSIDER_DM_CONV_MAX_BYTES);
  });

  test('lifetime without founder stays on insider cap when insider', () => {
    expect(
      resolveScalableDmOrConvMaxUploadBytes('dm_attachment', ['insider'], {
        entitlements: ['vanguard'],
        isLifetime: true,
      }),
    ).toBe(INSIDER_DM_CONV_MAX_BYTES);
  });

  test('base tier uses configured base bytes', () => {
    expect(
      resolveScalableDmOrConvMaxUploadBytes('conv_media', ['access'], {
        entitlements: [],
        isLifetime: true,
      }),
    ).toBe(CONV_MEDIA_BASE_MAX_BYTES);
  });
});
