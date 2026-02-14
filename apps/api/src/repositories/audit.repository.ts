/**
 * Audit log repository
 * Data access layer for security audit logs
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { AuditLogDocument, CreateAuditLogInput } from '../models/audit';

/**
 * Audit log repository interface
 */
export interface IAuditLogRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogDocument>;
  findByUserId(userId: string | ObjectId, limit?: number): Promise<AuditLogDocument[]>;
  findByIpHash(ipHash: string, limit?: number): Promise<AuditLogDocument[]>;
  countRecentByIpHash(ipHash: string, action: string, windowMs: number): Promise<number>;
  countRecentByIdentifierHash(identifierHash: string, action: string, windowMs: number): Promise<number>;
}

/**
 * Audit log repository implementation
 */
export class AuditLogRepository
  extends BaseRepository<AuditLogDocument>
  implements IAuditLogRepository
{
  constructor() {
    super(Collections.AUDIT_LOGS);
  }

  /**
   * Create a new audit log entry
   */
  async create(input: CreateAuditLogInput): Promise<AuditLogDocument> {
    const doc: Omit<AuditLogDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      userId: input.userId,
      action: input.action,
      identifierHash: input.identifierHash,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
      metadata: input.metadata,
    };

    return await super.create(doc);
  }

  /**
   * Find audit logs for a user
   */
  async findByUserId(userId: string | ObjectId, limit = 100): Promise<AuditLogDocument[]> {
    const objectId = this.toObjectId(userId);
    return await this.collection
      .find({ userId: objectId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Find audit logs by IP hash
   */
  async findByIpHash(ipHash: string, limit = 100): Promise<AuditLogDocument[]> {
    return await this.collection
      .find({ ipHash })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }

  /**
   * Count recent actions by IP hash (for rate limiting checks)
   */
  async countRecentByIpHash(
    ipHash: string,
    action: string,
    windowMs: number
  ): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return await this.collection.countDocuments({
      ipHash,
      action,
      createdAt: { $gte: since },
    });
  }

  /**
   * Count recent actions by identifier hash (for rate limiting checks)
   */
  async countRecentByIdentifierHash(
    identifierHash: string,
    action: string,
    windowMs: number
  ): Promise<number> {
    const since = new Date(Date.now() - windowMs);
    return await this.collection.countDocuments({
      identifierHash,
      action,
      createdAt: { $gte: since },
    });
  }
}

// Singleton instance
let auditLogRepository: AuditLogRepository | null = null;

/**
 * Get the audit log repository instance
 */
export function getAuditLogRepository(): AuditLogRepository {
  if (!auditLogRepository) {
    auditLogRepository = new AuditLogRepository();
  }
  return auditLogRepository;
}
