/**
 * E2E media repository
 * Data access layer for E2E encrypted conversation media with MongoDB persistence.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  E2EMediaDocument,
  E2EMediaStatus,
  ModerationStatus,
  CreateE2EMediaInput,
} from '../models/e2e-media';
import { withUpdatedAt } from '../models/base';

export class E2EMediaRepository extends BaseRepository<E2EMediaDocument> {
  constructor() {
    super(Collections.E2E_MEDIA);
  }

  async findByE2EMediaId(e2eMediaId: string): Promise<E2EMediaDocument | null> {
    return await this.findOne({ e2eMediaId });
  }

  async findByE2EMediaIdAndIdentity(
    e2eMediaId: string,
    identityId: string | ObjectId
  ): Promise<E2EMediaDocument | null> {
    const objectId = this.toObjectId(identityId);
    return await this.findOne({ e2eMediaId, identityId: objectId });
  }

  async findByScanHash(scanHash: string): Promise<E2EMediaDocument | null> {
    return await this.findOne({ scanHash });
  }

  async findManyByE2EMediaIds(e2eMediaIds: string[]): Promise<E2EMediaDocument[]> {
    return await this.findMany(
      { e2eMediaId: { $in: e2eMediaIds } } as Parameters<typeof this.findMany>[0],
      e2eMediaIds.length
    );
  }

  async createE2EMedia(input: CreateE2EMediaInput): Promise<E2EMediaDocument> {
    return await this.create({
      ...input,
      status: 'pending',
      moderationStatus: 'pending',
      reportStatus: 'none',
    } as Omit<E2EMediaDocument, '_id' | 'createdAt' | 'updatedAt'>);
  }

  async updateStatus(
    e2eMediaId: string,
    status: E2EMediaStatus
  ): Promise<E2EMediaDocument | null> {
    const update = withUpdatedAt({ status });

    const result = await this.collection.findOneAndUpdate(
      { e2eMediaId },
      { $set: update },
      { returnDocument: 'after' }
    );

    return result as E2EMediaDocument | null;
  }

  async setModerationStatusByMediaId(
    e2eMediaId: string,
    moderationStatus: ModerationStatus
  ): Promise<E2EMediaDocument | null> {
    const update = withUpdatedAt({ moderationStatus });
    const result = await this.collection.findOneAndUpdate(
      { e2eMediaId },
      { $set: update },
      { returnDocument: 'after' }
    );
    return result as E2EMediaDocument | null;
  }

  async updateModerationStatus(
    scanHash: string,
    moderationStatus: ModerationStatus,
    moderationReason?: string
  ): Promise<E2EMediaDocument | null> {
    const statusField: E2EMediaStatus =
      moderationStatus === 'passed' ? 'available' :
      moderationStatus === 'rejected' ? 'gated' :
      'gated';

    const update = withUpdatedAt({
      moderationStatus,
      status: statusField,
      ...(moderationReason ? { moderationReason } : {}),
    });

    const result = await this.collection.findOneAndUpdate(
      { scanHash },
      { $set: update },
      { returnDocument: 'after' }
    );

    return result as E2EMediaDocument | null;
  }

  async countRecentByIdentity(
    identityId: string | ObjectId,
    windowSeconds: number
  ): Promise<number> {
    const objectId = this.toObjectId(identityId);
    const since = new Date(Date.now() - windowSeconds * 1000);

    return await this.count({
      identityId: objectId,
      createdAt: { $gte: since },
    } as Parameters<typeof this.count>[0]);
  }

  async setExpiresAt(
    e2eMediaIds: string[],
    expiresAt: Date
  ): Promise<number> {
    const result = await this.collection.updateMany(
      { e2eMediaId: { $in: e2eMediaIds } },
      { $set: withUpdatedAt({ expiresAt }) }
    );
    return result.modifiedCount;
  }

  async deleteByE2EMediaId(e2eMediaId: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ e2eMediaId });
    return result.deletedCount === 1;
  }
}

let e2eMediaRepository: E2EMediaRepository | null = null;

export function getE2EMediaRepository(): E2EMediaRepository {
  if (!e2eMediaRepository) {
    e2eMediaRepository = new E2EMediaRepository();
  }
  return e2eMediaRepository;
}
