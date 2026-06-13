/**
 * Support ticket repository — data access for support_tickets collection.
 */

import { type Filter, type Sort } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  SupportTicketDocument,
  CreateSupportTicketInput,
  TicketSubmitterType,
} from '../models/support-ticket';
import type { TicketCategory, TicketStatus } from '@adieuu/shared';

export interface SupportTicketListFilter {
  status?: TicketStatus | TicketStatus[];
  assignedTo?: string | null;
  category?: TicketCategory;
  submitterType?: TicketSubmitterType;
  submitterId?: string;
}

export interface SupportTicketListOptions {
  filter?: SupportTicketListFilter;
  page?: number;
  limit?: number;
  sort?: Sort;
}

export interface SupportTicketListResult {
  tickets: SupportTicketDocument[];
  total: number;
  page: number;
  limit: number;
}

export class SupportTicketRepository extends BaseRepository<SupportTicketDocument> {
  constructor() {
    super(Collections.SUPPORT_TICKETS);
  }

  async createTicket(input: CreateSupportTicketInput): Promise<SupportTicketDocument> {
    const doc: Omit<SupportTicketDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      ticketId: input.ticketId,
      submitterType: input.submitterType,
      submitterId: input.submitterId,
      category: input.category,
      subcategory: input.subcategory,
      title: input.title,
      body: input.body,
      attachmentMediaIds: input.attachmentMediaIds,
      status: 'open',
    };

    return await super.create(doc);
  }

  async findByTicketId(ticketId: string): Promise<SupportTicketDocument | null> {
    return await this.findOne({ ticketId } as Filter<SupportTicketDocument>);
  }

  async list(options: SupportTicketListOptions = {}): Promise<SupportTicketListResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const skip = (page - 1) * limit;
    const sort: Sort = options.sort ?? { createdAt: -1 };

    const filter: Filter<SupportTicketDocument> = {};
    const f = options.filter;
    if (f) {
      if (f.status) {
        filter.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
      }
      if (f.assignedTo !== undefined) {
        filter.assignedTo = f.assignedTo === null ? { $exists: false } : f.assignedTo;
      }
      if (f.category) filter.category = f.category;
      if (f.submitterType) filter.submitterType = f.submitterType;
      if (f.submitterId) filter.submitterId = f.submitterId;
    }

    const [tickets, total] = await Promise.all([
      this.collection.find(filter).sort(sort).skip(skip).limit(limit).toArray() as Promise<SupportTicketDocument[]>,
      this.collection.countDocuments(filter),
    ]);

    return { tickets, total, page, limit };
  }

  async assign(ticketObjectId: string, identityId: string): Promise<SupportTicketDocument | null> {
    return await this.updateById(ticketObjectId, { assignedTo: identityId } as Partial<SupportTicketDocument>);
  }

  async unassign(ticketObjectId: string): Promise<SupportTicketDocument | null> {
    const objectId = this.toObjectId(ticketObjectId);
    const result = await this.collection.findOneAndUpdate(
      { _id: objectId },
      { $unset: { assignedTo: '' }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return result as SupportTicketDocument | null;
  }

  async setStatus(
    ticketObjectId: string,
    status: TicketStatus,
    extra?: Partial<SupportTicketDocument>,
  ): Promise<SupportTicketDocument | null> {
    return await this.updateById(ticketObjectId, { status, ...extra } as Partial<SupportTicketDocument>);
  }

  async escalate(
    ticketObjectId: string,
    escalatedBy: string,
  ): Promise<SupportTicketDocument | null> {
    return await this.updateById(ticketObjectId, {
      status: 'escalated',
      escalatedBy,
      escalatedAt: new Date(),
    } as Partial<SupportTicketDocument>);
  }

  async resolve(
    ticketObjectId: string,
    resolvedBy: string,
    resolutionNote: string,
  ): Promise<SupportTicketDocument | null> {
    return await this.updateById(ticketObjectId, {
      status: 'resolved',
      resolvedBy,
      resolutionNote,
      resolvedAt: new Date(),
    } as Partial<SupportTicketDocument>);
  }

  async close(
    ticketObjectId: string,
    closedBy: string,
    closureReason: string,
  ): Promise<SupportTicketDocument | null> {
    return await this.updateById(ticketObjectId, {
      status: 'closed',
      closedBy,
      closureReason,
      closedAt: new Date(),
    } as Partial<SupportTicketDocument>);
  }

  async reopen(ticketObjectId: string): Promise<SupportTicketDocument | null> {
    const objectId = this.toObjectId(ticketObjectId);
    const result = await this.collection.findOneAndUpdate(
      { _id: objectId },
      {
        $set: { status: 'open' as TicketStatus, updatedAt: new Date() },
        $unset: {
          resolutionNote: '',
          resolvedBy: '',
          resolvedAt: '',
          closureReason: '',
          closedBy: '',
          closedAt: '',
          escalatedBy: '',
          escalatedAt: '',
        },
      },
      { returnDocument: 'after' },
    );
    return result as SupportTicketDocument | null;
  }

  async countRecentBySubmitter(
    submitterType: TicketSubmitterType,
    submitterId: string,
    windowSeconds: number,
  ): Promise<number> {
    const since = new Date(Date.now() - windowSeconds * 1000);
    return await this.count({
      submitterType,
      submitterId,
      createdAt: { $gte: since },
    } as Filter<SupportTicketDocument>);
  }

  async markSubmitterRead(ticketObjectId: string, readAt?: Date): Promise<void> {
    await this.updateById(ticketObjectId, {
      submitterLastReadAt: readAt ?? new Date(),
    } as Partial<SupportTicketDocument>);
  }

  async countUnreadForSubmitter(
    submitterType: TicketSubmitterType,
    submitterId: string,
  ): Promise<number> {
    const pipeline = [
      {
        $match: {
          submitterType,
          submitterId,
          status: { $nin: ['resolved', 'closed'] },
        },
      },
      {
        $lookup: {
          from: Collections.SUPPORT_TICKET_EVENTS,
          let: { ticketOid: '$_id', lastRead: '$submitterLastReadAt', submitterId: '$submitterId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$ticketObjectId', '$$ticketOid'] },
                    { $eq: ['$eventType', 'comment_public'] },
                    { $eq: ['$actorType', 'identity'] },
                    { $ne: ['$actorId', '$$submitterId'] },
                    {
                      $gt: [
                        '$createdAt',
                        { $ifNull: ['$$lastRead', new Date(0)] },
                      ],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'unreadEvents',
        },
      },
      { $match: { 'unreadEvents.0': { $exists: true } } },
      { $count: 'count' },
    ];

    const result = await this.collection.aggregate<{ count: number }>(pipeline).toArray();
    return result[0]?.count ?? 0;
  }
}

let supportTicketRepository: SupportTicketRepository | null = null;

export function getSupportTicketRepository(): SupportTicketRepository {
  if (!supportTicketRepository) {
    supportTicketRepository = new SupportTicketRepository();
  }
  return supportTicketRepository;
}
