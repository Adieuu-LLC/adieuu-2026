import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { TICKET_CATEGORIES } from '@adieuu/shared';

const accountUserId = new ObjectId().toHexString();
const identityId = new ObjectId().toHexString();

const mockCreateSupportTicket = mock(async () => ({
  success: true as const,
  data: { ticketId: 'T-test1234', objectId: new ObjectId().toHexString() },
}));

const mockAddSubmitterComment = mock(async () => ({
  success: true as const,
  data: { eventId: new ObjectId().toHexString() },
}));

const mockTicketList = mock(async () => ({
  tickets: [],
  total: 0,
  page: 1,
  limit: 25,
}));

const mockFindByTicketId = mock(async () => null as unknown);
const mockFindById = mock(async () => null as unknown);
const mockListByTicketObjectId = mock(async () => [] as unknown[]);
const mockGetSessionFromRequest = mock(async () => null as unknown);

mock.module('../../services/support-ticket.service', () => ({
  createSupportTicket: mockCreateSupportTicket,
  addSubmitterComment: mockAddSubmitterComment,
  getAttachmentUrls: mock(async () => []),
  isTicketOwner: mock(() => true),
}));

mock.module('../../repositories/support-ticket.repository', () => ({
  getSupportTicketRepository: () => ({
    list: mockTicketList,
    findByTicketId: mockFindByTicketId,
    findById: mockFindById,
  }),
}));

mock.module('../../repositories/support-ticket-event.repository', () => ({
  getSupportTicketEventRepository: () => ({
    listByTicketObjectId: mockListByTicketObjectId,
    findById: mock(async () => ({
      _id: new ObjectId(),
      ticketId: 'T-test1234',
      eventType: 'comment_public',
      actorType: 'account',
      actorId: accountUserId,
      body: 'hello',
      createdAt: new Date(),
      updatedAt: new Date(),
      ticketObjectId: new ObjectId(),
    })),
  }),
}));

mock.module('../../services/session.service', () => ({
  getSessionFromRequest: mockGetSessionFromRequest,
}));

const {
  resolveSubmitterContext,
  createTicketResult,
  listOwnTicketsResult,
  getOwnTicketResult,
  addOwnCommentResult,
} = await import('./controller');

describe('support/controller', () => {
  beforeEach(() => {
    mockCreateSupportTicket.mockClear();
    mockGetSessionFromRequest.mockReset();
  });

  test('resolveSubmitterContext returns account context', async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce({
      type: 'account',
      userId: accountUserId,
      identifier: 'a@b.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    });

    const ctx = await resolveSubmitterContext(new Request('http://localhost'));
    expect(ctx).toEqual({ type: 'account', id: accountUserId });
  });

  test('createTicketResult validates body', async () => {
    const result = await createTicketResult(
      { type: 'account', id: accountUserId },
      { category: 'invalid' },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation_failed');
  });

  test('createTicketResult submits valid ticket', async () => {
    const result = await createTicketResult(
      { type: 'identity', id: identityId },
      {
        category: TICKET_CATEGORIES[0],
        title: 'Help',
        body: 'Need assistance',
        attachmentMediaIds: [],
      },
    );

    expect(result.ok).toBe(true);
    expect(mockCreateSupportTicket).toHaveBeenCalled();
  });

  test('listOwnTicketsResult returns paginated list', async () => {
    const result = await listOwnTicketsResult(
      { type: 'account', id: accountUserId },
      new URLSearchParams({ page: '1' }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.total).toBe(0);
  });

  test('getOwnTicketResult returns not_found when missing', async () => {
    const result = await getOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-missing',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('not_found');
  });

  test('addOwnCommentResult validates comment body', async () => {
    const result = await addOwnCommentResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      {},
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation_failed');
  });
});
