import { describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { TICKET_CATEGORIES, MAX_TICKET_ATTACHMENTS } from '@adieuu/shared';

const mockCountRecent = mock(async () => 0);
const mockCountUnreadForSubmitter = mock(async () => 0);
const mockMarkSubmitterRead = mock(async () => undefined);
const mockAssign = mock(async () => ({
  _id: new ObjectId(),
  ticketId: 'T-test1234',
  submitterType: 'account' as const,
  submitterId: new ObjectId().toHexString(),
  status: 'open' as const,
}));
const mockFindById = mock<() => Promise<Record<string, unknown>>>(async () => ({
  _id: new ObjectId(),
  ticketId: 'T-test1234',
  submitterType: 'account',
  submitterId: new ObjectId().toHexString(),
  status: 'open',
  title: 'Help',
}));
const mockFindByTicketId = mock<() => Promise<Record<string, unknown>>>(async () => ({
  _id: new ObjectId(),
  ticketId: 'T-test1234',
  submitterType: 'account',
  submitterId: new ObjectId().toHexString(),
  status: 'open',
  title: 'Help',
}));
const mockCheckRateLimit = mock(async () => ({ allowed: true, resetAt: 0 }));
const mockCreateNotification = mock(async () => ({ success: true }));
const mockCreateEvent = mock(async () => ({
  _id: new ObjectId(),
  createdAt: new Date(),
  updatedAt: new Date(),
}));
const mockFindByMediaId = mock(async () => ({
  mediaId: 'media-1',
  purpose: 'ticket_attachment',
  status: 'ready',
  userId: new ObjectId(),
}));

mock.module('./rate-limit.service', () => ({
  checkRateLimit: mockCheckRateLimit,
}));

mock.module('../repositories/support-ticket.repository', () => ({
  getSupportTicketRepository: () => ({
    createTicket: mock(async (input: { ticketId: string; title?: string }) => ({
      _id: new ObjectId(),
      ...input,
      title: input.title ?? 'Help',
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findByTicketId: mockFindByTicketId,
    findById: mockFindById,
    assign: mockAssign,
    setStatus: mock(async () => null),
    countRecentBySubmitter: mockCountRecent,
    countUnreadForSubmitter: mockCountUnreadForSubmitter,
    markSubmitterRead: mockMarkSubmitterRead,
  }),
}));

mock.module('../repositories/support-ticket-event.repository', () => ({
  getSupportTicketEventRepository: () => ({
    createEvent: mockCreateEvent,
  }),
}));

mock.module('./notification.service', () => ({
  createNotification: mockCreateNotification,
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    findByMediaId: mockFindByMediaId,
  }),
}));

const {
  createSupportTicket,
  addSubmitterComment,
  addStaffComment,
  assignTicket,
  countUnreadSupportTicketsForSubmitter,
  markSupportTicketReadBySubmitter,
  generateTicketId,
} = await import('./support-ticket.service');

describe('support-ticket.service', () => {
  test('generateTicketId produces T- prefix', () => {
    const id = generateTicketId();
    expect(id.startsWith('T-')).toBe(true);
  });

  test('createSupportTicket rejects invalid category', async () => {
    const result = await createSupportTicket(
      { type: 'account', id: new ObjectId().toHexString() },
      {
        category: 'not_a_category',
        title: 'Help',
        body: 'Details',
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('INVALID_CATEGORY');
  });

  test('createSupportTicket rejects too many attachments', async () => {
    const ids = Array.from({ length: MAX_TICKET_ATTACHMENTS + 1 }, (_, i) => `media-${i}`);
    const result = await createSupportTicket(
      { type: 'account', id: new ObjectId().toHexString() },
      {
        category: TICKET_CATEGORIES[0],
        title: 'Help',
        body: 'Details',
        attachmentMediaIds: ids,
      },
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('TOO_MANY_ATTACHMENTS');
  });

  test('createSupportTicket succeeds for valid input', async () => {
    const submitterId = new ObjectId().toHexString();
    mockFindByMediaId.mockImplementation(async () => ({
      mediaId: 'media-1',
      purpose: 'ticket_attachment',
      status: 'ready',
      userId: new ObjectId(submitterId),
    }));

    const result = await createSupportTicket(
      { type: 'account', id: submitterId },
      {
        category: TICKET_CATEGORIES[0],
        title: 'Help',
        body: 'Details',
        attachmentMediaIds: ['media-1'],
      },
    );

    expect(result.success).toBe(true);
  });

  test('assignTicket notifies assignee when actor differs', async () => {
    const ticketObjectId = new ObjectId();
    const assigneeId = new ObjectId().toHexString();
    mockFindById.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-assign1',
      title: 'Assign me',
      assignedTo: undefined,
    });

    const result = await assignTicket('actor-1', ticketObjectId.toHexString(), assigneeId);
    expect(result.success).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      assigneeId,
      'support_ticket_assigned',
      expect.objectContaining({
        ticketId: 'T-assign1',
        ticketObjectId: ticketObjectId.toHexString(),
        title: 'Assign me',
      }),
    );
  });

  test('assignTicket does not notify when assignee is the actor', async () => {
    mockCreateNotification.mockClear();
    const ticketObjectId = new ObjectId();
    const actorId = new ObjectId().toHexString();
    mockFindById.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-self',
      title: 'Self assign',
      assignedTo: undefined,
    });

    const result = await assignTicket(actorId, ticketObjectId.toHexString(), actorId);
    expect(result.success).toBe(true);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  test('assignTicket records system actor for auto-assignment', async () => {
    mockCreateEvent.mockClear();
    const ticketObjectId = new ObjectId();
    const assigneeId = new ObjectId().toHexString();
    mockFindById.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-auto',
      title: 'Auto',
      assignedTo: undefined,
    });

    await assignTicket('system', ticketObjectId.toHexString(), assigneeId, {
      actorType: 'system',
      notifyAssignee: true,
    });

    expect(mockCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        actorId: 'system',
        eventType: 'assignment_change',
      }),
    );
  });

  test('addSubmitterComment notifies assigned staff with moderation payload', async () => {
    mockCreateNotification.mockClear();
    const ticketObjectId = new ObjectId();
    const submitterId = new ObjectId().toHexString();
    const assigneeId = new ObjectId().toHexString();
    mockFindByTicketId.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-user-reply',
      submitterType: 'account',
      submitterId,
      assignedTo: assigneeId,
      status: 'open',
      title: 'Need help',
    });

    const result = await addSubmitterComment(
      { type: 'account', id: submitterId },
      'T-user-reply',
      'Any update?',
    );

    expect(result.success).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      assigneeId,
      'support_ticket_user_reply',
      expect.objectContaining({
        ticketId: 'T-user-reply',
        ticketObjectId: ticketObjectId.toHexString(),
      }),
    );
  });

  test('addStaffComment notifies identity submitter on public reply', async () => {
    mockCreateNotification.mockClear();
    const ticketObjectId = new ObjectId();
    const submitterId = new ObjectId().toHexString();
    mockFindById.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-staff-reply',
      submitterType: 'identity',
      submitterId,
      status: 'open',
      title: 'Need help',
    });

    const result = await addStaffComment(
      new ObjectId().toHexString(),
      ticketObjectId.toHexString(),
      'We can help',
      'public',
    );

    expect(result.success).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      submitterId,
      'support_ticket_reply',
      expect.objectContaining({
        ticketId: 'T-staff-reply',
        ticketObjectId: ticketObjectId.toHexString(),
      }),
    );
  });

  test('countUnreadSupportTicketsForSubmitter delegates to repository', async () => {
    mockCountUnreadForSubmitter.mockResolvedValueOnce(3);
    const submitter = { type: 'identity' as const, id: new ObjectId().toHexString() };

    const count = await countUnreadSupportTicketsForSubmitter(submitter);
    expect(count).toBe(3);
    expect(mockCountUnreadForSubmitter).toHaveBeenCalledWith('identity', submitter.id);
  });

  test('markSupportTicketReadBySubmitter marks ticket read for owner', async () => {
    const submitterId = new ObjectId().toHexString();
    const ticketObjectId = new ObjectId();
    mockFindByTicketId.mockResolvedValueOnce({
      _id: ticketObjectId,
      ticketId: 'T-read',
      submitterType: 'account',
      submitterId,
      status: 'open',
    });

    const result = await markSupportTicketReadBySubmitter(
      { type: 'account', id: submitterId },
      'T-read',
    );

    expect(result.success).toBe(true);
    expect(mockMarkSubmitterRead).toHaveBeenCalledWith(ticketObjectId.toHexString());
  });

  test('addSubmitterComment rejects when rate limited', async () => {
    const submitterId = new ObjectId().toHexString();
    mockFindByTicketId.mockImplementation(async () => ({
      _id: new ObjectId(),
      ticketId: 'T-test1234',
      submitterType: 'account' as const,
      submitterId,
      status: 'open' as const,
    }));
    mockCheckRateLimit.mockImplementationOnce(async () => ({ allowed: false, resetAt: 0 }));

    const result = await addSubmitterComment(
      { type: 'account', id: submitterId },
      'T-test1234',
      'Another update',
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errorCode).toBe('RATE_LIMITED');
  });
});
