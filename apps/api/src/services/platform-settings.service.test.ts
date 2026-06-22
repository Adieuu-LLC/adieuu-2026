import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';
import type { PlatformSettingsDocument } from '../models/platform-settings';

const mockFindByKey = mock((key: string) => Promise.resolve(null as unknown));
const mockUpsertByKey = mock((): Promise<PlatformSettingsDocument> =>
  Promise.resolve({
    _id: new ObjectId(),
    key: 'x',
    description: '',
    valueType: 'stringArray',
    value: [],
    lastUpdatedBy: 'u',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

mock.module('../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockFindByKey,
    findAll: mock(() => Promise.resolve([])),
    upsertByKey: mockUpsertByKey,
  }),
}));

mock.module('../db', () => ({
  getRedis: mock(() => ({
    get: mock(() => Promise.resolve(null)),
    set: mock(() => Promise.resolve('OK')),
    del: mock(() => Promise.resolve(1)),
  })),
  isRedisConnected: mock(() => false),
}));

mock.module('../db/redis', () => ({
  RedisKeys: {
    platformAuthAllowlistCache: () => 'platform_setting_cache:auth_allowlist',
  },
}));

import {
  coercePlatformSettingValue,
  ensureAuthAllowlistPlatformSettingsExist,
  ensureAgeVerificationPlatformSettingsExist,
  ensureCsamHashServicesPlatformSettingExists,
  ensureNcmecCyberTiplinePlatformSettingExists,
  isAuthIdentifierAllowed,
  mergeUpsertPlatformSettingDescription,
  sanitizePlatformSettingValueAfterCoerce,
  upsertPlatformSetting,
} from './platform-settings.service';

afterAll(() => {
  mock.restore();
});

describe('coercePlatformSettingValue', () => {
  test('coerces boolean', () => {
    expect(coercePlatformSettingValue('boolean', true)).toBe(true);
    expect(coercePlatformSettingValue('boolean', false)).toBe(false);
  });

  test('rejects non-boolean for boolean type', () => {
    expect(() => coercePlatformSettingValue('boolean', 'true')).toThrow();
  });

  test('coerces stringArray', () => {
    expect(coercePlatformSettingValue('stringArray', ['a', 'b'])).toEqual(['a', 'b']);
  });

  test('rejects non-string elements in stringArray', () => {
    expect(() => coercePlatformSettingValue('stringArray', ['a', 1])).toThrow();
  });

  test('coerces objectIdArray from hex strings', () => {
    const hex = new ObjectId().toHexString();
    const v = coercePlatformSettingValue('objectIdArray', [hex]);
    expect(Array.isArray(v)).toBe(true);
    expect((v as ObjectId[])[0]!.toHexString()).toBe(hex);
  });

  test('rejects invalid objectId hex', () => {
    expect(() => coercePlatformSettingValue('objectIdArray', ['not-an-id'])).toThrow();
  });
});

describe('mergeUpsertPlatformSettingDescription', () => {
  test('preserves existing when incoming is undefined', () => {
    expect(mergeUpsertPlatformSettingDescription(undefined, 'stored')).toBe('stored');
    expect(mergeUpsertPlatformSettingDescription(undefined, undefined)).toBe('');
  });

  test('sanitizes incoming description only', () => {
    expect(mergeUpsertPlatformSettingDescription(' Hello ', undefined)).toBe('Hello');
    expect(mergeUpsertPlatformSettingDescription('ok\u0000', undefined)).not.toContain('\u0000');
  });
});

describe('sanitizePlatformSettingValueAfterCoerce', () => {
  test('passes boolean and number through', () => {
    expect(
      sanitizePlatformSettingValueAfterCoerce(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED, 'boolean', true),
    ).toBe(true);
    expect(
      sanitizePlatformSettingValueAfterCoerce(
        PLATFORM_SETTING_KEYS.MEDIA_MAX_VIDEO_DURATION_SECONDS,
        'number',
        120,
      ),
    ).toBe(120);
  });

  test('sanitizes provider string keys as alphanumdash', () => {
    const raw = '  VERIFYMY  ';
    expect(
      sanitizePlatformSettingValueAfterCoerce(
        PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER,
        'string',
        raw,
      ),
    ).toBe('VERIFYMY');
  });

  test('sanitizes default VerifyMy business settings ID as general string', () => {
    const raw = '  bs-us-default  ';
    expect(
      sanitizePlatformSettingValueAfterCoerce(
        PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID,
        'string',
        raw,
      ),
    ).toBe('bs-us-default');
  });

  test('sanitizes jurisdiction arrays as alphanumdash', () => {
    const arr = [' US-TN ', 'GB'];
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS,
      'stringArray',
      arr,
    ) as string[];
    expect(out).toEqual(['US-TN', 'GB']);
  });

  test('sanitizes geofence law link rows by jurisdiction and url parts', () => {
    const rows = ['US-TN|https://Example.COM/path'];
    const coerced = coercePlatformSettingValue('stringArray', rows);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS,
      'stringArray',
      coerced,
    ) as string[];
    expect(out[0]).toContain('|');
    expect(out[0]).toMatch(/example\.com\/path/i);
  });

  test('generic stringArray falls back to general sanitization', () => {
    const arr = [' hello\u0008world '];
    const coerced = coercePlatformSettingValue('stringArray', arr);
    const out = sanitizePlatformSettingValueAfterCoerce(
      'platform-unknown-array-test-key',
      'stringArray',
      coerced,
    );
    expect(Array.isArray(out)).toBe(true);
    expect((out as string[])[0]).not.toContain('\u0008');
  });
});

describe('isAuthIdentifierAllowed (Mongo-backed, Redis off)', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
  });

  test('returns true when allowlist is not enforced (missing settings)', async () => {
    expect(await isAuthIdentifierAllowed('anyone@example.com', 'email')).toBe(true);
  });

  test('returns true when enforced and email is in list', async () => {
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({ valueType: 'boolean', value: true });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL) {
        return Promise.resolve({ valueType: 'stringArray', value: ['user@example.com'] });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE) {
        return Promise.resolve({ valueType: 'stringArray', value: ['+19999999999'] });
      }
      return Promise.resolve(null);
    });

    expect(await isAuthIdentifierAllowed('user@example.com', 'email')).toBe(true);
  });

  test('returns false when enforced and email is not in list', async () => {
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({ valueType: 'boolean', value: true });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL) {
        return Promise.resolve({ valueType: 'stringArray', value: ['other@example.com'] });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE) {
        return Promise.resolve({ valueType: 'stringArray', value: ['+19999999999'] });
      }
      return Promise.resolve(null);
    });

    expect(await isAuthIdentifierAllowed('user@example.com', 'email')).toBe(false);
  });

  test('returns false when enforced and email list is empty (fail closed)', async () => {
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({ valueType: 'boolean', value: true });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL) {
        return Promise.resolve({ valueType: 'stringArray', value: [] });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE) {
        return Promise.resolve({ valueType: 'stringArray', value: ['+1'] });
      }
      return Promise.resolve(null);
    });

    expect(await isAuthIdentifierAllowed('user@example.com', 'email')).toBe(false);
  });

  test('returns false when enforced and phone list is empty', async () => {
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED) {
        return Promise.resolve({ valueType: 'boolean', value: true });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL) {
        return Promise.resolve({ valueType: 'stringArray', value: ['a@b.com'] });
      }
      if (key === PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE) {
        return Promise.resolve({ valueType: 'stringArray', value: [] });
      }
      return Promise.resolve(null);
    });

    expect(await isAuthIdentifierAllowed('+15551234567', 'sms')).toBe(false);
  });
});

describe('upsertPlatformSetting', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockUpsertByKey.mockReset();
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
    mockUpsertByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
        description: '',
        valueType: 'stringArray',
        value: [],
        lastUpdatedBy: 'u',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  test('normalizes email allowlist values on write', async () => {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
      valueType: 'stringArray',
      value: ['USER@EXAMPLE.COM'],
      lastUpdatedBy: 'actor-id',
    });

    expect(mockUpsertByKey).toHaveBeenCalled();
    const firstUpsert = mockUpsertByKey.mock.calls[0] as unknown as [unknown];
    const arg = firstUpsert[0] as { value: string[] };
    expect(arg.value).toEqual(['user@example.com']);
  });
});

describe('ensureAuthAllowlistPlatformSettingsExist', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockUpsertByKey.mockReset();
    mockUpsertByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
        description: '',
        valueType: 'stringArray',
        value: [],
        lastUpdatedBy: 'u',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  test('creates all three allowlist settings when missing', async () => {
    mockFindByKey.mockImplementation(() => Promise.resolve(null));

    await ensureAuthAllowlistPlatformSettingsExist('admin-user-id');

    expect(mockUpsertByKey).toHaveBeenCalledTimes(3);
  });

  test('does not upsert when every allowlist key already exists', async () => {
    mockFindByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: 'x',
        description: '',
        valueType: 'boolean',
        value: false,
        lastUpdatedBy: 'u',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    await ensureAuthAllowlistPlatformSettingsExist('admin-user-id');

    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });
});

describe('ensureAgeVerificationPlatformSettingsExist', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockUpsertByKey.mockReset();
    mockUpsertByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ENABLED,
        description: '',
        valueType: 'boolean',
        value: false,
        lastUpdatedBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  test('creates default VerifyMy business settings ID when missing', async () => {
    mockFindByKey.mockImplementation(() => Promise.resolve(null));

    await ensureAgeVerificationPlatformSettingsExist();

    expect(mockUpsertByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID,
        valueType: 'string',
        value: '',
        lastUpdatedBy: 'system',
      }),
    );
  });

  test('does not overwrite existing age verification settings', async () => {
    mockFindByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID,
        description: 'existing',
        valueType: 'string',
        value: 'bs-existing',
        lastUpdatedBy: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await ensureAgeVerificationPlatformSettingsExist();

    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });
});

describe('CSAM hash services setting', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockUpsertByKey.mockReset();
    mockUpsertByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
        description: '',
        valueType: 'stringArray',
        value: ['arachnid_shield'],
        lastUpdatedBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  test('sanitizes CSAM hash services: keeps only valid values', () => {
    const input = ['ncmec', 'arachnid_shield', 'invalid_source', 'malicious'];
    const coerced = coercePlatformSettingValue('stringArray', input);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      'stringArray',
      coerced,
    ) as string[];
    expect(out).toEqual(['ncmec', 'arachnid_shield']);
  });

  test('sanitizes CSAM hash services: normalizes case and whitespace', () => {
    const input = [' NCMEC ', 'Arachnid_Shield', 'ncmec'];
    const coerced = coercePlatformSettingValue('stringArray', input);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      'stringArray',
      coerced,
    ) as string[];
    expect(out).toEqual(['ncmec', 'arachnid_shield']);
  });

  test('sanitizes CSAM hash services: strips invalid entries after normalization', () => {
    const input = ['  invalid  ', 'NCMEC'];
    const coerced = coercePlatformSettingValue('stringArray', input);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      'stringArray',
      coerced,
    ) as string[];
    expect(out).toEqual(['ncmec']);
  });

  test('sanitizes CSAM hash services: returns empty for all invalid', () => {
    const input = ['not_a_service', 'also_invalid'];
    const coerced = coercePlatformSettingValue('stringArray', input);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      'stringArray',
      coerced,
    ) as string[];
    expect(out).toEqual([]);
  });

  test('sanitizes CSAM hash services: accepts empty array', () => {
    const coerced = coercePlatformSettingValue('stringArray', []);
    const out = sanitizePlatformSettingValueAfterCoerce(
      PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      'stringArray',
      coerced,
    ) as string[];
    expect(out).toEqual([]);
  });

  test('sanitizes NCMEC CyberTipline env to test or production only', () => {
    expect(
      sanitizePlatformSettingValueAfterCoerce(
        PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV,
        'string',
        'production',
      ),
    ).toBe('production');
    expect(() =>
      sanitizePlatformSettingValueAfterCoerce(
        PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV,
        'string',
        'staging',
      ),
    ).toThrow(/test or production/);
  });

  test('ensureNcmecCyberTiplinePlatformSettingExists creates setting when missing', async () => {
    mockFindByKey.mockResolvedValue(null);
    await ensureNcmecCyberTiplinePlatformSettingExists();
    expect(mockUpsertByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        key: PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV,
        valueType: 'string',
        value: 'test',
        lastUpdatedBy: 'system',
      }),
    );
  });

  test('ensureNcmecCyberTiplinePlatformSettingExists skips when setting exists', async () => {
    mockFindByKey.mockResolvedValue({
      _id: new ObjectId(),
      key: PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV,
      description: 'existing',
      valueType: 'string',
      value: 'production',
      lastUpdatedBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ensureNcmecCyberTiplinePlatformSettingExists();
    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });

  test('ensureCsamHashServicesPlatformSettingExists creates setting when missing', async () => {
    mockFindByKey.mockResolvedValue(null);
    await ensureCsamHashServicesPlatformSettingExists();
    expect(mockUpsertByKey).toHaveBeenCalledTimes(1);
    expect(mockUpsertByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        key: PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
        description: 'Active CSAM hash-checking services (default: arachnid_shield)',
        valueType: 'stringArray',
        value: ['arachnid_shield'],
        lastUpdatedBy: 'system',
      }),
    );
  });

  test('ensureCsamHashServicesPlatformSettingExists skips when setting exists', async () => {
    mockFindByKey.mockResolvedValue({
      _id: new ObjectId(),
      key: PLATFORM_SETTING_KEYS.CSAM_HASH_SERVICES,
      description: 'existing',
      valueType: 'stringArray',
      value: ['ncmec'],
      lastUpdatedBy: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await ensureCsamHashServicesPlatformSettingExists();
    expect(mockUpsertByKey).not.toHaveBeenCalled();
  });
});
