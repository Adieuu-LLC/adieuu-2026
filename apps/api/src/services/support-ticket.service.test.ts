import { describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { TICKET_CATEGORIES, MAX_TICKET_ATTACHMENTS } from '@adieuu/shared';

const mockCountRecent = mock(async () => 0);
const mockFindByMediaId = mock(async () => ({
  mediaId: 'media-1',
  purpose: 'ticket_attachment',
  status: 'ready',
  userId: new ObjectId(),
}));

mock.module('./rate-limit.service', () => ({
  checkRateLimit: mock(async () => ({ allowed: true, resetAt: 0 })),
}));

mock.module('../repositories/support-ticket.repository', () => ({
  getSupportTicketRepository: () => ({
    createTicket: mock(async (input: { ticketId: string }) => ({
      _id: new ObjectId(),
      ...input,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    countRecentBySubmitter: mockCountRecent,
  }),
}));

mock.module('../repositories/support-ticket-event.repository', () => ({
  getSupportTicketEventRepository: () => ({
    createEvent: mock(async () => ({
      _id: new ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  }),
}));

mock.module('../repositories/media-upload.repository', () => ({
  getMediaUploadRepository: () => ({
    findByMediaId: mockFindByMediaId,
  }),
}));

const { createSupportTicket, generateTicketId } = await import('./support-ticket.service');

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
});
