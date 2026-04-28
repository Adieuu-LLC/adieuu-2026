/**
 * Age verification attempt repository.
 */

import type { ObjectId, Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type {
  AgeVerificationDocument,
  AgeVerificationAttemptStatus,
} from '../models/age-verification';

export class AgeVerificationRepository extends BaseRepository<AgeVerificationDocument> {
  constructor() {
    super(Collections.AGE_VERIFICATIONS);
  }

  async findByProviderVerificationId(
    providerVerificationId: string,
  ): Promise<AgeVerificationDocument | null> {
    return this.findOne({
      providerVerificationId,
    } as Filter<AgeVerificationDocument>);
  }

  async findLatestByUserId(
    userId: ObjectId,
  ): Promise<AgeVerificationDocument | null> {
    const results = await this.collection
      .find({ userId } as Filter<AgeVerificationDocument>)
      .sort({ startedAt: -1 })
      .limit(1)
      .toArray();
    return results[0] ?? null;
  }

  async findByUserIdAndStatus(
    userId: ObjectId,
    statuses: AgeVerificationAttemptStatus[],
  ): Promise<AgeVerificationDocument[]> {
    return this.collection
      .find({
        userId,
        status: { $in: statuses },
      } as Filter<AgeVerificationDocument>)
      .sort({ startedAt: -1 })
      .toArray();
  }

  async createVerification(
    input: Omit<AgeVerificationDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AgeVerificationDocument> {
    return this.create(input);
  }

  async updateStatus(
    id: string | ObjectId,
    status: AgeVerificationAttemptStatus,
    extra?: Partial<Pick<AgeVerificationDocument, 'approvalMethod' | 'backgroundCheck' | 'completedAt'>>,
  ): Promise<void> {
    const objectId = this.toObjectId(id);
    await this.collection.updateOne(
      { _id: objectId },
      {
        $set: {
          status,
          ...extra,
          updatedAt: new Date(),
        },
      },
    );
  }
}

let repo: AgeVerificationRepository | null = null;

export function getAgeVerificationRepository(): AgeVerificationRepository {
  if (!repo) {
    repo = new AgeVerificationRepository();
  }
  return repo;
}
