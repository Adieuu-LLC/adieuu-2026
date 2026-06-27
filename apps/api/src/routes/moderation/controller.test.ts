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
    isPlatformSupportAgent: false,
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
const mockReportClaimNcmecSubmission = mock<() => Promise<unknown>>(async () => null);
const mockReportFinalizeNcmecSubmission = mock<() => Promise<unknown>>(async () => null);
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

const mockBuildCyberTiplineReport = mock(async (_report: unknown, notes?: string) => ({
  report: { incidentType: 'test', _notes: notes },
}));
const mockSubmitFullReport = mock(async () => ({ ncmecReportId: 'ncmec-123' }));
const mockCreateCyberTiplineClient = mock(async () => ({
  getBaseUrl: () => 'https://report.cybertip.org',
  submitFullReport: mockSubmitFullReport,
}));
const mockAssertCyberTiplineEnvironment = mock(() => undefined);
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

const ticketObjectId = new ObjectId();
const supportStaffId = moderatorId;

const mockSupportTicketList = mock(async () => ({
  tickets: [] as unknown[],
  total: 0,
  page: 1,
  limit: 25,
}));
const mockSupportTicketFindById = mock(async (_id?: string) => null as unknown);
const mockSupportTicketFindByTicketId = mock(async () => null as unknown);
const mockSupportTicketEventList = mock(async () => [] as unknown[]);
const mockSupportTicketEventFindById = mock(async () => null as unknown);
const mockFindByAnyPlatformRole = mock(async () => [] as unknown[]);
const mockAssignTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockUnassignTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockAddStaffComment = mock(async () => ({
  success: true as const,
  data: { eventId: new ObjectId().toHexString() },
}));

mock.module('../../services/support-ticket.service', () => ({
  assignTicket: mockAssignTicket,
  unassignTicket: mockUnassignTicket,
  addStaffComment: mockAddStaffComment,
  escalateTicket: mock(async () => ({ success: true as const, data: undefined })),
  resolveTicket: mock(async () => ({ success: true as const, data: undefined })),
  closeTicket: mock(async () => ({ success: true as const, data: undefined })),
  reopenTicket: mock(async () => ({ success: true as const, data: undefined })),
  createSupportTicket: mock(async () => ({ success: true, data: { ticketId: 'T-x', objectId: new ObjectId().toHexString() } })),
  addSubmitterComment: mock(async () => ({ success: true, data: { eventId: new ObjectId().toHexString() } })),
  resolveTicketBySubmitter: mock(async () => ({ success: true, data: undefined })),
  isTicketOwner: mock(() => true),
  getAttachmentUrls: mock(async () => []),
}));

mock.module('../../repositories/support-ticket.repository', () => ({
  getSupportTicketRepository: () => ({
    list: mockSupportTicketList,
    findById: mockSupportTicketFindById,
    findByTicketId: mockSupportTicketFindByTicketId,
  }),
}));

mock.module('../../repositories/support-ticket-event.repository', () => ({
  getSupportTicketEventRepository: () => ({
    listByTicketObjectId: mockSupportTicketEventList,
    findById: mockSupportTicketEventFindById,
  }),
}));

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
    claimNcmecSubmission: mockReportClaimNcmecSubmission,
    finalizeNcmecSubmission: mockReportFinalizeNcmecSubmission,
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
    findByAnyPlatformRole: mockFindByAnyPlatformRole,
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

mock.module('../../utils/adieuuLogger', () => ({
  default: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}), debug: mock(() => {}) },
}));

mock.module('../../services/cybertipline-report-builder.service', () => ({
  buildCyberTiplineReport: mockBuildCyberTiplineReport,
}));

mock.module('../../services/cybertipline.service', () => ({
  createCyberTiplineClient: mockCreateCyberTiplineClient,
  assertCyberTiplineEnvironment: mockAssertCyberTiplineEnvironment,
}));

import {
  gateModeratorSession,
  listReportsResult,
  reopenReportResult,
  resolveReportResult,
  closeReportResult,
  fileLeReportResult,
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
    isPlatformSupportAgent: false,
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
    isPlatformSupportAgent: false,
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

  test('returns forbidden for support_agent-only session', async () => {
    mockGetPlatformCapabilities.mockImplementation(async () => ({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      isPlatformSupportAgent: true,
      roles: ['support_agent'],
      permissions: [
        PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
        PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
      ],
    }));

    const result = await gateModeratorSession(sessionUser);
    expect(result).toEqual({ ok: false, reason: 'forbidden' });
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

describe('fileLeReportResult', () => {
  function makeAdminCaps(): PlatformCapabilities {
    return makeModeratorCaps({
      isPlatformAdmin: true,
      permissions: [
        PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS,
        PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS,
        PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS,
        PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS,
        PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS,
      ],
    });
  }

  beforeEach(() => {
    mockReportFindById.mockReset();
    mockReportClaimNcmecSubmission.mockReset();
    mockReportFinalizeNcmecSubmission.mockReset();
    mockCreateEvent.mockReset();
    mockBuildCyberTiplineReport.mockReset();
    mockSubmitFullReport.mockReset();

    mockReportClaimNcmecSubmission.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
      ncmecStatus: 'claiming',
      targetIdentityId: 'target-id',
      detectionMetadata: {},
    }));
    mockReportFinalizeNcmecSubmission.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
      leReportFiled: true,
      ncmecStatus: 'submitted',
    }));
    mockBuildCyberTiplineReport.mockImplementation(async (_report, notes) => ({
      report: { incidentType: 'test', _notes: notes },
    }));
  });

  test('returns forbidden without manage-escalated-reports permission', async () => {
    const result = await fileLeReportResult(
      moderatorId,
      reportId.toHexString(),
      { category: 'csam' },
      makeModeratorCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'forbidden' });
    expect(mockBuildCyberTiplineReport).not.toHaveBeenCalled();
  });

  test('returns bad_request when NCMEC claim fails for already submitted report', async () => {
    mockReportClaimNcmecSubmission.mockImplementation(async () => null);
    mockReportFindById.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
      ncmecStatus: 'submitted',
    }));

    const result = await fileLeReportResult(
      moderatorId,
      reportId.toHexString(),
      { category: 'csam' },
      makeAdminCaps(),
    );

    expect(result).toEqual({
      ok: false,
      kind: 'bad_request',
      message: 'LE report has already been filed for this report',
    });
    expect(mockBuildCyberTiplineReport).not.toHaveBeenCalled();
  });

  test('stores generic ncmecError when CyberTipline submission fails', async () => {
    mockSubmitFullReport.mockImplementation(async () => {
      throw new Error('Authentication failed: secret upstream detail');
    });
    mockReportFinalizeNcmecSubmission.mockImplementation(async () => ({
      _id: reportId,
      status: 'escalated',
      ncmecStatus: 'failed',
      ncmecError: 'NCMEC service error',
    }));

    const result = await fileLeReportResult(
      moderatorId,
      reportId.toHexString(),
      { category: 'csam' },
      makeAdminCaps(),
    );

    expect(result.ok).toBe(true);
    expect(mockReportFinalizeNcmecSubmission).toHaveBeenCalledWith(
      reportId.toHexString(),
      { ok: false, ncmecError: 'NCMEC service error' },
    );
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          ncmecStatus: 'failed',
          ncmecError: 'NCMEC service error',
        }),
      }),
    );
  });

  test('returns validation_failed for malformed body', async () => {
    const result = await fileLeReportResult(
      moderatorId,
      reportId.toHexString(),
      { category: 'invalid' },
      makeAdminCaps(),
    );
    expect(result).toEqual({ ok: false, kind: 'validation_failed' });
    expect(mockBuildCyberTiplineReport).not.toHaveBeenCalled();
  });

  test('sanitizes notes before CyberTipline submission and event persistence', async () => {
    const dirtyNotes = 'Confirmed CSAM\u200B match';

    const result = await fileLeReportResult(
      moderatorId,
      reportId.toHexString(),
      { category: 'csam', notes: dirtyNotes },
      makeAdminCaps(),
    );

    expect(result.ok).toBe(true);
    expect(mockBuildCyberTiplineReport).toHaveBeenCalledWith(
      expect.objectContaining({ _id: reportId }),
      'Confirmed CSAM match',
    );
    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Confirmed CSAM match',
        metadata: expect.objectContaining({
          notes: 'Confirmed CSAM match',
        }),
      }),
    );
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
    isPlatformSupportAgent: false,
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

describe('moderation ticket route smoke tests', () => {
  const supportSession: IdentitySessionData = {
    ...sessionUser,
    identityId: supportStaffId,
  };

  const supportCaps = (): PlatformCapabilities => ({
    isPlatformAdmin: false,
    isPlatformModerator: true,
    isPlatformSupportAgent: false,
    roles: ['moderator'],
    permissions: [
      PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
      PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
    ],
  });

  const mockTicketDoc = {
    _id: ticketObjectId,
    ticketId: 'T-route123',
    submitterType: 'account',
    submitterId: new ObjectId().toHexString(),
    category: 'general',
    title: 'Route test',
    body: 'Body',
    attachmentMediaIds: [],
    status: 'open',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockRequireIdentitySession.mockReset();
    mockGetPlatformCapabilities.mockReset();
    mockSupportTicketList.mockReset();
    mockSupportTicketFindById.mockReset();
    mockAssignTicket.mockReset();
    mockUnassignTicket.mockReset();
    mockAssignTicket.mockImplementation(async () => ({ success: true as const, data: undefined }));
    mockUnassignTicket.mockImplementation(async () => ({ success: true as const, data: undefined }));

    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(null));
    mockGetPlatformCapabilities.mockImplementation(async () => supportCaps());
    mockSupportTicketList.mockImplementation(async () => ({
      tickets: [mockTicketDoc],
      total: 1,
      page: 1,
      limit: 25,
    }));
    mockSupportTicketFindById.mockImplementation(async (id?: string) =>
      id === ticketObjectId.toHexString() ? mockTicketDoc : null,
    );
    mockSupportTicketEventList.mockImplementation(async () => []);
    mockSupportTicketEventFindById.mockImplementation(async () => ({
      _id: new ObjectId(),
      ticketObjectId,
      ticketId: 'T-route123',
      eventType: 'comment_public',
      actorType: 'identity',
      actorId: supportStaffId,
      body: 'Staff note',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockFindByAnyPlatformRole.mockImplementation(async () => [
      {
        _id: new ObjectId(supportStaffId),
        displayName: 'Support Agent',
        username: 'support',
      },
    ]);
  });

  test('GET /moderation/tickets returns 401 without session', async () => {
    const response = await moderationRoutes.handler()(makeRequest('/moderation/tickets'));
    expect(response.status).toBe(401);
  });

  test('GET /moderation/tickets returns 403 without read-support-tickets permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(supportSession));
    mockGetPlatformCapabilities.mockImplementation(async () => ({
      isPlatformAdmin: false,
      isPlatformModerator: false,
      isPlatformSupportAgent: false,
      roles: [],
      permissions: [],
    }));

    const response = await moderationRoutes.handler()(makeRequest('/moderation/tickets'));
    expect(response.status).toBe(403);
  });

  test('GET /moderation/tickets returns 200 for support staff', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(supportSession));

    const response = await moderationRoutes.handler()(makeRequest('/moderation/tickets'));
    expect(response.status).toBe(200);
  });

  test('POST /moderation/tickets/:id/assign returns 403 without update permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(supportSession));
    mockGetPlatformCapabilities.mockImplementation(async () => ({
      ...supportCaps(),
      permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
    }));

    const response = await moderationRoutes.handler()(
      makeRequest(`/moderation/tickets/${ticketObjectId.toHexString()}/assign`, {
        method: 'POST',
        body: { identityId: supportStaffId },
      }),
    );
    expect(response.status).toBe(403);
    expect(mockAssignTicket).not.toHaveBeenCalled();
  });

  test('POST /moderation/tickets/:id/assign returns 200 with update permission', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(supportSession));

    const response = await moderationRoutes.handler()(
      makeRequest(`/moderation/tickets/${ticketObjectId.toHexString()}/assign`, {
        method: 'POST',
        body: { identityId: supportStaffId },
      }),
    );
    expect(response.status).toBe(200);
    expect(mockAssignTicket).toHaveBeenCalled();
  });

  test('GET /moderation/support-staff returns 200 with staff roster', async () => {
    mockRequireIdentitySession.mockImplementation(() => Promise.resolve(supportSession));

    const response = await moderationRoutes.handler()(makeRequest('/moderation/support-staff'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { staff: unknown[] } };
    expect(body.data.staff).toHaveLength(1);
  });
});

afterAll(() => {
  mock.restore();
});
