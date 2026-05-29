import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { TICKET_CATEGORIES } from '@adieuu/shared';

type TicketServiceResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode?: string };

const accountUserId = new ObjectId().toHexString();
const identityId = new ObjectId().toHexString();

const mockCreateSupportTicket = mock(
  async (): Promise<TicketServiceResult<{ ticketId: string; objectId: string }>> => ({
    success: true,
    data: { ticketId: 'T-test1234', objectId: new ObjectId().toHexString() },
  }),
);

const mockAddSubmitterComment = mock(
  async (): Promise<TicketServiceResult<{ eventId: string }>> => ({
    success: true,
    data: { eventId: new ObjectId().toHexString() },
  }),
);

const mockResolveTicketBySubmitter = mock(
  async (): Promise<TicketServiceResult> => ({
    success: true,
    data: undefined,
  }),
);

const mockIsTicketOwner = mock(() => true);

const mockTicketList = mock(async () => ({
  tickets: [],
  total: 0,
  page: 1,
  limit: 25,
}));

const ticketObjectId = new ObjectId();
const mockTicketDoc = {
  _id: ticketObjectId,
  ticketId: 'T-test1234',
  submitterType: 'account' as const,
  submitterId: accountUserId,
  category: 'general',
  title: 'Help',
  body: 'Need assistance',
  attachmentMediaIds: [],
  status: 'open' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFindByTicketId = mock(async () => null as unknown);
const mockFindById = mock(async () => null as unknown);
const mockListByTicketObjectId = mock(async () => [] as unknown[]);
const mockGetSessionFromRequest = mock(async () => null as unknown);
const mockFindByIdentityId = mock(async () => null as unknown);

const mockMarkSupportTicketReadBySubmitter = mock(async () => ({ success: true, data: undefined }));
const mockCountUnreadSupportTicketsForSubmitter = mock(async () => 2);

mock.module('../../services/support-ticket.service', () => ({
  createSupportTicket: mockCreateSupportTicket,
  addSubmitterComment: mockAddSubmitterComment,
  resolveTicketBySubmitter: mockResolveTicketBySubmitter,
  getAttachmentUrls: mock(async () => []),
  isTicketOwner: mockIsTicketOwner,
  markSupportTicketReadBySubmitter: mockMarkSupportTicketReadBySubmitter,
  countUnreadSupportTicketsForSubmitter: mockCountUnreadSupportTicketsForSubmitter,
}));

mock.module('../../repositories/identity.repository', () => ({
  getIdentityRepository: () => ({
    findByIdentityId: mockFindByIdentityId,
  }),
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
  getUnreadSupportTicketCountResult,
  addOwnCommentResult,
  resolveOwnTicketResult,
} = await import('./controller');

import { supportRoutes } from './index';

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

const AUTH_COOKIE = 'adieuu_session=test-account-session';

describe('support/controller', () => {
  beforeEach(() => {
    mockCreateSupportTicket.mockClear();
    mockAddSubmitterComment.mockClear();
    mockResolveTicketBySubmitter.mockClear();
    mockGetSessionFromRequest.mockReset();
    mockFindByTicketId.mockReset();
    mockListByTicketObjectId.mockReset();
    mockIsTicketOwner.mockReset();
    mockIsTicketOwner.mockImplementation(() => true);
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

  test('resolveSubmitterContext returns identity context', async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce({
      type: 'identity',
      identityId,
      maxVideoDurationSeconds: 300,
      subscriptions: [],
      entitlements: [],
      isLifetime: false,
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    });

    const ctx = await resolveSubmitterContext(new Request('http://localhost'));
    expect(ctx).toEqual({ type: 'identity', id: identityId });
  });

  test('resolveSubmitterContext returns null without session', async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce(null);

    const ctx = await resolveSubmitterContext(new Request('http://localhost'));
    expect(ctx).toBeNull();
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

  test('createTicketResult returns rate_limited when throttled', async () => {
    mockCreateSupportTicket.mockResolvedValueOnce({
      success: false,
      error: 'Rate limit exceeded',
      errorCode: 'RATE_LIMITED',
    });

    const result = await createTicketResult(
      { type: 'account', id: accountUserId },
      {
        category: TICKET_CATEGORIES[0],
        title: 'Help',
        body: 'Need assistance',
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('rate_limited');
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

  test('getOwnTicketResult returns forbidden for non-owner', async () => {
    mockFindByTicketId.mockResolvedValueOnce(mockTicketDoc);
    mockIsTicketOwner.mockReturnValueOnce(false);

    const result = await getOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  test('getOwnTicketResult returns ticket detail for owner', async () => {
    mockFindByTicketId.mockResolvedValueOnce(mockTicketDoc);
    mockListByTicketObjectId.mockResolvedValueOnce([]);

    const result = await getOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.ticket.ticketId).toBe('T-test1234');
      expect(result.data.events).toEqual([]);
    }
    expect(mockMarkSupportTicketReadBySubmitter).toHaveBeenCalledWith(
      { type: 'account', id: accountUserId },
      'T-test1234',
      expect.any(Date),
    );
  });

  test('getUnreadSupportTicketCountResult returns unread count', async () => {
    const result = await getUnreadSupportTicketCountResult({
      type: 'identity',
      id: identityId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.unreadCount).toBe(2);
    expect(mockCountUnreadSupportTicketsForSubmitter).toHaveBeenCalledWith({
      type: 'identity',
      id: identityId,
    });
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

  test('addOwnCommentResult adds comment on success', async () => {
    const result = await addOwnCommentResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { body: 'Follow-up question' },
    );

    expect(result.ok).toBe(true);
    expect(mockAddSubmitterComment).toHaveBeenCalled();
    if (result.ok) expect(result.data.body).toBe('hello');
  });

  test('addOwnCommentResult returns forbidden for non-owner', async () => {
    mockAddSubmitterComment.mockResolvedValueOnce({
      success: false,
      error: 'Forbidden',
      errorCode: 'FORBIDDEN',
    });

    const result = await addOwnCommentResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { body: 'Not allowed' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  test('addOwnCommentResult returns rate_limited when throttled', async () => {
    mockAddSubmitterComment.mockResolvedValueOnce({
      success: false,
      error: 'Rate limit exceeded',
      errorCode: 'RATE_LIMITED',
    });

    const result = await addOwnCommentResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { body: 'Too many comments' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('rate_limited');
  });

  test('addOwnCommentResult rejects comment on closed ticket', async () => {
    mockAddSubmitterComment.mockResolvedValueOnce({
      success: false,
      error: 'Ticket is closed',
      errorCode: 'TICKET_CLOSED',
    });

    const result = await addOwnCommentResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { body: 'Reopening please' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe('bad_request');
      expect(result.message).toBe('Ticket is closed');
    }
  });

  test('resolveOwnTicketResult validates body', async () => {
    const result = await resolveOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { note: 'x'.repeat(501) },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('validation_failed');
  });

  test('resolveOwnTicketResult returns forbidden for non-owner', async () => {
    mockResolveTicketBySubmitter.mockResolvedValueOnce({
      success: false,
      error: 'Forbidden',
      errorCode: 'FORBIDDEN',
    });

    const result = await resolveOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { note: 'Fixed it myself' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('forbidden');
  });

  test('resolveOwnTicketResult resolves ticket for owner', async () => {
    const result = await resolveOwnTicketResult(
      { type: 'account', id: accountUserId },
      'T-test1234',
      { note: 'Fixed it myself' },
    );

    expect(result.ok).toBe(true);
    expect(mockResolveTicketBySubmitter).toHaveBeenCalledWith(
      { type: 'account', id: accountUserId },
      'T-test1234',
      'Fixed it myself',
    );
  });
});

describe('support route smoke tests', () => {
  beforeEach(() => {
    mockCountUnreadSupportTicketsForSubmitter.mockClear();
    mockCountUnreadSupportTicketsForSubmitter.mockResolvedValue(2);
    mockGetSessionFromRequest.mockReset();
  });

  test('GET /support/unread-count returns 401 without session', async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce(null);
    const response = await supportRoutes.handler()(makeRequest('/support/unread-count'));
    expect(response.status).toBe(401);
  });

  test('GET /support/unread-count returns unread count with account session', async () => {
    mockGetSessionFromRequest.mockResolvedValueOnce({
      type: 'account',
      userId: accountUserId,
      identifier: 'a@b.com',
      identifierType: 'email',
      lastActivityAt: Date.now(),
      expiresAt: Date.now() + 3600_000,
    });

    const response = await supportRoutes.handler()(
      makeRequest('/support/unread-count', { cookies: AUTH_COOKIE }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: { unreadCount: number } };
    expect(body.data.unreadCount).toBe(2);
    expect(mockCountUnreadSupportTicketsForSubmitter).toHaveBeenCalledWith({
      type: 'account',
      id: accountUserId,
    });
  });
});
