import { afterAll, describe, expect, test, mock, beforeEach } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { UserDocument } from '../../models/user';

const mockRedisGet = mock((_key: string): Promise<string | null> => Promise.resolve(null));
const mockRedisSet = mock((..._args: unknown[]): Promise<string> => Promise.resolve('OK'));

mock.module('../../config', () => ({
  config: {
    env: 'development',
    geo: {
      enabled: true,
      iplocate: {
        apiKey: '',
        baseUrl: 'https://www.iplocate.io/api/lookup',
        timeoutMs: 2500,
      },
      cacheTtlSeconds: 86_400,
      recheckIntervalDays: 30,
      trustProxyHeaders: false,
    },
    security: {
      accountHashSecret: 'test-secret',
    },
  },
}));

mock.module('../../db/redis', () => ({
  getRedis: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
  }),
  isRedisConnected: () => true,
  RedisKeys: {
    geoIpLookup: (h: string) => `geo:ip:${h}`,
    geoNegativeLookup: (h: string) => `geo:ip_neg:${h}`,
  },
}));

const mockLookupIp = mock((_ip: string) =>
  Promise.resolve({ countryCode: 'US', subdivisionName: 'Tennessee' } as {
    countryCode: string;
    subdivisionName?: string;
  } | null),
);

mock.module('./iplocate.client', () => ({
  lookupIp: mockLookupIp,
}));

const mockUpdateGeo = mock((..._args: unknown[]) => Promise.resolve());

mock.module('../../repositories/user.repository', () => ({
  getUserRepository: () => ({
    updateGeo: mockUpdateGeo,
  }),
}));

mock.module('./geo-settings', () => ({
  isGeoLookupEnabled: () => Promise.resolve(true),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  },
}));

import { resolveJurisdiction, refreshUserGeoIfStale, hashIpForGeo } from './geo.service';

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  mockRedisGet.mockReset();
  mockRedisSet.mockReset();
  mockLookupIp.mockReset();
  mockUpdateGeo.mockReset();

  delete process.env.DEV_FORCE_ANONYMOUS_IP;

  mockRedisGet.mockImplementation(() => Promise.resolve(null));
  mockRedisSet.mockImplementation((..._args: unknown[]) => Promise.resolve('OK'));
  mockLookupIp.mockImplementation(() =>
    Promise.resolve({ countryCode: 'US', subdivisionName: 'Tennessee' }),
  );
  mockUpdateGeo.mockImplementation(() => Promise.resolve());
});

function makeUser(overrides: Partial<UserDocument> = {}): UserDocument {
  return {
    _id: new ObjectId(),
    emailVerified: false,
    phoneVerified: false,
    failedAttempts: 0,
    identityCount: 0,
    identityLockoutDuration: 3600000,
    identityLoginAttempts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserDocument;
}

describe('resolveJurisdiction', () => {
  test('returns cached result from Redis on hit', async () => {
    const cached = JSON.stringify({ jurisdiction: 'US-TN', countryCode: 'US', regionCode: 'TN' });
    mockRedisGet.mockImplementation(() => Promise.resolve(cached));

    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toEqual({ jurisdiction: 'US-TN', countryCode: 'US', regionCode: 'TN' });
    expect(mockLookupIp).not.toHaveBeenCalled();
  });

  test('returns null and skips IPLocate on negative cache hit', async () => {
    mockRedisGet.mockImplementation((key: string) => {
      if (key.includes('ip_neg')) return Promise.resolve('1');
      return Promise.resolve(null);
    });

    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toBeNull();
    expect(mockLookupIp).not.toHaveBeenCalled();
  });

  test('calls IPLocate on cache miss and caches the result', async () => {
    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toEqual({ jurisdiction: 'US-TN', countryCode: 'US', regionCode: 'TN' });
    expect(mockLookupIp).toHaveBeenCalledWith('1.2.3.4');
    expect(mockRedisSet).toHaveBeenCalled();
  });

  test('preserves explicit false privacy flags from IPLocate', async () => {
    mockLookupIp.mockImplementation(() =>
      Promise.resolve({
        countryCode: 'US',
        subdivisionName: 'Tennessee',
        privacy: { isAnonymous: false, isAbuser: false },
      }),
    );

    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toEqual({
      jurisdiction: 'US-TN',
      countryCode: 'US',
      regionCode: 'TN',
      isAnonymous: false,
      isAbuser: false,
    });
  });

  test('omits privacy flags when IPLocate returns no privacy object', async () => {
    mockLookupIp.mockImplementation(() =>
      Promise.resolve({ countryCode: 'US', subdivisionName: 'Tennessee' }),
    );

    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toEqual({ jurisdiction: 'US-TN', countryCode: 'US', regionCode: 'TN' });
    expect(result?.isAnonymous).toBeUndefined();
    expect(result?.isAbuser).toBeUndefined();
  });

  test('sets negative cache when IPLocate returns null', async () => {
    mockLookupIp.mockImplementation(() => Promise.resolve(null));

    const result = await resolveJurisdiction('1.2.3.4');
    expect(result).toBeNull();

    const negCacheCall = mockRedisSet.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('ip_neg'),
    );
    expect(negCacheCall).toBeDefined();
  });

  test('DEV_FORCE_ANONYMOUS_IP overrides IPLocate privacy on cache miss', async () => {
    const previous = process.env.DEV_FORCE_ANONYMOUS_IP;
    process.env.DEV_FORCE_ANONYMOUS_IP = 'true';
    try {
      mockLookupIp.mockImplementation(() =>
        Promise.resolve({
          countryCode: 'GB',
          privacy: { isAnonymous: false, isAbuser: false },
        }),
      );

      const result = await resolveJurisdiction('185.248.85.59');
      expect(result?.isAnonymous).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.DEV_FORCE_ANONYMOUS_IP;
      } else {
        process.env.DEV_FORCE_ANONYMOUS_IP = previous;
      }
    }
  });

  test('DEV_FORCE_ANONYMOUS_IP overrides cached geo privacy flags on cache hit', async () => {
    const previous = process.env.DEV_FORCE_ANONYMOUS_IP;
    process.env.DEV_FORCE_ANONYMOUS_IP = 'true';
    try {
      const cached = JSON.stringify({
        jurisdiction: 'GB',
        countryCode: 'GB',
        isAnonymous: false,
      });
      mockRedisGet.mockImplementation(() => Promise.resolve(cached));

      const result = await resolveJurisdiction('185.248.85.59');
      expect(result).toEqual({
        jurisdiction: 'GB',
        countryCode: 'GB',
        isAnonymous: true,
      });
      expect(mockLookupIp).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.DEV_FORCE_ANONYMOUS_IP;
      } else {
        process.env.DEV_FORCE_ANONYMOUS_IP = previous;
      }
    }
  });
});

describe('refreshUserGeoIfStale', () => {
  test('short-circuits when geo is fresh and IP matches', async () => {
    const ipHash = hashIpForGeo('1.2.3.4');
    const user = makeUser({
      geo: {
        jurisdiction: 'US-TN',
        countryCode: 'US',
        regionCode: 'TN',
        ipHash,
        checkedAt: new Date(),
      },
    });

    const result = await refreshUserGeoIfStale(user, '1.2.3.4');
    expect(result?.jurisdiction).toBe('US-TN');
    expect(mockLookupIp).not.toHaveBeenCalled();
    expect(mockUpdateGeo).not.toHaveBeenCalled();
  });

  test('refreshes when IP hash differs', async () => {
    const user = makeUser({
      geo: {
        jurisdiction: 'US-TN',
        countryCode: 'US',
        regionCode: 'TN',
        ipHash: 'stale-hash',
        checkedAt: new Date(),
      },
    });

    const result = await refreshUserGeoIfStale(user, '5.6.7.8');
    expect(result?.jurisdiction).toBe('US-TN');
    expect(mockUpdateGeo).toHaveBeenCalled();
  });

  test('refreshes when geo is older than recheckIntervalDays', async () => {
    const ipHash = hashIpForGeo('1.2.3.4');
    const staleDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const user = makeUser({
      geo: {
        jurisdiction: 'US-TN',
        countryCode: 'US',
        regionCode: 'TN',
        ipHash,
        checkedAt: staleDate,
      },
    });

    const result = await refreshUserGeoIfStale(user, '1.2.3.4');
    expect(result?.jurisdiction).toBe('US-TN');
    expect(mockUpdateGeo).toHaveBeenCalled();
  });

  test('refreshes when user has no geo', async () => {
    const user = makeUser();

    const result = await refreshUserGeoIfStale(user, '1.2.3.4');
    expect(result?.jurisdiction).toBe('US-TN');
    expect(mockUpdateGeo).toHaveBeenCalled();
  });

  test('returns existing geo when IPLocate fails', async () => {
    mockLookupIp.mockImplementation(() => Promise.resolve(null));
    const existing = {
      jurisdiction: 'US-CA',
      countryCode: 'US',
      regionCode: 'CA',
      ipHash: 'stale-hash',
      checkedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    };
    const user = makeUser({ geo: existing });

    const result = await refreshUserGeoIfStale(user, '5.6.7.8');
    expect(result?.jurisdiction).toBe('US-CA');
    expect(mockUpdateGeo).not.toHaveBeenCalled();
  });

  test('returns null when user has no geo and IPLocate fails', async () => {
    mockLookupIp.mockImplementation(() => Promise.resolve(null));
    const user = makeUser();

    const result = await refreshUserGeoIfStale(user, '1.2.3.4');
    expect(result).toBeNull();
  });

  test('DEV_FORCE_ANONYMOUS_IP overrides fresh user geo on cache hit', async () => {
    const previous = process.env.DEV_FORCE_ANONYMOUS_IP;
    process.env.DEV_FORCE_ANONYMOUS_IP = 'true';
    try {
      const cached = JSON.stringify({
        jurisdiction: 'GB',
        countryCode: 'GB',
        isAnonymous: false,
      });
      mockRedisGet.mockImplementation(() => Promise.resolve(cached));

      const user = makeUser();
      const result = await refreshUserGeoIfStale(user, '185.248.85.59');

      expect(result?.isAnonymous).toBe(true);
      expect(mockUpdateGeo).toHaveBeenCalledWith(
        user._id,
        expect.objectContaining({ isAnonymous: true }),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DEV_FORCE_ANONYMOUS_IP;
      } else {
        process.env.DEV_FORCE_ANONYMOUS_IP = previous;
      }
    }
  });
});
