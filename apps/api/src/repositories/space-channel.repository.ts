/**
 * Space channel repository
 * Data access for channels within a Space.
 */

import { type Filter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { SpaceChannelDocument, CreateSpaceChannelInput } from '../models/space-channel';

export class SpaceChannelRepository extends BaseRepository<SpaceChannelDocument> {
  constructor() {
    super(Collections.SPACE_CHANNELS);
  }

  async createChannel(input: CreateSpaceChannelInput): Promise<SpaceChannelDocument> {
    return await this.create(
      input as Omit<SpaceChannelDocument, '_id' | 'createdAt' | 'updatedAt'>
    );
  }

  /** Channels for a Space, ordered by position ascending. */
  async findBySpace(spaceId: ObjectId): Promise<SpaceChannelDocument[]> {
    return (await this.collection
      .find({ spaceId } as Filter<SpaceChannelDocument>)
      .sort({ position: 1, _id: 1 })
      .toArray()) as SpaceChannelDocument[];
  }

  async findByIdInSpace(
    spaceId: ObjectId,
    channelId: ObjectId
  ): Promise<SpaceChannelDocument | null> {
    return await this.findOne({ _id: channelId, spaceId } as Filter<SpaceChannelDocument>);
  }

  async countBySpace(spaceId: ObjectId): Promise<number> {
    return await this.count({ spaceId } as Filter<SpaceChannelDocument>);
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({ spaceId } as Filter<SpaceChannelDocument>);
    return result.deletedCount;
  }
}

let spaceChannelRepository: SpaceChannelRepository | null = null;

export function getSpaceChannelRepository(): SpaceChannelRepository {
  if (!spaceChannelRepository) {
    spaceChannelRepository = new SpaceChannelRepository();
  }
  return spaceChannelRepository;
}
