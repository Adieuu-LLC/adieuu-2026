/**
 * Report repository — data access for platform_reports collection.
 */

import { ObjectId, type Filter, type Sort } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  ReportDocument,
  CreateReportInput,
  ReportStatus,
  ReportResolution,
} from '../models/report';

export interface ReportListFilter {
  status?: ReportStatus | ReportStatus[];
  assignedTo?: string | null;
  reportType?: string;
  category?: string;
  scopeType?: string;
  targetIdentityId?: string;
  reporterIdentityId?: string;
}

export interface ReportListOptions {
  filter?: ReportListFilter;
  page?: number;
  limit?: number;
  sort?: Sort;
}

export interface ReportListResult {
  reports: ReportDocument[];
  total: number;
  page: number;
  limit: number;
}

export class ReportRepository extends BaseRepository<ReportDocument> {
  constructor() {
    super(Collections.PLATFORM_REPORTS);
  }

  async createReport(input: CreateReportInput): Promise<ReportDocument> {
    const doc: Omit<ReportDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      reportType: input.reportType,
      source: input.source,
      status: 'open',
      category: input.category,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      targetRef: input.targetRef,
      targetIdentityId: input.targetIdentityId,
      targetUserId: input.targetUserId,
      reporterIdentityId: input.reporterIdentityId,
      reporterUserId: input.reporterUserId,
      detectionMetadata: input.detectionMetadata,
      evidence: input.evidence,
      reporterReason: input.reporterReason,
      idempotencyKey: input.idempotencyKey,
    };

    return await super.create(doc);
  }

  async findByIdempotencyKey(key: string): Promise<ReportDocument | null> {
    return await this.findOne({ idempotencyKey: key } as Filter<ReportDocument>);
  }

  async list(options: ReportListOptions = {}): Promise<ReportListResult> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const skip = (page - 1) * limit;
    const sort: Sort = options.sort ?? { createdAt: -1 };

    const filter: Filter<ReportDocument> = {};
    const f = options.filter;
    if (f) {
      if (f.status) {
        filter.status = Array.isArray(f.status) ? { $in: f.status } : f.status;
      }
      if (f.assignedTo !== undefined) {
        filter.assignedTo = f.assignedTo === null ? { $exists: false } : f.assignedTo;
      }
      if (f.reportType) filter.reportType = f.reportType as ReportDocument['reportType'];
      if (f.category) filter.category = f.category as ReportDocument['category'];
      if (f.scopeType) filter.scopeType = f.scopeType as ReportDocument['scopeType'];
      if (f.targetIdentityId) filter.targetIdentityId = f.targetIdentityId;
      if (f.reporterIdentityId) filter.reporterIdentityId = f.reporterIdentityId;
    }

    const [reports, total] = await Promise.all([
      this.collection.find(filter).sort(sort).skip(skip).limit(limit).toArray() as Promise<ReportDocument[]>,
      this.collection.countDocuments(filter),
    ]);

    return { reports, total, page, limit };
  }

  async assign(reportId: string | ObjectId, userId: string): Promise<ReportDocument | null> {
    return await this.updateById(reportId, { assignedTo: userId } as Partial<ReportDocument>);
  }

  async unassign(reportId: string | ObjectId): Promise<ReportDocument | null> {
    const objectId = this.toObjectId(reportId);
    const result = await this.collection.findOneAndUpdate(
      { _id: objectId },
      { $unset: { assignedTo: '' }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    return result as ReportDocument | null;
  }

  async escalate(
    reportId: string | ObjectId,
    escalatedBy: string,
  ): Promise<ReportDocument | null> {
    return await this.updateById(reportId, {
      status: 'escalated',
      escalatedBy,
      escalatedAt: new Date(),
    } as Partial<ReportDocument>);
  }

  async resolve(
    reportId: string | ObjectId,
    resolution: ReportResolution,
  ): Promise<ReportDocument | null> {
    return await this.updateById(reportId, {
      status: 'resolved',
      resolution,
    } as Partial<ReportDocument>);
  }

  async close(
    reportId: string | ObjectId,
    closedBy: string,
    closureReason: string,
  ): Promise<ReportDocument | null> {
    return await this.updateById(reportId, {
      status: 'closed',
      closedBy,
      closureReason,
      closedAt: new Date(),
    } as Partial<ReportDocument>);
  }

  async reopen(reportId: string | ObjectId, reopenedBy: string): Promise<ReportDocument | null> {
    const objectId = this.toObjectId(reportId);
    const result = await this.collection.findOneAndUpdate(
      { _id: objectId },
      {
        $set: { status: 'open' as ReportStatus, updatedAt: new Date() },
        $unset: {
          resolution: '',
          closureReason: '',
          closedBy: '',
          closedAt: '',
        },
      },
      { returnDocument: 'after' },
    );
    return result as ReportDocument | null;
  }

  async updateCategory(
    reportId: string | ObjectId,
    category: string,
  ): Promise<ReportDocument | null> {
    return await this.updateById(reportId, { category } as Partial<ReportDocument>);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ status: 1, createdAt: -1 });
    await this.collection.createIndex({ assignedTo: 1, status: 1 });
    await this.collection.createIndex({ idempotencyKey: 1 }, { unique: true, sparse: true });
    await this.collection.createIndex({ scopeType: 1, scopeId: 1, status: 1 });
    await this.collection.createIndex({ targetIdentityId: 1, createdAt: -1 });
    await this.collection.createIndex({ reporterIdentityId: 1, createdAt: -1 });
  }
}

let reportRepository: ReportRepository | null = null;

export function getReportRepository(): ReportRepository {
  if (!reportRepository) {
    reportRepository = new ReportRepository();
  }
  return reportRepository;
}
