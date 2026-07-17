/**
 * Space message repository
 * Data access for messages posted in Space channels. First pass stores
 * plaintext content for non-E2EE channels; the E2EE path is deferred.
 */

import { type Filter, type UpdateFilter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceMessageDocument, CreateSpaceMessageInput } from '../models/space-message';

export class SpaceMessageRepository extends BaseRepository<SpaceMessageDocument> {
  constructor() {
    super(Collections.SPACE_MESSAGES);
  }

  async createMessage(input: CreateSpaceMessageInput): Promise<SpaceMessageDocument> {
    const doc = {
      ...input,
      deleted: input.deleted ?? false,
      revisionCount: input.revisionCount ?? 0,
    };
    return await this.create(
      doc as Omit<SpaceMessageDocument, '_id' | 'createdAt' | 'updatedAt'>
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

  async findByIdInChannel(
    channelId: ObjectId,
    messageId: ObjectId,
  ): Promise<SpaceMessageDocument | null> {
    return await this.findOne({ _id: messageId, channelId } as Filter<SpaceMessageDocument>);
  }

  /**
   * Fetch a window of messages around a target message in a channel.
   * Returns `before` messages older than the target, the target itself, and
   * `after` messages newer than the target.
   */
  async findAround(
    channelId: ObjectId,
    targetId: ObjectId,
    before: number,
    after: number,
  ): Promise<SpaceMessageDocument[]> {
    const olderFilter: Filter<SpaceMessageDocument> = {
      channelId,
      _id: { $lt: targetId },
    } as Filter<SpaceMessageDocument>;
    const older = await this.collection
      .find(olderFilter)
      .sort({ _id: -1 })
      .limit(before)
      .toArray() as SpaceMessageDocument[];

    const target = await this.findOne({ _id: targetId, channelId } as Filter<SpaceMessageDocument>);

    const newerFilter: Filter<SpaceMessageDocument> = {
      channelId,
      _id: { $gt: targetId },
    } as Filter<SpaceMessageDocument>;
    const newer = await this.collection
      .find(newerFilter)
      .sort({ _id: 1 })
      .limit(after)
      .toArray() as SpaceMessageDocument[];

    const result = [...older.reverse()];
    if (target) result.push(target);
    result.push(...newer);
    return result;
  }

  async editMessage(
    messageId: ObjectId,
    content: string,
  ): Promise<SpaceMessageDocument | null> {
    const existing = await this.findOne({ _id: messageId } as Filter<SpaceMessageDocument>);
    if (!existing) return null;

    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      { _id: messageId } as Filter<SpaceMessageDocument>,
      {
        $set: { content, lastEditedAt: now, updatedAt: now },
        $inc: { revisionCount: 1 },
        $push: { revisionHistory: { content: existing.content, replacedAt: now } },
      } as UpdateFilter<SpaceMessageDocument>,
      { returnDocument: 'after' },
    );
    return result as SpaceMessageDocument | null;
  }

  async softDelete(messageId: ObjectId): Promise<SpaceMessageDocument | null> {
    const now = new Date();
    const result = await this.collection.findOneAndUpdate(
      { _id: messageId } as Filter<SpaceMessageDocument>,
      {
        $set: { deleted: true, content: '', updatedAt: now },
      } as UpdateFilter<SpaceMessageDocument>,
      { returnDocument: 'after' },
    );
    return result as SpaceMessageDocument | null;
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
