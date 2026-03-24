/**
 * Redis cache + invalidation for auth allowlist (isolated mocks).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_SETTING_KEYS } from '../constants/platform-settings-keys';

const mockFindByKey = mock(((_key: string) => Promise.resolve(null)) as (key: string) => Promise<unknown>);
const mockUpsertByKey = mock(() =>
  Promise.resolve({
    _id: new ObjectId(),
    key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
    description: '',
    valueType: 'stringArray' as const,
    value: [] as string[],
    lastUpdatedBy: 'u',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
);

const mockRedisGet = mock(() => Promise.resolve(null as string | null));
const mockRedisDel = mock(() => Promise.resolve(1));
const mockRedisSet = mock(() => Promise.resolve('OK'));

mock.module('../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockFindByKey,
    findAll: mock(() => Promise.resolve([])),
    upsertByKey: mockUpsertByKey,
  }),
}));

mock.module('../db', () => ({
  getRedis: mock(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  })),
  isRedisConnected: mock(() => true),
}));

mock.module('../db/redis', () => ({
  RedisKeys: {
    platformAuthAllowlistCache: () => 'platform_setting_cache:auth_allowlist',
  },
}));

import { isAuthIdentifierAllowed, upsertPlatformSetting } from './platform-settings.service';

describe('loadAuthAllowlistState with Redis', () => {
  beforeEach(() => {
    mockFindByKey.mockClear();
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisDel.mockClear();
    mockUpsertByKey.mockClear();
    mockRedisGet.mockImplementation(() => Promise.resolve(null));
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

  test('uses cached JSON and does not call Mongo when Redis returns a hit', async () => {
    mockRedisGet.mockImplementation(() =>
      Promise.resolve(
        JSON.stringify({
          enforced: true,
          emails: ['allowed@example.com'],
          phones: ['+19999999999'],
        })
      )
    );

    expect(await isAuthIdentifierAllowed('allowed@example.com', 'email')).toBe(true);
    expect(mockFindByKey).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  test('on cache miss loads from Mongo and writes Redis SET', async () => {
    mockRedisGet.mockImplementation(() => Promise.resolve(null));
    mockFindByKey.mockImplementation(() => Promise.resolve(null));

    await isAuthIdentifierAllowed('any@example.com', 'email');

    expect(mockFindByKey).toHaveBeenCalledTimes(3);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'platform_setting_cache:auth_allowlist',
      expect.any(String),
      'EX',
      45
    );
  });
});

describe('upsertPlatformSetting cache invalidation with Redis', () => {
  beforeEach(() => {
    mockFindByKey.mockClear();
    mockRedisDel.mockClear();
    mockUpsertByKey.mockClear();
    mockFindByKey.mockImplementation(() => Promise.resolve(null));
    mockUpsertByKey.mockImplementation(() =>
      Promise.resolve({
        _id: new ObjectId(),
        key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
        description: '',
        valueType: 'stringArray',
        value: ['a@b.com'],
        lastUpdatedBy: 'u',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );
  });

  test('calls Redis DEL on auth allowlist cache key after upsert', async () => {
    await upsertPlatformSetting({
      key: PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL,
      valueType: 'stringArray',
      value: ['user@example.com'],
      lastUpdatedBy: 'actor',
    });

    expect(mockRedisDel).toHaveBeenCalledTimes(1);
    expect(mockRedisDel).toHaveBeenCalledWith('platform_setting_cache:auth_allowlist');
  });
});
