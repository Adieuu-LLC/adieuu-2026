/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockGetReferralLandingData = mock((): any => Promise.resolve({ valid: false }));
const mockCheckRateLimit = mock(() => Promise.resolve({ allowed: true, remaining: 59 }));

mock.module('../../services/referral.service', () => ({
  getReferralLandingData: mockGetReferralLandingData,
}));

mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

mock.module('../auth/controller', () => ({
  getClientIp: () => '127.0.0.1',
}));

mock.module('../../utils/sanitize', () => ({
  sanitizePathForLog: (path: string) => path,
  sanitizeString: (raw: string) => ({ value: raw }),
}));

mock.module('../../utils/adieuuLogger', () => ({
  default: { debug: mock(), info: mock(), warn: mock(), error: mock() },
}));

mock.module('../../utils/response', () => ({
  success: (data: unknown) => ({ success: true, data }),
  error: () => ({ success: false }),
  localizedErrors: {},
}));

const { publicReferRoutes } = await import('./index');

describe('public refer route', () => {
  beforeEach(() => {
    mockGetReferralLandingData.mockClear();
    mockCheckRateLimit.mockClear();
  });

  test('exports publicReferRoutes router', () => {
    expect(publicReferRoutes).toBeDefined();
  });
});
