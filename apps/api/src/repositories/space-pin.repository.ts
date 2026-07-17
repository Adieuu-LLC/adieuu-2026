/**
 * Space channel pin repository.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpacePinDocument, CreateSpacePinInput } from '../models/space-pin';

export class SpacePinRepository extends BaseRepository<SpacePinDocument> {
  constructor() {
    super(Collections.SPACE_PINS);
  }

  async createPin(input: CreateSpacePinInput): Promise<SpacePinDocument> {
    const doc = { ...input, pinnedAt: new Date() };
    return await this.create(
      doc as Omit<SpacePinDocument, '_id' | 'createdAt' | 'updatedAt'>,
    );
  }

  async findByChannel(
    channelId: ObjectId,
    limit = 50,
    cursor?: { pinnedAt: Date; id: ObjectId },
  ): Promise<SpacePinDocument[]> {
    const filter: Filter<SpacePinDocument> = { channelId } as Filter<SpacePinDocument>;
    if (cursor) {
      (filter as Record<string, unknown>).$or = [
        { pinnedAt: { $lt: cursor.pinnedAt } },
        { pinnedAt: cursor.pinnedAt, _id: { $lt: cursor.id } },
      ];
    }
    return (await this.collection
      .find(filter)
      .sort({ pinnedAt: -1, _id: -1 })
      .limit(limit)
      .toArray()) as SpacePinDocument[];
  }

  async findPin(
    channelId: ObjectId,
    messageId: ObjectId,
  ): Promise<SpacePinDocument | null> {
    return await this.findOne({ channelId, messageId } as Filter<SpacePinDocument>);
  }

  async removePin(
    channelId: ObjectId,
    messageId: ObjectId,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      channelId,
      messageId,
    } as Filter<SpacePinDocument>);
    return result.deletedCount === 1;
  }
}

let spacePinRepository: SpacePinRepository | null = null;

export function getSpacePinRepository(): SpacePinRepository {
  if (!spacePinRepository) {
    spacePinRepository = new SpacePinRepository();
  }
  return spacePinRepository;
}
