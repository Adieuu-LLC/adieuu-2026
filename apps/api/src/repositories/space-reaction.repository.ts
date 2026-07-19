/**
 * Space reaction repository.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceReactionDocument, CreateSpaceReactionInput } from '../models/space-reaction';

export class SpaceReactionRepository extends BaseRepository<SpaceReactionDocument> {
  constructor() {
    super(Collections.SPACE_REACTIONS);
  }

  async createReaction(input: CreateSpaceReactionInput): Promise<SpaceReactionDocument> {
    return await this.create(
      input as Omit<SpaceReactionDocument, '_id' | 'createdAt' | 'updatedAt'>,
    );
  }

  async findByMessage(messageId: ObjectId): Promise<SpaceReactionDocument[]> {
    return await this.findMany({ messageId } as Filter<SpaceReactionDocument>, 500);
  }

  /**
   * Return the subset of the given message ids that have at least one reaction.
   * Uses a `distinct` on the indexed `messageId` field so it stays cheap for a
   * full page of messages.
   */
  async messageIdsWithReactions(messageIds: ObjectId[]): Promise<Set<string>> {
    if (messageIds.length === 0) return new Set();
    const ids = (await this.collection.distinct('messageId', {
      messageId: { $in: messageIds },
    } as Filter<SpaceReactionDocument>)) as ObjectId[];
    return new Set(ids.map((id) => id.toHexString()));
  }

  async findExisting(
    messageId: ObjectId,
    identityId: ObjectId,
    emoji: string,
  ): Promise<SpaceReactionDocument | null> {
    return await this.findOne({
      messageId,
      identityId,
      emoji,
    } as Filter<SpaceReactionDocument>);
  }

  async deleteByMessage(messageId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      messageId,
    } as Filter<SpaceReactionDocument>);
    return result.deletedCount;
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      spaceId,
    } as Filter<SpaceReactionDocument>);
    return result.deletedCount;
  }
}

let spaceReactionRepository: SpaceReactionRepository | null = null;

export function getSpaceReactionRepository(): SpaceReactionRepository {
  if (!spaceReactionRepository) {
    spaceReactionRepository = new SpaceReactionRepository();
  }
  return spaceReactionRepository;
}
