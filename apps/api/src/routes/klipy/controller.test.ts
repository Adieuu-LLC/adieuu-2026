import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type { KlipySearchResponse } from '../../services/klipy.service';

mock.module('../../utils/adieuuLogger', () => ({
  default: {
    warn: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
  },
}));

const getKlipySearchConfigMock = mock(async () => ({ limit: 30, windowSeconds: 60 }));
const checkRateLimitMock = mock(async () => ({
  allowed: true,
  remaining: 29,
  resetAt: Math.ceil(Date.now() / 1000) + 60,
  limit: 30,
}));
const escalateKlipyThrottleMock = mock(async () => {});

mock.module('../../services/rate-limit.service', () => ({
  getKlipySearchConfig: getKlipySearchConfigMock,
  checkRateLimit: checkRateLimitMock,
  escalateKlipyThrottle: escalateKlipyThrottleMock,
}));

const emptySearchResponse: KlipySearchResponse = {
  items: [],
  currentPage: 1,
  perPage: 6,
  hasNext: false,
};

const searchKlipyMock = mock(async (): Promise<KlipySearchResponse> => emptySearchResponse);
const trendingKlipyMock = mock(async (): Promise<KlipySearchResponse> => emptySearchResponse);
const triggerKlipyShareMock = mock(async () => {});

mock.module('../../services/klipy.service', () => ({
  searchKlipy: searchKlipyMock,
  trendingKlipy: trendingKlipyMock,
  triggerKlipyShare: triggerKlipyShareMock,
}));

const logKlipySearchMock = mock(async () => {});

mock.module('../../models/klipy-search-log', () => ({
  logKlipySearch: logKlipySearchMock,
}));

const mockConversationFindById = mock(async (): Promise<unknown> => null);

mock.module('../../repositories/conversation.repository', () => ({
  getConversationRepository: mock(() => ({
    findById: mockConversationFindById,
  })),
}));

mock.module('../../models/conversation', () => ({
  GIF_CONTENT_FILTER_VALUES: ['off', 'low', 'medium', 'high'],
}));

import {
  clampKlipyPage,
  clampKlipyPerPage,
  klipySearchResult,
  klipyTrendingResult,
  klipyShareResult,
} from './controller';
import { klipyRoutes } from './index';

klipyRoutes.use(testIdentityEnrichment(ROUTE_TEST_IDENTITY_ID, { username: 'me' }));

afterAll(() => {
  mock.restore();
});

describe('clampKlipyPage / clampKlipyPerPage', () => {
  test('clamps page and per_page within bounds', () => {
    expect(clampKlipyPage(null)).toBe(1);
    expect(clampKlipyPage('2')).toBe(2);
    expect(clampKlipyPage('0')).toBe(1);
    expect(clampKlipyPage('500')).toBe(100);
    expect(clampKlipyPage('nan')).toBe(1);
    expect(clampKlipyPerPage(null)).toBe(6);
    expect(clampKlipyPerPage('10')).toBe(10);
    expect(clampKlipyPerPage('99')).toBe(50);
  });
});

describe('klipySearchResult', () => {
  beforeEach(() => {
    getKlipySearchConfigMock.mockClear();
    checkRateLimitMock.mockClear();
    escalateKlipyThrottleMock.mockClear();
    searchKlipyMock.mockClear();
    logKlipySearchMock.mockClear();
    mockConversationFindById.mockClear();
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Math.ceil(Date.now() / 1000) + 60,
      limit: 30,
    });
  });

  test('returns validation_failed when q is missing', async () => {
    const qs = new URLSearchParams();
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
  });

  test('returns validation_failed when q is empty after sanitization', async () => {
    const qs = new URLSearchParams({ q: '\u200B' });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(searchKlipyMock).not.toHaveBeenCalled();
  });

  test('strips zero-width chars and searches with cleaned query', async () => {
    const qs = new URLSearchParams({ q: 'hello\u200Bworld' });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'sticker', qs);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toEqual(emptySearchResponse);
    expect(searchKlipyMock).toHaveBeenCalledWith(
      'sticker',
      expect.objectContaining({ query: 'helloworld' }),
    );
    expect(logKlipySearchMock).toHaveBeenCalledWith('helloworld', 'sticker');
  });

  test('returns rate_limited and escalates when check disallows', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.ceil(Date.now() / 1000) + 30,
      limit: 30,
    });
    const qs = new URLSearchParams({ q: 'cats' });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r.ok).toBe(false);
    if (!r.ok && r.kind === 'rate_limited') {
      expect(r.retryAfter).toBeGreaterThanOrEqual(1);
    } else {
      throw new Error('expected rate_limited');
    }
    expect(escalateKlipyThrottleMock).toHaveBeenCalled();
    expect(searchKlipyMock).not.toHaveBeenCalled();
    expect(logKlipySearchMock).not.toHaveBeenCalled();
  });

  test('returns validation_failed when sanitized query exceeds 200 chars', async () => {
    const long = 'a'.repeat(201);
    const qs = new URLSearchParams({ q: long });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
  });

  test('allows query of exactly 200 characters', async () => {
    const qs = new URLSearchParams({ q: 'a'.repeat(200) });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r.ok).toBe(true);
    expect(searchKlipyMock).toHaveBeenCalledWith(
      'gif',
      expect.objectContaining({ query: 'a'.repeat(200) }),
    );
  });

  test('passes contentFilter when conversation_id resolves', async () => {
    const convId = '507f1f77bcf86cd799439011';
    mockConversationFindById.mockResolvedValueOnce({
      _id: { toHexString: () => convId, equals: () => true },
      participants: [ROUTE_TEST_IDENTITY_ID],
      gifContentFilter: 'medium',
    });
    const qs = new URLSearchParams({ q: 'cats', conversation_id: convId });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r.ok).toBe(true);
    expect(searchKlipyMock).toHaveBeenCalledWith(
      'gif',
      expect.objectContaining({ contentFilter: 'medium' }),
    );
  });

  test('omits contentFilter when conversation_id is missing', async () => {
    const qs = new URLSearchParams({ q: 'dogs' });
    const r = await klipySearchResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r.ok).toBe(true);
    expect(searchKlipyMock).toHaveBeenCalledWith(
      'gif',
      expect.objectContaining({ contentFilter: undefined }),
    );
  });
});

describe('klipyTrendingResult', () => {
  beforeEach(() => {
    checkRateLimitMock.mockClear();
    escalateKlipyThrottleMock.mockClear();
    trendingKlipyMock.mockClear();
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Math.ceil(Date.now() / 1000) + 60,
      limit: 30,
    });
  });

  test('calls trendingKlipy with clamped pagination', async () => {
    const qs = new URLSearchParams({ page: '5', per_page: '20' });
    const r = await klipyTrendingResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', qs);
    expect(r.ok).toBe(true);
    expect(trendingKlipyMock).toHaveBeenCalledWith('gif', {
      page: 5,
      perPage: 20,
      identityId: ROUTE_TEST_IDENTITY_ID.toHexString(),
    });
  });

  test('returns rate_limited when check disallows', async () => {
    checkRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Math.floor(Date.now() / 1000) + 45,
      limit: 30,
    });
    const r = await klipyTrendingResult(ROUTE_TEST_IDENTITY_ID.toHexString(), 'gif', new URLSearchParams());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe('rate_limited');
    expect(trendingKlipyMock).not.toHaveBeenCalled();
  });
});

describe('klipyShareResult', () => {
  beforeEach(() => {
    triggerKlipyShareMock.mockClear();
  });

  test('validation_failed on bad body', () => {
    expect(klipyShareResult(ROUTE_TEST_IDENTITY_ID.toHexString(), {})).toEqual({
      ok: false,
      kind: 'validation_failed',
    });
    expect(triggerKlipyShareMock).not.toHaveBeenCalled();
  });

  test('passes sanitized slug and optional searchTerm', () => {
    const r = klipyShareResult(ROUTE_TEST_IDENTITY_ID.toHexString(), {
      slug: 'my-slug_1',
      type: 'gif',
      searchTerm: 'hello\u200B',
    });
    expect(r).toEqual({ ok: true });
    expect(triggerKlipyShareMock).toHaveBeenCalledWith(
      'gif',
      'my-slug_1',
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      'hello',
    );
  });

  test('omits searchTerm when empty after sanitize', () => {
    klipyShareResult(ROUTE_TEST_IDENTITY_ID.toHexString(), {
      slug: 'abc',
      type: 'sticker',
      searchTerm: '\u200B',
    });
    expect(triggerKlipyShareMock).toHaveBeenCalledWith(
      'sticker',
      'abc',
      ROUTE_TEST_IDENTITY_ID.toHexString(),
      undefined,
    );
  });

  test('validation_failed when slug empty after idenhanced', () => {
    const r = klipyShareResult(ROUTE_TEST_IDENTITY_ID.toHexString(), {
      slug: '!!!',
      type: 'gif',
    });
    expect(r).toEqual({ ok: false, kind: 'validation_failed' });
    expect(triggerKlipyShareMock).not.toHaveBeenCalled();
  });
});

describe('klipyRoutes smoke', () => {
  beforeEach(() => {
    checkRateLimitMock.mockClear();
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 29,
      resetAt: Math.ceil(Date.now() / 1000) + 60,
      limit: 30,
    });
    searchKlipyMock.mockClear();
    triggerKlipyShareMock.mockClear();
  });

  test('GET /klipy/gifs/search returns 401 without session cookie', async () => {
    const handler = klipyRoutes.handler();
    const res = await handler(new Request('http://localhost/klipy/gifs/search?q=test'));
    expect(res.status).toBe(401);
  });

  test('GET /klipy/gifs/search returns 200 with session cookie', async () => {
    const handler = klipyRoutes.handler();
    const res = await handler(
      new Request('http://localhost/klipy/gifs/search?q=hi', {
        headers: { Cookie: 'adieuu_session=x' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown };
    expect(json.success).toBe(true);
    expect(searchKlipyMock).toHaveBeenCalled();
  });

  test('POST /klipy/share returns 401 without session cookie', async () => {
    const handler = klipyRoutes.handler();
    const res = await handler(
      new Request('http://localhost/klipy/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'slug1', type: 'gif' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(triggerKlipyShareMock).not.toHaveBeenCalled();
  });
});
