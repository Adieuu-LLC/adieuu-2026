import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import type { Locale } from '../../i18n';
import type { RouteContext } from '../../router/types';

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  },
}));

const findByJurisdictionsMock = mock(
  async (_codes: string[]): Promise<
    import('../../models/jurisdiction-requirement').JurisdictionRequirementDocument[]
  > => [],
);

const findRequiringAgeVerificationMock = mock(
  async (_slugs: readonly string[]): Promise<
    import('../../models/jurisdiction-requirement').JurisdictionRequirementDocument[]
  > => [],
);

mock.module('../../repositories/jurisdiction-requirement.repository', () => ({
  getJurisdictionRequirementRepository: () => ({
    findByJurisdictions: findByJurisdictionsMock,
    findRequiringAgeVerification: findRequiringAgeVerificationMock,
  }),
}));

const mockUserId = new ObjectId();
const mockSession = {
  type: 'account' as const,
  userId: mockUserId.toHexString(),
  identifier: 'test@example.com',
  identifierType: 'email' as const,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
};

mock.module('../../services/session.service', () => ({
  requireAccountSession: mock((request: Request) => {
    const cookie = request.headers.get('Cookie') ?? '';
    if (cookie.includes('adieuu_session=')) {
      return Promise.resolve(mockSession);
    }
    return Promise.resolve(null);
  }),
}));

import {
  parseSanitizedJurisdictionCodes,
  getJurisdictionRequirementsByCodes,
  getJurisdictionRequirementsCatalog,
  getJurisdictionRequirementsCatalogCtrl,
  getJurisdictionRequirementsCtrl,
  MAX_JURISDICTION_QUERY_CODES,
} from './controller';
import { geoRoutes } from './index';

afterAll(() => {
  mock.restore();
});

describe('parseSanitizedJurisdictionCodes', () => {
  test('returns empty array for null or empty input', () => {
    expect(parseSanitizedJurisdictionCodes(null)).toEqual([]);
    expect(parseSanitizedJurisdictionCodes('')).toEqual([]);
    expect(parseSanitizedJurisdictionCodes('   ')).toEqual([]);
  });

  test('trims segments, uppercases, splits on comma', () => {
    expect(parseSanitizedJurisdictionCodes('  us-tn , fr ')).toEqual(['US-TN', 'FR']);
  });

  test('removes characters outside alphanumdash from segments', () => {
    expect(parseSanitizedJurisdictionCodes('US_TN')).toEqual(['USTN']);
    expect(parseSanitizedJurisdictionCodes('US-TN!,EU')).toEqual(['US-TN', 'EU']);
  });

  test('strips zero-width and control characters', () => {
    expect(parseSanitizedJurisdictionCodes('US\u200B-TN,\uFEFFEUTest')).toEqual(['US-TN', 'EUTEST']);
  });

  test('omits empty segments', () => {
    expect(parseSanitizedJurisdictionCodes('US-TN,,FR,')).toEqual(['US-TN', 'FR']);
  });
});

describe('getJurisdictionRequirementsByCodes', () => {
  beforeEach(() => {
    findByJurisdictionsMock.mockClear();
    findByJurisdictionsMock.mockImplementation(async () => []);
  });

  test('calls findByJurisdictions with given codes and maps to public shape', async () => {
    const now = new Date();
    const doc = {
      _id: new ObjectId(),
      createdAt: now,
      updatedAt: now,
      jurisdiction: 'US-TN',
      jurisdictionName: 'Tennessee',
      region: 'United States',
      requirements: ['age_verification'] as string[],
      compatibleMethods: ['government_id'] as string[],
      regulatoryBody: undefined,
      legislation: [] as { name: string }[],
      notes: undefined,
      status: 'enacted' as const,
    };

    findByJurisdictionsMock.mockImplementation(async (codes: string[]) => {
      expect(codes).toEqual(['US-TN']);
      return [doc];
    });

    const out = await getJurisdictionRequirementsByCodes(['US-TN']);
    expect(out).toEqual([
      {
        jurisdiction: 'US-TN',
        jurisdictionName: 'Tennessee',
        region: 'United States',
        requirements: ['age_verification'],
        compatibleMethods: ['government_id'],
        regulatoryBody: undefined,
        legislation: [],
        notes: undefined,
        status: 'enacted',
      },
    ]);
  });
});

function makeRouteContext(request: Request): RouteContext {
  const url = new URL(request.url);
  return {
    request,
    url,
    params: {},
    query: url.searchParams,
    requestId: 'test-req',
    locale: 'en' as Locale,
    errors: {
      badRequest: () => new Response(null, { status: 400 }),
      unauthorized: () => new Response(null, { status: 401 }),
      forbidden: () => new Response(null, { status: 403 }),
      notFound: () => new Response(null, { status: 404 }),
      methodNotAllowed: () => new Response(null, { status: 405 }),
      rateLimited: () => new Response(null, { status: 429 }),
      conflict: () => new Response(null, { status: 409 }),
      internal: () => new Response(null, { status: 500 }),
      validationFailed: () => new Response(JSON.stringify({ code: 'VALIDATION_FAILED' }), { status: 400 }),
      invalidEmail: () => new Response(null, { status: 400 }),
      invalidPhone: () => new Response(null, { status: 400 }),
      verificationFailed: () => new Response(null, { status: 400 }),
      invalidOtp: () => new Response(null, { status: 400 }),
      otpExpired: () => new Response(null, { status: 400 }),
      tooManyAttempts: () => new Response(null, { status: 400 }),
      accountLocked: () => new Response(null, { status: 403 }),
      sessionExpired: () => new Response(null, { status: 401 }),
      sessionExpiredWithClearCookie: () => new Response(null, { status: 401 }),
      payloadTooLarge: () => new Response(null, { status: 413 }),
      alreadyOwned: () => new Response(null, { status: 409 }),
      signInRestricted: () => new Response(null, { status: 403 }),
    },
  };
}

describe('getJurisdictionRequirementsCtrl', () => {
  beforeEach(() => {
    findByJurisdictionsMock.mockClear();
    findByJurisdictionsMock.mockImplementation(async () => []);
  });

  test('returns 401 when session is missing', async () => {
    const request = new Request('http://localhost/geo/requirements');
    const res = await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(res.status).toBe(401);
  });

  test('returns validation failed when distinct code count exceeds cap', async () => {
    const codes = Array.from({ length: MAX_JURISDICTION_QUERY_CODES + 1 }, (_, i) => `X${i}`).join(',');
    const request = new Request(
      `http://localhost/geo/requirements?jurisdictions=${encodeURIComponent(codes)}`,
      { headers: { Cookie: 'adieuu_session=1' } },
    );
    const res = await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(res.status).toBe(400);
    expect(findByJurisdictionsMock).not.toHaveBeenCalled();
  });

  test('allows more than MAX entries when duplicates keep distinct count within cap', async () => {
    const repeated = Array.from({ length: MAX_JURISDICTION_QUERY_CODES + 5 }, () => 'US-TN').join(',');
    const request = new Request(
      `http://localhost/geo/requirements?jurisdictions=${encodeURIComponent(repeated)}`,
      { headers: { Cookie: 'adieuu_session=1' } },
    );
    const res = await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(res.status).toBe(200);
    expect(findByJurisdictionsMock).toHaveBeenCalled();
  });

  test('prefers jurisdictions over jurisdiction when both are present', async () => {
    const request = new Request(
      'http://localhost/geo/requirements?jurisdictions=EU&jurisdiction=FR',
      { headers: { Cookie: 'adieuu_session=1' } },
    );
    await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(findByJurisdictionsMock).toHaveBeenCalledWith(['EU']);
  });

  test('reads jurisdiction when jurisdictions is absent', async () => {
    const request = new Request(
      'http://localhost/geo/requirements?jurisdiction=FR',
      { headers: { Cookie: 'adieuu_session=1' } },
    );
    await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(findByJurisdictionsMock).toHaveBeenCalledWith(['FR']);
  });

  test('returns empty data array when query has no usable codes', async () => {
    const request = new Request('http://localhost/geo/requirements?', {
      headers: { Cookie: 'adieuu_session=1' },
    });
    const res = await getJurisdictionRequirementsCtrl(makeRouteContext(request));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown };
    expect(json.success).toBe(true);
    expect(json.data).toEqual([]);
    expect(findByJurisdictionsMock).not.toHaveBeenCalled();
  });
});

describe('getJurisdictionRequirementsCatalog', () => {
  beforeEach(() => {
    findRequiringAgeVerificationMock.mockClear();
    findRequiringAgeVerificationMock.mockImplementation(async () => []);
  });

  test('returns mapped rows without verificationConfig', async () => {
    const now = new Date();
    findRequiringAgeVerificationMock.mockImplementation(async () => [
      {
        _id: new ObjectId(),
        createdAt: now,
        updatedAt: now,
        jurisdiction: 'US-TN',
        jurisdictionName: 'Tennessee',
        region: 'United States',
        requirements: ['age_verification'],
        compatibleMethods: ['email_age_check'],
        legislation: [{ name: 'Test Act' }],
        status: 'enacted' as const,
        verificationConfig: { vmyBusinessSettingsId: 'secret-id' },
      },
    ]);

    const out = await getJurisdictionRequirementsCatalog();
    expect(out).toHaveLength(1);
    expect(out[0]?.jurisdiction).toBe('US-TN');
    expect(out[0]).not.toHaveProperty('verificationConfig');
    expect(findRequiringAgeVerificationMock).toHaveBeenCalled();
  });
});

describe('getJurisdictionRequirementsCatalogCtrl', () => {
  beforeEach(() => {
    findRequiringAgeVerificationMock.mockClear();
    findRequiringAgeVerificationMock.mockImplementation(async () => []);
  });

  test('returns 200 without session cookie', async () => {
    const request = new Request('http://localhost/geo/requirements/catalog');
    const res = await getJurisdictionRequirementsCatalogCtrl(makeRouteContext(request));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
  });
});

describe('geoRoutes handler smoke', () => {
  beforeEach(() => {
    findByJurisdictionsMock.mockClear();
    findByJurisdictionsMock.mockImplementation(async () => []);
    findRequiringAgeVerificationMock.mockClear();
    findRequiringAgeVerificationMock.mockImplementation(async () => []);
  });

  test('GET /geo/requirements returns 401 without cookie', async () => {
    const handler = geoRoutes.handler();
    const response = await handler(
      new Request('http://localhost/geo/requirements?jurisdictions=US-TN'),
    );
    expect(response.status).toBe(401);
  });

  test('GET /geo/requirements returns 200 with cookie and echoes success shape', async () => {
    const handler = geoRoutes.handler();
    const response = await handler(
      new Request('http://localhost/geo/requirements?jurisdictions=EU', {
        headers: { Cookie: 'adieuu_session=z' },
      }),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(findByJurisdictionsMock).toHaveBeenCalledWith(['EU']);
  });

  test('GET /geo/requirements/catalog returns 200 without cookie', async () => {
    const handler = geoRoutes.handler();
    const response = await handler(
      new Request('http://localhost/geo/requirements/catalog'),
    );
    expect(response.status).toBe(200);
    const json = (await response.json()) as { success: boolean; data: unknown[] };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(findRequiringAgeVerificationMock).toHaveBeenCalled();
  });
});
