import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';
import type { IdentitySessionData } from '../../services/session.service';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const moderatorId = ROUTE_TEST_IDENTITY_ID.toHexString();
const reportId = new ObjectId();

const mockGetPlatformCapabilities = mock(
  async (): Promise<PlatformCapabilities> => ({
    isPlatformAdmin: false,
    isPlatformModerator: true,
    roles: ['moderator'],
    permissions: [
      PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS,
      PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS,
      PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS,
      PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS,
    ],
  }),
);

const mockRequireIdentitySession = mock(() => Promise.resolve(null as IdentitySessionData | null));

const mockReportList = mock<() => Promise<{
  reports: unknown[];
  total: number;
  page: number;
  limit: number;
}>>(async () => ({
  reports: [],
  total: 0,
  page: 1,
  limit: 25,
}));

const mockReportFindById = mock<() => Promise<unknown>>(async () => null);
const mockReportReopen = mock<() => Promise<unknown>>(async () => null);
const mockReportResolve = mock<() => Promise<unknown>>(async () => null);
const mockReportClose = mock<() => Promise<unknown>>(async () => null);

const mockCreateEvent = mock<() => Promise<{
  _id: ObjectId;
  reportId: ObjectId;
  eventType: string;
  actorIdentityId: string;
  createdAt: Date;
}>>(async () => ({
  _id: new ObjectId(),
  reportId,
  eventType: 'status_change',
  actorIdentityId: moderatorId,
  createdAt: new Date('2024-06-01T12:00:00.000Z'),
}));

const mockListByReportId = mock<() => Promise<unknown[]>>(async () => []);

const mockExecuteEnforcement = mock(async () => undefined);
const mockPurgeConvScanEvidence = mock(async () => undefined);

const mockGetModerationScanEvidence = mock<
  () => Promise<
    | { ok: true; data: { expiresInSeconds: number; items: unknown[] } }
    | { ok: false; errorCode: 'NOT_FOUND' | 'NO_SCAN_HASH' | 'UPLOAD_DISABLED'; message: string }
  >
>(async () => ({
  ok: true as const,
  data: { expiresInSeconds: 900, items: [] },
}));

const mockSettingsFindByKey = mock(async () => null as unknown);
const mockIdentityFindByIdentityId = mock(async () => null as unknown);

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mockGetPlatformCapabilities,
}));

mock.module('../../services/session.service', () => ({
  requireIdentitySession: mockRequireIdentitySession,
  getSession: mock(() => Promise.resolve(null)),
  destroySession: mock(() => Promise.resolve()),
  destroyAllSessions: mock(() => Promise.resolve(0)),
  getSessionIdFromRequest: mock(() => null),
  buildLogoutCookie: mock(() => ''),
}));

mock.module('../../repositories/report.repository', () => ({
  getReportRepository: () => ({
    list: mockReportList,
    findById: mockReportFindById,
    reopen: mockReportReopen,
    resolve: mockReportResolve,
    close: mockReportClose,
    assign: mock(async () => null),
    unassign: mock(async () => null),
    escalate: mock(async () => null),
    updateCategory: mock(async () => null),
  }),
}));

mock.module('../../repositories/report-event.repository', () => ({
  getReportEventRepository: () => ({
    createEvent: mockCreateEvent,
    listByReportId: mockListByReportId,
  }),
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockIdentityFindByIdentityId,
    findById: mockIdentityFindByIdentityId,
  }),
}));

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mockSettingsFindByKey,
  }),
}));

mock.module('../../services/moderation-enforcement.service', () => ({
  executeEnforcement: mockExecuteEnforcement,
}));

mock.module('../../services/moderation-scan-evidence.service', () => ({
  getModerationScanEvidenceForReport: mockGetModerationScanEvidence,
}));

mock.module('../../services/conv-scan-moderation-cleanup.service', () => ({
  purgeConvScanEvidenceForTerminalReport: mockPurgeConvScanEvidence,
}));

import {
  gateModeratorSession,
  listReportsResult,
  reopenReportResult,
  resolveReportResult,
  closeReportResult,
  getReportScanEvidenceResult,
  getReportDetailResult,
  toPublicReport,
  toPublicEvent,
} from './controller';

import { moderationRoutes } from './index';

const sessionUser: IdentitySessionData = {
  type: 'identity',
  identityId: moderatorId,
  lastActivityAt: Date.now(),
  expiresAt: Date.now() + 86_400_000,
  maxVideoDurationSeconds: 300,
  subscriptions: [],
  entitlements: [],
  isLifetime: false,
};

function makeModeratorCaps(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    isPlatformAdmin: false,
    isPlatformModerator: true,
    roles: ['moderator'],
    permissions: [
      PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS,
      PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS,
      PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS,
      PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS,
    ],
    ...overrides,
  };
}

function makeRequest(
  path: string,
  options: { method?: string; body?: object } = {},
) {
  return new Request(`http://localhost${path}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

describe('gateModeratorSession', () => {
  beforeEach(() => {
    mockGetPlatformCapabilities.mockReset();
    mockGetPlatformCapabilities.mockImplementation(async () => makeModeratorCaps());
  });

  test('returns unauthorized when session is null', async () => {
    const result = await gateModeratorSession(null);
    expect(result).toEqual({ ok: false, reason: 'unauthorized' });
    expect(mockGetPlatformCapabilities).not.toHaveBeenCalled();
  });

  test('returns forbidden when session lacks read permissions', async () => {
    mockGetPlatformCapabilities.mockImplementation(async () => ({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      roles: [],
      permissions: [],
    }));

    const result = await gateModeratorSession(sessionUser);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
  });

  test('returns ok with caps when session has read permissions', async () => {
    const caps = makeModeratorCaps();
    mockGetPlatformCapabilities.mockImplementation(async () => caps);

    const result = await gateModeratorSession(sessionUser);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session).toEqual(sessionUser);
      expect(result.caps).toEqual(caps);
    }
  });
});

describe('toPublicReport / toPublicEvent', () => {
  test('serializes ObjectId and Date fields', () => {
    const createdAt = new Date('2024-06-01T12:00:00.000Z');
    const report = toPublicReport({
      _id: reportId,
      reportType: 'content',
      status: 'open',
      createdAt,
      updatedAt: createdAt,
    });
    expect(report.id).toBe(reportId.toHexString());
    expect(report.createdAt).toBe('2024-06-01T12:00:00.000Z');

    const event = toPublicEvent({
      _id: new ObjectId(),
      reportId,
      eventType: 'comment_internal',
      createdAt,
    });
    expect(event.reportId).toBe(reportId.toHexString());
    expect(event.createdAt).toBe('2024-06-01T12:00:00.000Z');
  });
});

describe('listReportsResult', () => {
  beforeEach(() => {
    mockReportList.mockReset();
    mockReportList.mockImplementation(async () => ({
      reports: [{ _id: reportId, status: 'open', reportType: 'content' }],
      total: 1,
      page: 2,
      limit: 10,
    }));
  });

  test('parses filters and pagination from search params', async () => {
    const params = new URLSearchParams({
      page: '2',
      limit: '10',
      status: 'open,escalated',
      assigned: 'me',
      type: 'content',
      category: 'spam',
      targetIdentityId: 'abc',
      reporterIdentityId: 'def',
    });

    const result = await listReportsResult(moderatorId, params);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.reports).toHaveLength(1);
      expect(result.data.total).toBe(1);
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(10);
    }

    expect(mockReportList).toHaveBeenCalledWith({
      filter: {
        status: ['open', 'escalated'],
        assignedTo: moderatorId,
        reportType: 'content',
        category: 'spam',
        targetIdentityId: 'abc',
        reporterIdentityId: 'def',
      },
      page: 2,
      limit: 10,
    });
  });

  test('clamps pagination and sets unassigned filter', async () => {
    const params = new URLSearchParams({ page: '0', limit: '500', assigned: 'unassigned' });
    await listReportsResult(moderatorId, params);

    expect(mockReportList).toHaveBeenCalledWith({
      filter: { assignedTo: null },
      page: 1,
      limit: 100,
    });
  });
});

describe('reopenReportResult', () => {
  beforeEach(() => {
    mockReportFindById.mockReset();
    mockReportReopen.mockReset();
    mockCreateEvent.mockReset();
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'resolved',
    }));
    mockReportReopen.mockImplementation(async () => ({
      _id: reportId,
      status: 'open',
    }));
    mockCreateEvent.mockImplementation(async () => ({
      _id: new ObjectId(),
      reportId,
      eventType: 'status_change',
      actorIdentityId: moderatorId,
      createdAt: new Date(),
    }));
  });

  test('returns validation_failed for invalid body', async () => {
    const result = await reopenReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: '' },
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockReportReopen).not.toHaveBeenCalled();
  });

  test('returns not_found when report missing', async () => {
    mockReportFindById.mockImplementation(async () => null);
    const result = await reopenReportResult(
      moderatorId,
      reportId.toHexString(),
      {},
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('returns bad_request when status is not resolved or closed', async () => {
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'open',
    }));
    const result = await reopenReportResult(
      moderatorId,
      reportId.toHexString(),
      {},
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'bad_request' });
  });

  test('returns forbidden without update permissions', async () => {
    const result = await reopenReportResult(
      moderatorId,
      reportId.toHexString(),
      {},
      makeModeratorCaps({ permissions: [PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS] }),
    );
    expect(result).toEqual({ ok: false, kind: 'forbidden' });
  });

  test('reopens report and creates audit event on success', async () => {
    const result = await reopenReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: 'needs review' },
      makeModeratorCaps(),
    );
    expect(result.ok).toBe(true);
    expect(mockReportReopen).toHaveBeenCalledWith(reportId.toHexString(), moderatorId);
    expect(mockCreateEvent).toHaveBeenCalled();
  });
});

describe('getReportScanEvidenceResult', () => {
  beforeEach(() => {
    mockGetModerationScanEvidence.mockReset();
    mockGetModerationScanEvidence.mockImplementation(async () => ({
      ok: true as const,
      data: { expiresInSeconds: 900, items: [] },
    }));
  });

  test('returns bad_request for invalid report id', async () => {
    const result = await getReportScanEvidenceResult('not-valid');
    expect(result).toEqual({ ok: false, kind: 'bad_request' });
  });

  test('maps NOT_FOUND to not_found', async () => {
    mockGetModerationScanEvidence.mockImplementation(async () => ({
      ok: false as const,
      errorCode: 'NOT_FOUND' as const,
      message: 'Report not found',
    }));
    const result = await getReportScanEvidenceResult(reportId.toHexString());
    expect(result).toEqual({ ok: false, kind: 'not_found', message: 'Report not found' });
  });

  test('maps NO_SCAN_HASH to bad_request', async () => {
    mockGetModerationScanEvidence.mockImplementation(async () => ({
      ok: false as const,
      errorCode: 'NO_SCAN_HASH' as const,
      message: 'No scan hash',
    }));
    const result = await getReportScanEvidenceResult(reportId.toHexString());
    expect(result).toEqual({ ok: false, kind: 'bad_request', message: 'No scan hash' });
  });
});

describe('resolveReportResult / closeReportResult', () => {
  beforeEach(() => {
    mockReportFindById.mockReset();
    mockReportResolve.mockReset();
    mockReportClose.mockReset();
    mockExecuteEnforcement.mockReset();
    mockPurgeConvScanEvidence.mockReset();
    mockCreateEvent.mockReset();

    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'open',
      targetIdentityId: 'target-id',
      targetRef: 'msg:123',
    }));
    mockReportResolve.mockImplementation(async () => ({
      _id: reportId,
      status: 'resolved',
    }));
    mockReportClose.mockImplementation(async () => ({
      _id: reportId,
      status: 'closed',
    }));
  });

  test('resolveReportResult returns forbidden for escalated report without admin perm', async () => {
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
    }));

    const result = await resolveReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: 'spam' },
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'forbidden' });
    expect(mockExecuteEnforcement).not.toHaveBeenCalled();
  });

  test('resolveReportResult calls enforcement and cleanup on success', async () => {
    const result = await resolveReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: 'spam' },
      makeModeratorCaps(),
    );
    expect(result.ok).toBe(true);
    expect(mockExecuteEnforcement).toHaveBeenCalled();
    expect(mockReportResolve).toHaveBeenCalled();
    expect(mockPurgeConvScanEvidence).toHaveBeenCalled();
  });

  test('closeReportResult returns forbidden for escalated report without admin perm', async () => {
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
    }));

    const result = await closeReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: 'invalid' },
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'forbidden' });
    expect(mockReportClose).not.toHaveBeenCalled();
  });

  test('closeReportResult closes report and purges scan evidence', async () => {
    const result = await closeReportResult(
      moderatorId,
      reportId.toHexString(),
      { reason: 'invalid' },
      makeModeratorCaps(),
    );
    expect(result.ok).toBe(true);
    expect(mockReportClose).toHaveBeenCalled();
    expect(mockPurgeConvScanEvidence).toHaveBeenCalled();
  });
});

describe('getReportDetailResult', () => {
  beforeEach(() => {
    mockReportFindById.mockReset();
    mockListByReportId.mockReset();
    mockIdentityFindByIdentityId.mockReset();
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'open',
      targetIdentityId: 'target-id',
    }));
    mockListByReportId.mockImplementation(async () => []);
  });

  test('returns not_found when report missing', async () => {
    mockReportFindById.mockImplementation(async () => null);
    const result = await getReportDetailResult(reportId.toHexString());
    expect(result).toEqual({ ok: false, kind: 'not_found' });
  });

  test('returns report detail with events and profiles', async () => {
    mockIdentityFindByIdentityId.mockImplementation(async () => ({
      displayName: 'Target User',
      username: 'target',
    }));

    const result = await getReportDetailResult(reportId.toHexString());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.report.id).toBe(reportId.toHexString());
      expect(result.data.identityProfiles['target-id']).toEqual({
        displayName: 'Target User',
        username: 'target',
        avatarUrl: undefined,
      });
    }
  });
});

describe('moderation route smoke tests', () => {
  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockGetPlatformCapabilities.mockReset();
    mockReportList.mockReset();

    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockGetPlatformCapabilities.mockImplementation(async () => makeModeratorCaps());
    mockReportList.mockImplementation(async () => ({
      reports: [],
      total: 0,
      page: 1,
      limit: 25,
    }));
  });

  test('GET /moderation/reports returns 401 without session', async () => {
    const response = await moderationRoutes.handler()(makeRequest('/moderation/reports'));
    expect(response.status).toBe(401);
  });

  test('GET /moderation/reports returns 403 without read permissions', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockGetPlatformCapabilities.mockImplementation(async () => ({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      roles: [],
      permissions: [],
    }));

    const response = await moderationRoutes.handler()(makeRequest('/moderation/reports'));
    expect(response.status).toBe(403);
  });

  test('GET /moderation/reports returns 200 with moderator session', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));

    const response = await moderationRoutes.handler()(makeRequest('/moderation/reports'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { reports: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.reports)).toBe(true);
  });

  test('POST /moderation/reports/:id/resolve returns 403 for escalated report without admin perm', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
    }));

    const response = await moderationRoutes.handler()(
      makeRequest(`/moderation/reports/${reportId.toHexString()}/resolve`, {
        method: 'POST',
        body: { reason: 'spam' },
      }),
    );
    expect(response.status).toBe(403);
  });

  test('GET /moderation/reports/:id returns 200 with report detail', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(sessionUser));
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'open',
    }));
    mockListByReportId.mockImplementation(async () => []);

    const response = await moderationRoutes.handler()(
      makeRequest(`/moderation/reports/${reportId.toHexString()}`),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; data: { report: { id: string } } };
    expect(body.data.report.id).toBe(reportId.toHexString());
  });
});

afterAll(() => {
  mock.restore();
});
