/**
 * Report event repository — data access for platform_report_events.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  ReportEventDocument,
  CreateReportEventInput,
} from '../models/report-event';

export class ReportEventRepository extends BaseRepository<ReportEventDocument> {
  constructor() {
    super(Collections.PLATFORM_REPORT_EVENTS);
  }

  async createEvent(input: CreateReportEventInput): Promise<ReportEventDocument> {
    const doc: Omit<ReportEventDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      reportId: input.reportId,
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      body: input.body,
      metadata: input.metadata,
    };

    return await super.create(doc);
  }

  async listByReportId(
    reportId: string | ObjectId,
    options?: { includeInternal?: boolean },
  ): Promise<ReportEventDocument[]> {
    const oid = typeof reportId === 'string' ? new ObjectId(reportId) : reportId;
    const filter: Filter<ReportEventDocument> = { reportId: oid };

    if (!options?.includeInternal) {
      filter.eventType = { $ne: 'comment_internal' } as unknown as ReportEventDocument['eventType'];
    }

    return await this.collection
      .find(filter)
      .sort({ createdAt: 1 })
      .toArray() as ReportEventDocument[];
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ reportId: 1, createdAt: 1 });
  }
}

let reportEventRepository: ReportEventRepository | null = null;

export function getReportEventRepository(): ReportEventRepository {
  if (!reportEventRepository) {
    reportEventRepository = new ReportEventRepository();
  }
  return reportEventRepository;
}
