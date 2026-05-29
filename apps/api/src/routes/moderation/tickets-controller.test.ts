import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import type { PlatformCapabilities } from '../../services/platform-capabilities.service';
import { ROUTE_TEST_IDENTITY_ID } from '../../test-fixtures/route-identity';

const staffId = ROUTE_TEST_IDENTITY_ID.toHexString();
const ticketObjectId = new ObjectId();

const supportCaps: PlatformCapabilities = {
  isPlatformAdmin: false,
  isPlatformModerator: true,
  isPlatformSupportAgent: false,
  roles: ['moderator'],
  permissions: [
    PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS,
    PLATFORM_PERMISSIONS.UPDATE_SUPPORT_TICKETS,
  ],
};

const adminCaps: PlatformCapabilities = {
  ...supportCaps,
  isPlatformAdmin: true,
  permissions: [
    ...supportCaps.permissions,
    PLATFORM_PERMISSIONS.MANAGE_ESCALATED_TICKETS,
  ],
};

const mockAssignTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockUnassignTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockAddStaffComment = mock(async () => ({
  success: true as const,
  data: { eventId: new ObjectId().toHexString() },
}));
const mockCloseTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockReopenTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockEscalateTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockResolveTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockFindByAnyPlatformRole = mock(async () => [] as unknown[]);

const mockTicketDoc = {
  _id: ticketObjectId,
  ticketId: 'T-abc123',
  submitterType: 'account',
  submitterId: new ObjectId().toHexString(),
  category: 'general',
  title: 'Test',
  body: 'Body',
  attachmentMediaIds: [],
  status: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
};

mock.module('../../services/support-ticket.service', () => ({
  assignTicket: mockAssignTicket,
  unassignTicket: mockUnassignTicket,
  addStaffComment: mockAddStaffComment,
  escalateTicket: mockEscalateTicket,
  resolveTicket: mockResolveTicket,
  closeTicket: mockCloseTicket,
  reopenTicket: mockReopenTicket,
  createSupportTicket: mock(async () => ({ success: true, data: { ticketId: 'T-x', objectId: new ObjectId().toHexString() } })),
  addSubmitterComment: mock(async () => ({ success: true, data: { eventId: new ObjectId().toHexString() } })),
  resolveTicketBySubmitter: mock(async () => ({ success: true, data: undefined })),
  isTicketOwner: mock(() => true),
  getAttachmentUrls: mock(async () => []),
  // support/controller (imported by tickets-controller) also binds these from the same module
  markSupportTicketReadBySubmitter: mock(async () => ({ success: true, data: undefined })),
  countUnreadSupportTicketsForSubmitter: mock(async () => 0),
}));

mock.module('../../repositories/support-ticket.repository', () => ({
  getSupportTicketRepository: () => ({
    list: mock(async () => ({ tickets: [mockTicketDoc], total: 1, page: 1, limit: 25 })),
    findById: mock(async (id: string) => (id === ticketObjectId.toHexString() ? mockTicketDoc : null)),
    findByTicketId: mock(async () => mockTicketDoc),
  }),
}));

mock.module('../../repositories/support-ticket-event.repository', () => ({
  getSupportTicketEventRepository: () => ({
    listByTicketObjectId: mock(async () => []),
    findById: mock(async () => ({
      _id: new ObjectId(),
      ticketObjectId,
      ticketId: 'T-abc123',
      eventType: 'comment_public',
      actorType: 'identity',
      actorId: staffId,
      body: 'Staff reply',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  }),
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mock(async () => null),
    findByAnyPlatformRole: mockFindByAnyPlatformRole,
  }),
}));

mock.module('../../repositories/platform-settings.repository', () => ({
  getPlatformSettingsRepository: () => ({
    findByKey: mock(async () => null),
  }),
}));

mock.module('../../services/platform-capabilities.service', () => ({
  getPlatformCapabilities: mock(async () => supportCaps),
}));

const {
  canReadSupportTickets,
  canUpdateSupportTickets,
  canManageEscalatedTickets,
  gateSupportStaffSession,
  listTicketsResult,
  getTicketDetailResult,
  listSupportStaffResult,
  assignTicketResult,
  unassignTicketResult,
  addTicketCommentResult,
  escalateTicketResult,
  resolveTicketResult,
  closeTicketResult,
  reopenTicketResult,
} = await import('./tickets-controller');

describe('moderation/tickets-controller', () => {
  beforeEach(() => {
    mockAssignTicket.mockClear();
    mockUnassignTicket.mockClear();
    mockAddStaffComment.mockClear();
    mockCloseTicket.mockClear();
    mockReopenTicket.mockClear();
    mockEscalateTicket.mockClear();
    mockResolveTicket.mockClear();
    mockFindByAnyPlatformRole.mockReset();
  });

  test('permission helpers', () => {
    expect(canReadSupportTickets(supportCaps)).toBe(true);
    expect(canUpdateSupportTickets(supportCaps)).toBe(true);
    expect(canManageEscalatedTickets(supportCaps)).toBe(false);
    expect(canManageEscalatedTickets(adminCaps)).toBe(true);
  });

  test('gateSupportStaffSession allows support staff with read permission', async () => {
    const gate = await gateSupportStaffSession({
      type: 'identity',
      identityId: staffId,
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    });

    expect(gate.ok).toBe(true);
  });

  test('gateSupportStaffSession forbids without read permission', async () => {
    mock.module('../../services/platform-capabilities.service', () => ({
      getPlatformCapabilities: mock(async () => ({
        ...supportCaps,
        permissions: [],
      })),
    }));

    const { gateSupportStaffSession: gateFresh } = await import('./tickets-controller');
    const gate = await gateFresh({
      type: 'identity',
      identityId: staffId,
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    });

    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe('forbidden');
  });

  test('listTicketsResult returns queue data', async () => {
    const result = await listTicketsResult(staffId, new URLSearchParams({ status: 'open,in_progress' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tickets).toHaveLength(1);
  });

  test('assignTicketResult requires update permission', async () => {
    const denied = await assignTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { identityId: staffId },
      {
        ...supportCaps,
        permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
      },
    );
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('assignTicketResult rejects invalid assignee id', async () => {
    const result = await assignTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { identityId: 'not-an-object-id' },
      supportCaps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation_failed');
  });

  test('assignTicketResult assigns ticket with update permission', async () => {
    const result = await assignTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { identityId: staffId },
      supportCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockAssignTicket).toHaveBeenCalledWith(staffId, ticketObjectId.toHexString(), staffId);
    if (result.ok) expect(result.data.ticketId).toBe('T-abc123');
  });

  test('unassignTicketResult requires update permission', async () => {
    const denied = await unassignTicketResult(staffId, ticketObjectId.toHexString(), {
      ...supportCaps,
      permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
    });

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('unassignTicketResult unassigns ticket with update permission', async () => {
    const result = await unassignTicketResult(staffId, ticketObjectId.toHexString(), supportCaps);

    expect(result.ok).toBe(true);
    expect(mockUnassignTicket).toHaveBeenCalledWith(staffId, ticketObjectId.toHexString());
  });

  test('addTicketCommentResult requires update permission', async () => {
    const denied = await addTicketCommentResult(
      staffId,
      ticketObjectId.toHexString(),
      { body: 'Internal note', visibility: 'internal' },
      {
        ...supportCaps,
        permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
      },
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('addTicketCommentResult adds staff comment', async () => {
    const result = await addTicketCommentResult(
      staffId,
      ticketObjectId.toHexString(),
      { body: 'We are looking into this', visibility: 'public' },
      supportCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockAddStaffComment).toHaveBeenCalledWith(
      staffId,
      ticketObjectId.toHexString(),
      'We are looking into this',
      'public',
    );
    if (result.ok) expect(result.data.body).toBe('Staff reply');
  });

  test('getTicketDetailResult returns bad_request for invalid id', async () => {
    const result = await getTicketDetailResult('not-an-object-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('bad_request');
  });

  test('getTicketDetailResult returns ticket detail', async () => {
    const result = await getTicketDetailResult(ticketObjectId.toHexString());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticket.ticketId).toBe('T-abc123');
      expect(result.data.events).toEqual([]);
    }
  });

  test('listSupportStaffResult returns sorted staff roster', async () => {
    mockFindByAnyPlatformRole.mockResolvedValueOnce([
      {
        _id: new ObjectId(),
        displayName: 'Zed',
        username: 'zed',
      },
      {
        _id: ROUTE_TEST_IDENTITY_ID,
        displayName: 'Alice',
        username: 'alice',
      },
    ]);

    const result = await listSupportStaffResult();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.staff).toHaveLength(2);
      expect(result.data.staff[0]?.displayName).toBe('Alice');
      expect(result.data.staff[1]?.displayName).toBe('Zed');
    }
  });

  test('closeTicketResult requires update permission', async () => {
    const denied = await closeTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { reason: 'Duplicate ticket' },
      {
        ...supportCaps,
        permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
      },
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('closeTicketResult closes ticket', async () => {
    const result = await closeTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { reason: 'Duplicate ticket' },
      supportCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockCloseTicket).toHaveBeenCalledWith(
      staffId,
      ticketObjectId.toHexString(),
      'Duplicate ticket',
    );
  });

  test('reopenTicketResult requires update permission', async () => {
    const denied = await reopenTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { reason: 'Issue returned' },
      {
        ...supportCaps,
        permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
      },
    );

    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('reopenTicketResult reopens ticket', async () => {
    const result = await reopenTicketResult(
      staffId,
      ticketObjectId.toHexString(),
      { reason: 'Issue returned' },
      supportCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockReopenTicket).toHaveBeenCalledWith(
      staffId,
      ticketObjectId.toHexString(),
      'Issue returned',
    );
  });

  test('escalateTicketResult requires update permission', async () => {
    const denied = await escalateTicketResult(staffId, ticketObjectId.toHexString(), {
      ...supportCaps,
      permissions: [PLATFORM_PERMISSIONS.READ_SUPPORT_TICKETS],
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.kind).toBe('forbidden');
  });

  test('resolveTicketResult blocks escalated ticket without admin permission', async () => {
    const findById = mock(async () => ({ ...mockTicketDoc, status: 'escalated' as const }));
    mock.module('../../repositories/support-ticket.repository', () => ({
      getSupportTicketRepository: () => ({ findById }),
    }));

    const { resolveTicketResult: resolveFresh } = await import('./tickets-controller');

    const result = await resolveFresh(
      staffId,
      ticketObjectId.toHexString(),
      { resolutionNote: 'Done' },
      supportCaps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  test('resolveTicketResult resolves escalated ticket with admin permission', async () => {
    const escalatedDoc = { ...mockTicketDoc, status: 'escalated' as const };
    const resolvedDoc = { ...mockTicketDoc, status: 'resolved' as const };
    const findById = mock(async (id: string) => {
      if (id !== ticketObjectId.toHexString()) return null;
      return mockResolveTicket.mock.calls.length > 0 ? resolvedDoc : escalatedDoc;
    });

    mock.module('../../repositories/support-ticket.repository', () => ({
      getSupportTicketRepository: () => ({ findById }),
    }));

    const { resolveTicketResult: resolveFresh } = await import('./tickets-controller');

    const result = await resolveFresh(
      staffId,
      ticketObjectId.toHexString(),
      { resolutionNote: 'Escalated issue fixed' },
      adminCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockResolveTicket).toHaveBeenCalledWith(
      staffId,
      ticketObjectId.toHexString(),
      'Escalated issue fixed',
    );
  });

  test('closeTicketResult closes escalated ticket with admin permission', async () => {
    const escalatedDoc = { ...mockTicketDoc, status: 'escalated' as const };
    const closedDoc = { ...mockTicketDoc, status: 'closed' as const };
    const findById = mock(async (id: string) => {
      if (id !== ticketObjectId.toHexString()) return null;
      return mockCloseTicket.mock.calls.length > 0 ? closedDoc : escalatedDoc;
    });

    mock.module('../../repositories/support-ticket.repository', () => ({
      getSupportTicketRepository: () => ({ findById }),
    }));

    const { closeTicketResult: closeFresh } = await import('./tickets-controller');

    const result = await closeFresh(
      staffId,
      ticketObjectId.toHexString(),
      { reason: 'Duplicate escalated ticket' },
      adminCaps,
    );

    expect(result.ok).toBe(true);
    expect(mockCloseTicket).toHaveBeenCalledWith(
      staffId,
      ticketObjectId.toHexString(),
      'Duplicate escalated ticket',
    );
  });
});

afterAll(() => {
  mock.restore();
});
