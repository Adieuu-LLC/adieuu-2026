/**
 * Space message repository
 * Data access for messages posted in Space channels. First pass stores
 * plaintext content for non-E2EE channels; the E2EE path is deferred.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceMessageDocument, CreateSpaceMessageInput } from '../models/space-message';

export class SpaceMessageRepository extends BaseRepository<SpaceMessageDocument> {
  constructor() {
    super(Collections.SPACE_MESSAGES);
  }

  async createMessage(input: CreateSpaceMessageInput): Promise<SpaceMessageDocument> {
    return await this.create(
      input as Omit<SpaceMessageDocument, '_id' | 'createdAt' | 'updatedAt'>
    );
  }

  /**
   * Messages for a channel, newest first, cursor-paginated. With a cursor,
   * `asc` returns messages older than the cursor; the default returns newer.
   */
  async findByChannel(
    channelId: ObjectId,
    limit = 50,
    cursor?: ObjectId,
    direction?: 'asc' | 'desc'
  ): Promise<SpaceMessageDocument[]> {
    const filter: Filter<SpaceMessageDocument> = { channelId } as Filter<SpaceMessageDocument>;
    if (cursor) {
      (filter as Record<string, unknown>)._id =
        direction === 'asc' ? { $lt: cursor } : { $gt: cursor };
    }
    return (await this.collection
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .toArray()) as SpaceMessageDocument[];
  }

  async findByClientMessageId(
    channelId: ObjectId,
    clientMessageId: string
  ): Promise<SpaceMessageDocument | null> {
    return await this.findOne({ channelId, clientMessageId } as Filter<SpaceMessageDocument>);
  }

  async countByChannel(channelId: ObjectId): Promise<number> {
    return await this.count({ channelId } as Filter<SpaceMessageDocument>);
  }

  async deleteByChannel(channelId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      channelId,
    } as Filter<SpaceMessageDocument>);
    return result.deletedCount;
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceMessageDocument>);
    return result.deletedCount;
  }
}

let spaceMessageRepository: SpaceMessageRepository | null = null;

export function getSpaceMessageRepository(): SpaceMessageRepository {
  if (!spaceMessageRepository) {
    spaceMessageRepository = new SpaceMessageRepository();
  }
  return spaceMessageRepository;
}
