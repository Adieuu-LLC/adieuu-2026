/**
 * Space audit log repository.
 * Newest-first listing for the Space Manage audit UI.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { CreateSpaceAuditLogInput, SpaceAuditLogDocument } from '../models/space-audit';

export class SpaceAuditLogRepository extends BaseRepository<SpaceAuditLogDocument> {
  constructor() {
    super(Collections.SPACE_AUDIT_LOGS);
  }

  async create(input: CreateSpaceAuditLogInput): Promise<SpaceAuditLogDocument> {
    const doc: Omit<SpaceAuditLogDocument, '_id' | 'createdAt' | 'updatedAt'> = {
      spaceId: input.spaceId,
      actorIdentityId: input.actorIdentityId,
      action: input.action,
      ...(input.targetIdentityId ? { targetIdentityId: input.targetIdentityId } : {}),
      ...(input.targetId ? { targetId: input.targetId } : {}),
      ...(input.channelId ? { channelId: input.channelId } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    return await super.create(doc);
  }

  /**
   * Newest-first page for a Space. Cursor is the last seen entry `_id`
   * (ObjectId / createdAt are roughly aligned for new inserts).
   */
  async listBySpace(
    spaceId: ObjectId,
    limit = 50,
    cursor?: ObjectId,
  ): Promise<SpaceAuditLogDocument[]> {
    const filter: Record<string, unknown> = { spaceId };
    if (cursor) {
      filter._id = { $lt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceAuditLogDocument>)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray()) as SpaceAuditLogDocument[];
  }
}

let spaceAuditLogRepository: SpaceAuditLogRepository | null = null;

export function getSpaceAuditLogRepository(): SpaceAuditLogRepository {
  if (!spaceAuditLogRepository) {
    spaceAuditLogRepository = new SpaceAuditLogRepository();
  }
  return spaceAuditLogRepository;
}
