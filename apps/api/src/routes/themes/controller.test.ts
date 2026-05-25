import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { ROUTE_TEST_IDENTITY_ID, testIdentityEnrichment } from '../../test-fixtures/route-identity';
import type { CommunityThemeDocument } from '../../models/community-theme';
import type { StoredThemeDefinition } from '../../models/user-preferences';

const myIdentityId = ROUTE_TEST_IDENTITY_ID;
const otherIdentityId = new ObjectId();
const themeId = new ObjectId();
const customChecksum = 'abc123customchecksum000000000000000000000000000000000000000000';

const mockCheckRateLimit = mock(async () => ({
  allowed: true,
  remaining: 4,
  resetAt: Math.floor(Date.now() / 1000) + 3600,
}));
const mockComputeColorChecksum = mock(async () => customChecksum);

function solidColors(): StoredThemeDefinition['colors'] {
  const c = '#111111';
  return {
    bgPrimary: c,
    bgSecondary: c,
    bgTertiary: c,
    bgElevated: c,
    bgHover: c,
    bgActive: c,
    textPrimary: c,
    textSecondary: c,
    textMuted: c,
    textInverse: c,
    accentPrimary: c,
    accentPrimaryHover: c,
    accentPrimaryActive: c,
    accentSecondary: c,
    accentGlow: c,
    border: c,
    borderMuted: c,
    borderFocus: c,
    success: c,
    successBg: c,
    warning: c,
    warningBg: c,
    error: c,
    errorBg: c,
    info: c,
    infoBg: c,
    danger: c,
    logoPrimary: c,
    logoSecondary: c,
  };
}

function themeDefinition(): StoredThemeDefinition {
  return {
    id: 'custom-theme',
    name: 'Custom',
    description: '',
    version: 1,
    colors: solidColors(),
  };
}

function validUploadBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'My Theme',
    description: 'A nice theme',
    theme: themeDefinition(),
    tags: ['dark'],
    ...overrides,
  };
}

function makeThemeDoc(overrides: Partial<CommunityThemeDocument> = {}): CommunityThemeDocument {
  const now = new Date('2026-01-01T00:00:00.000Z');
  return {
    _id: themeId,
    createdAt: now,
    updatedAt: now,
    name: 'Shared Theme',
    description: 'Desc',
    authorIdentityId: otherIdentityId,
    authorUsername: 'author',
    theme: themeDefinition(),
    tags: ['dark'],
    colorChecksum: customChecksum,
    downloads: 3,
    upvotes: 5,
    upvotedBy: [],
    reported: false,
    removedByAdmin: false,
    ...overrides,
  };
}

const repoMock = {
  list: mock(async () => ({ themes: [makeThemeDoc()], total: 1 })),
  listColorChecksumsByAuthor: mock(async () => [customChecksum]),
  findById: mock(async () => makeThemeDoc()),
  incrementDownloads: mock(async () => {}),
  existsByChecksumAndAuthor: mock(async () => false),
  create: mock(async () => makeThemeDoc({ authorIdentityId: myIdentityId, authorUsername: 'me' })),
  deleteByIdAndAuthor: mock(async () => true),
  upvote: mock(async () => true),
  markReported: mock(async () => {}),
};

mock.module('../../repositories/community-theme.repository', () => ({
  getCommunityThemeRepository: () => repoMock,
}));
mock.module('../../services/rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));
mock.module('@adieuu/shared', () => ({
  computeColorChecksum: mockComputeColorChecksum,
}));

import {
  BUILTIN_CHECKSUMS,
  parseThemeListQuery,
  parseThemeId,
  listThemesResult,
  getSharedChecksumsResult,
  getThemeResult,
  uploadThemeResult,
  deleteThemeResult,
  upvoteThemeResult,
  reportThemeResult,
} from './controller';
import { themeRoutes } from './index';

themeRoutes.use(testIdentityEnrichment(myIdentityId, { username: 'me' }));

function makeRequest(
  path: string,
  options: { method?: string; body?: object; cookies?: string } = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('parseThemeListQuery', () => {
  test('clamps page and limit with defaults', () => {
    expect(parseThemeListQuery(new URLSearchParams())).toEqual({
      page: 1,
      limit: 20,
      search: undefined,
      tag: undefined,
      sort: 'newest',
    });
  });

  test('clamps limit to 50 and page to at least 1', () => {
    expect(parseThemeListQuery(new URLSearchParams('page=0&limit=999'))).toEqual({
      page: 1,
      limit: 50,
      search: undefined,
      tag: undefined,
      sort: 'newest',
    });
  });

  test('omits search and tag when over max length', () => {
    const longSearch = 'a'.repeat(101);
    const longTag = 'b'.repeat(31);
    expect(parseThemeListQuery(new URLSearchParams(`search=${longSearch}&tag=${longTag}`))).toEqual({
      page: 1,
      limit: 20,
      search: undefined,
      tag: undefined,
      sort: 'newest',
    });
  });

  test('parses sort enum', () => {
    expect(parseThemeListQuery(new URLSearchParams('sort=downloads')).sort).toBe('downloads');
    expect(parseThemeListQuery(new URLSearchParams('sort=upvotes')).sort).toBe('upvotes');
    expect(parseThemeListQuery(new URLSearchParams('sort=invalid')).sort).toBe('newest');
  });
});

describe('parseThemeId', () => {
  test('returns ok for valid ObjectId hex', () => {
    const hex = themeId.toHexString();
    expect(parseThemeId(hex)).toEqual({ ok: true, id: hex });
  });

  test('returns bad_request for invalid id', () => {
    expect(parseThemeId('not-valid')).toEqual({ ok: false, kind: 'bad_request' });
    expect(parseThemeId(undefined)).toEqual({ ok: false, kind: 'bad_request' });
  });
});

describe('listThemesResult', () => {
  beforeEach(() => {
    repoMock.list.mockClear();
    repoMock.list.mockResolvedValue({ themes: [makeThemeDoc()], total: 1 });
  });

  test('passes parsed query to repo and maps public themes', async () => {
    const result = await listThemesResult(new URLSearchParams('page=2&limit=10&sort=downloads'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(10);
    expect(result.data.total).toBe(1);
    expect(result.data.themes[0]?.id).toBe(themeId.toHexString());
    expect(repoMock.list).toHaveBeenCalledWith({
      page: 2,
      limit: 10,
      search: undefined,
      tag: undefined,
      sort: 'downloads',
    });
  });
});

describe('getSharedChecksumsResult', () => {
  beforeEach(() => {
    repoMock.listColorChecksumsByAuthor.mockClear();
    repoMock.listColorChecksumsByAuthor.mockResolvedValue([customChecksum]);
  });

  test('returns checksums from repo', async () => {
    const result = await getSharedChecksumsResult(myIdentityId);
    expect(result).toEqual({ ok: true, data: { checksums: [customChecksum] } });
    expect(repoMock.listColorChecksumsByAuthor).toHaveBeenCalledWith(myIdentityId);
  });
});

describe('getThemeResult', () => {
  beforeEach(() => {
    repoMock.findById.mockClear();
    repoMock.incrementDownloads.mockClear();
    repoMock.findById.mockResolvedValue(makeThemeDoc());
  });

  test('returns not_found when theme missing', async () => {
    repoMock.findById.mockResolvedValueOnce(null as unknown as CommunityThemeDocument);
    expect(await getThemeResult(themeId.toHexString())).toEqual({ ok: false, kind: 'not_found' });
    expect(repoMock.incrementDownloads).not.toHaveBeenCalled();
  });

  test('returns public theme and increments downloads', async () => {
    const hex = themeId.toHexString();
    const result = await getThemeResult(hex);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.id).toBe(hex);
    expect(repoMock.incrementDownloads).toHaveBeenCalledWith(hex);
  });
});

describe('uploadThemeResult', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockClear();
    mockComputeColorChecksum.mockClear();
    repoMock.existsByChecksumAndAuthor.mockClear();
    repoMock.create.mockClear();

    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Math.floor(Date.now() / 1000) + 3600,
    });
    mockComputeColorChecksum.mockResolvedValue(customChecksum);
    repoMock.existsByChecksumAndAuthor.mockResolvedValue(false);
    repoMock.create.mockResolvedValue(makeThemeDoc({ authorIdentityId: myIdentityId, authorUsername: 'me' }));
  });

  test('returns validation_failed for invalid body', async () => {
    const result = await uploadThemeResult(myIdentityId, 'me', { name: 'x' });
    expect(result).toEqual({ ok: false, kind: 'validation_failed' });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  test('returns rate_limited when checkRateLimit denies', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const result = await uploadThemeResult(myIdentityId, 'me', validUploadBody());
    expect(result).toEqual({ ok: false, kind: 'rate_limited' });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  test('returns conflict for builtin checksum', async () => {
    const builtin = [...BUILTIN_CHECKSUMS][0]!;
    mockComputeColorChecksum.mockResolvedValueOnce(builtin);
    expect(await uploadThemeResult(myIdentityId, 'me', validUploadBody())).toEqual({
      ok: false,
      kind: 'conflict',
    });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  test('returns conflict when author already shared checksum', async () => {
    repoMock.existsByChecksumAndAuthor.mockResolvedValueOnce(true);
    expect(await uploadThemeResult(myIdentityId, 'me', validUploadBody())).toEqual({
      ok: false,
      kind: 'conflict',
    });
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  test('creates theme on success', async () => {
    const result = await uploadThemeResult(myIdentityId, 'me', validUploadBody());
    expect(result.ok).toBe(true);
    expect(repoMock.create).toHaveBeenCalled();
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      'theme_upload',
      myIdentityId.toHexString(),
      expect.objectContaining({ limit: 5 }),
    );
  });
});

describe('deleteThemeResult', () => {
  beforeEach(() => {
    repoMock.deleteByIdAndAuthor.mockClear();
    repoMock.deleteByIdAndAuthor.mockResolvedValue(true);
  });

  test('returns bad_request for invalid id', async () => {
    expect(await deleteThemeResult(myIdentityId, 'bad')).toEqual({ ok: false, kind: 'bad_request' });
    expect(repoMock.deleteByIdAndAuthor).not.toHaveBeenCalled();
  });

  test('returns not_found when delete fails', async () => {
    repoMock.deleteByIdAndAuthor.mockResolvedValueOnce(false);
    expect(await deleteThemeResult(myIdentityId, themeId.toHexString())).toEqual({
      ok: false,
      kind: 'not_found',
    });
  });

  test('returns ok on success', async () => {
    const hex = themeId.toHexString();
    expect(await deleteThemeResult(myIdentityId, hex)).toEqual({ ok: true, data: undefined });
    expect(repoMock.deleteByIdAndAuthor).toHaveBeenCalledWith(hex, myIdentityId);
  });
});

describe('upvoteThemeResult', () => {
  beforeEach(() => {
    repoMock.findById.mockClear();
    repoMock.upvote.mockClear();
    repoMock.findById.mockResolvedValue(makeThemeDoc());
    repoMock.upvote.mockResolvedValue(true);
  });

  test('returns not_found when theme missing', async () => {
    repoMock.findById.mockResolvedValueOnce(null as unknown as CommunityThemeDocument);
    expect(await upvoteThemeResult(myIdentityId, themeId.toHexString())).toEqual({
      ok: false,
      kind: 'not_found',
    });
  });

  test('returns forbidden for self upvote', async () => {
    repoMock.findById.mockResolvedValueOnce(makeThemeDoc({ authorIdentityId: myIdentityId }));
    expect(await upvoteThemeResult(myIdentityId, themeId.toHexString())).toEqual({
      ok: false,
      kind: 'forbidden',
    });
    expect(repoMock.upvote).not.toHaveBeenCalled();
  });

  test('returns idempotent upvote counts when already upvoted', async () => {
    repoMock.upvote.mockResolvedValueOnce(false);
    const result = await upvoteThemeResult(myIdentityId, themeId.toHexString());
    expect(result).toEqual({ ok: true, data: { upvoted: false, upvotes: 5 } });
  });
});

describe('reportThemeResult', () => {
  beforeEach(() => {
    repoMock.findById.mockClear();
    repoMock.markReported.mockClear();
    repoMock.findById.mockResolvedValue(makeThemeDoc());
  });

  test('returns not_found when theme missing', async () => {
    repoMock.findById.mockResolvedValueOnce(null as unknown as CommunityThemeDocument);
    expect(await reportThemeResult(themeId.toHexString())).toEqual({ ok: false, kind: 'not_found' });
    expect(repoMock.markReported).not.toHaveBeenCalled();
  });

  test('marks theme reported on success', async () => {
    const hex = themeId.toHexString();
    expect(await reportThemeResult(hex)).toEqual({ ok: true, data: undefined });
    expect(repoMock.markReported).toHaveBeenCalledWith(hex);
  });
});

describe('themes routes smoke', () => {
  beforeEach(() => {
    mockCheckRateLimit.mockClear();
    mockComputeColorChecksum.mockClear();
    repoMock.list.mockClear();
    repoMock.findById.mockClear();
    repoMock.deleteByIdAndAuthor.mockClear();
    repoMock.upvote.mockClear();

    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      resetAt: Math.floor(Date.now() / 1000) + 3600,
    });
    mockComputeColorChecksum.mockResolvedValue(customChecksum);
    repoMock.list.mockResolvedValue({ themes: [makeThemeDoc()], total: 1 });
    repoMock.findById.mockResolvedValue(makeThemeDoc());
    repoMock.deleteByIdAndAuthor.mockResolvedValue(false);
    repoMock.upvote.mockResolvedValue(true);
  });

  test('GET /themes returns 200 without session', async () => {
    const response = await themeRoutes.handler()(makeRequest('/themes'));
    expect(response.status).toBe(200);
    expect(repoMock.list).toHaveBeenCalled();
  });

  test('GET /themes/me/shared-checksums returns 401 without session', async () => {
    const response = await themeRoutes.handler()(makeRequest('/themes/me/shared-checksums'));
    expect(response.status).toBe(401);
  });

  test('POST /themes returns 401 without session', async () => {
    const response = await themeRoutes.handler()(
      makeRequest('/themes', { method: 'POST', body: validUploadBody() }),
    );
    expect(response.status).toBe(401);
  });

  test('POST /themes returns 429 when rate limited', async () => {
    mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    const response = await themeRoutes.handler()(
      makeRequest('/themes', {
        method: 'POST',
        body: validUploadBody(),
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(429);
  });

  test('POST /themes/:id/upvote returns 403 for self upvote', async () => {
    repoMock.findById.mockResolvedValueOnce(makeThemeDoc({ authorIdentityId: myIdentityId }));
    const response = await themeRoutes.handler()(
      makeRequest(`/themes/${themeId.toHexString()}/upvote`, {
        method: 'POST',
        body: {},
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(403);
  });

  test('DELETE /themes/:id returns 404 when not author', async () => {
    const response = await themeRoutes.handler()(
      makeRequest(`/themes/${themeId.toHexString()}`, {
        method: 'DELETE',
        cookies: 'adieuu_session=session',
      }),
    );
    expect(response.status).toBe(404);
  });
});

afterAll(() => {
  mock.restore();
});
