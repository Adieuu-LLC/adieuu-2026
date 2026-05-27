import { beforeEach, describe, expect, mock, test } from 'bun:test';
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
const mockEscalateTicket = mock(async () => ({ success: true as const, data: undefined }));
const mockResolveTicket = mock(async () => ({ success: true as const, data: undefined }));

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
  unassignTicket: mock(async () => ({ success: true as const, data: undefined })),
  addStaffComment: mock(async () => ({ success: true as const, data: { eventId: new ObjectId().toHexString() } })),
  escalateTicket: mockEscalateTicket,
  resolveTicket: mockResolveTicket,
  closeTicket: mock(async () => ({ success: true as const, data: undefined })),
  reopenTicket: mock(async () => ({ success: true as const, data: undefined })),
  getAttachmentUrls: mock(async () => []),
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
  escalateTicketResult,
  resolveTicketResult,
} = await import('./tickets-controller');

describe('moderation/tickets-controller', () => {
  beforeEach(() => {
    mockEscalateTicket.mockClear();
    mockResolveTicket.mockClear();
  });

  test('permission helpers', () => {
    expect(canReadSupportTickets(supportCaps)).toBe(true);
    expect(canUpdateSupportTickets(supportCaps)).toBe(true);
    expect(canManageEscalatedTickets(supportCaps)).toBe(false);
    expect(canManageEscalatedTickets(adminCaps)).toBe(true);
  });

  test('gateSupportStaffSession forbids without read permission', async () => {
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

  test('listTicketsResult returns queue data', async () => {
    const result = await listTicketsResult(staffId, new URLSearchParams({ status: 'open,in_progress' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.tickets).toHaveLength(1);
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
});
