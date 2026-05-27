/**
 * Support ticket event repository — data access for support_ticket_events.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  SupportTicketEventDocument,
  CreateSupportTicketEventInput,
} from '../models/support-ticket-event';

export class SupportTicketEventRepository extends BaseRepository<SupportTicketEventDocument> {
  constructor() {
    super(Collections.SUPPORT_TICKET_EVENTS);
  }

  async createEvent(input: CreateSupportTicketEventInput): Promise<SupportTicketEventDocument> {
    const doc: Omit<SupportTicketEventDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      ticketObjectId: input.ticketObjectId,
      ticketId: input.ticketId,
      eventType: input.eventType,
      actorType: input.actorType,
      actorId: input.actorId,
      body: input.body,
      metadata: input.metadata,
    };

    return await super.create(doc);
  }

  async listByTicketObjectId(
    ticketObjectId: string | ObjectId,
    options?: { includeInternal?: boolean },
  ): Promise<SupportTicketEventDocument[]> {
    const oid = typeof ticketObjectId === 'string' ? new ObjectId(ticketObjectId) : ticketObjectId;
    const filter: Filter<SupportTicketEventDocument> = { ticketObjectId: oid };

    if (!options?.includeInternal) {
      filter.eventType = { $ne: 'comment_internal' } as unknown as SupportTicketEventDocument['eventType'];
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: 1 })
      .toArray() as SupportTicketEventDocument[];
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ ticketObjectId: 1, createdAt: 1 });
    await this.collection.createIndex({ ticketId: 1, createdAt: 1 });
  }
}

let supportTicketEventRepository: SupportTicketEventRepository | null = null;

export function getSupportTicketEventRepository(): SupportTicketEventRepository {
  if (!supportTicketEventRepository) {
    supportTicketEventRepository = new SupportTicketEventRepository();
  }
  return supportTicketEventRepository;
}
