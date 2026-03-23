import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';

const mockFindByKey = mock((key: string) => Promise.resolve(null as unknown));
const mockUpsertByKey = mock(() =>
  Promise.resolve({
    _id: new ObjectId(),
    key: 'x',
    description: '',
    valueType: 'stringArray' as const,
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
  isAuthIdentifierAllowed,
  isPlatformAdmin,
  upsertPlatformSetting,
} from './platform-settings.service';

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

describe('isPlatformAdmin', () => {
  beforeEach(() => {
    mockFindByKey.mockReset();
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
  });

  test('returns false when setting is missing', async () => {
    expect(await isPlatformAdmin(new ObjectId())).toBe(false);
  });

  test('returns false when value is not objectIdArray', async () => {
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST) {
        return Promise.resolve({ valueType: 'stringArray', value: [] });
      }
      return Promise.resolve(null);
    });
    expect(await isPlatformAdmin(new ObjectId())).toBe(false);
  });

  test('returns true when user id is in list', async () => {
    const adminId = new ObjectId();
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST) {
        return Promise.resolve({ valueType: 'objectIdArray', value: [adminId] });
      }
      return Promise.resolve(null);
    });
    expect(await isPlatformAdmin(adminId)).toBe(true);
    expect(await isPlatformAdmin(adminId.toHexString())).toBe(true);
  });

  test('returns false when user id is not in list', async () => {
    const adminId = new ObjectId();
    mockFindByKey.mockImplementation((key: string) => {
      if (key === PLATFORM_SETTING_KEYS.ADMIN_ACCOUNT_LIST) {
        return Promise.resolve({ valueType: 'objectIdArray', value: [new ObjectId()] });
      }
      return Promise.resolve(null);
    });
    expect(await isPlatformAdmin(adminId)).toBe(false);
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
    const arg = mockUpsertByKey.mock.calls[0]?.[0] as { value: string[] };
    expect(arg.value).toEqual(['user@example.com']);
  });
});
