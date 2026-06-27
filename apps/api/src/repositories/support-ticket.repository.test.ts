import { describe, expect, mock, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { TICKET_CATEGORIES } from '@adieuu/shared';

const mockCreateTicket = mock(async () => ({
  _id: new ObjectId(),
  ticketId: 'T-repo1',
  submitterType: 'account',
  submitterId: new ObjectId().toHexString(),
  category: TICKET_CATEGORIES[0],
  title: 'Title',
  body: 'Body',
  attachmentMediaIds: [],
  status: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
}));

const mockToArray = mock(async () => [await mockCreateTicket()]);

const mockCollection = {
  find: mock(() => ({
    sort: mock(() => ({
      skip: mock(() => ({
        limit: mock(() => ({
          toArray: mockToArray,
        })),
      })),
    })),
  })),
  countDocuments: mock(async () => 1),
  findOneAndUpdate: mock(async () => null),
  aggregate: mock(() => ({
    toArray: mock(async () => [{ count: 2 }]),
  })),
};

mock.module('../../db', () => ({
  Collections: {
    SUPPORT_TICKETS: 'support_tickets',
    SUPPORT_TICKET_EVENTS: 'support_ticket_events',
  },
  getCollection: mock(() => mockCollection),
}));

const mockUpdateById = mock(async () => mockCreateTicket());

mock.module('../../repositories/base.repository', () => ({
  BaseRepository: class {
    protected collection: typeof mockCollection;

    constructor(_collectionName: string) {
      this.collection = mockCollection as never;
    }

    toObjectId(id: string | ObjectId) {
      return typeof id === 'string' ? new ObjectId(id) : id;
    }

    async create(doc: unknown) {
      return mockCreateTicket();
    }

    async findById() {
      return mockCreateTicket();
    }

    async updateById() {
      return mockUpdateById();
    }

    async findOne() {
      return mockCreateTicket();
    }

    async count() {
      return 1;
    }
  },
}));

const { getSupportTicketRepository } = await import('./support-ticket.repository');

describe('support-ticket.repository', () => {
  test('createTicket persists open status', async () => {
    const repo = getSupportTicketRepository();
    const ticket = await repo.createTicket({
      ticketId: 'T-repo1',
      submitterType: 'account',
      submitterId: new ObjectId().toHexString(),
      category: 'general',
      title: 'Title',
      body: 'Body',
      attachmentMediaIds: [],
    });
    expect(ticket.status).toBe('open');
  });
});
