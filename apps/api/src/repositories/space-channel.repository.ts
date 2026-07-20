/**
 * Space channel repository
 * Data access for channels within a Space.
 */

import { type Filter, type UpdateFilter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  SpaceChannelDocument,
  CreateSpaceChannelInput,
  UpdateSpaceChannelFields,
} from '../models/space-channel';

export class SpaceChannelRepository extends BaseRepository<SpaceChannelDocument> {
  constructor() {
    super(Collections.SPACE_CHANNELS);
  }

  async createChannel(input: CreateSpaceChannelInput): Promise<SpaceChannelDocument> {
    return await this.create(
      input as Omit<SpaceChannelDocument, '_id' | 'createdAt' | 'updatedAt'>
    );
  }

  async updateChannel(
    spaceId: ObjectId,
    channelId: ObjectId,
    fields: UpdateSpaceChannelFields,
  ): Promise<SpaceChannelDocument | null> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, ''> = {};

    if (fields.name !== undefined) $set.name = fields.name;
    if (fields.allowedRoleIds !== undefined) $set.allowedRoleIds = fields.allowedRoleIds;
    if (fields.position !== undefined) $set.position = fields.position;
    if (fields.clearCategoryId) {
      $unset.categoryId = '';
    } else if (fields.categoryId !== undefined) {
      $set.categoryId = fields.categoryId;
    }
    if (fields.encryptedName !== undefined) $set.encryptedName = fields.encryptedName;
    if (fields.nameNonce !== undefined) $set.nameNonce = fields.nameNonce;
    if (fields.cipherId !== undefined) $set.cipherId = fields.cipherId;
    if (fields.clearCipherCheck) {
      $unset.cipherCheck = '';
    } else if (fields.cipherCheck !== undefined) {
      $set.cipherCheck = fields.cipherCheck;
    }

    const update: UpdateFilter<SpaceChannelDocument> = { $set };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: channelId, spaceId } as Filter<SpaceChannelDocument>,
      update,
      { returnDocument: 'after' },
    );
    return (result as SpaceChannelDocument | null) ?? null;
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

  /** Clear categoryId for all channels in a category (uncategorize). */
  async clearCategory(spaceId: ObjectId, categoryId: ObjectId): Promise<number> {
    return this.reparentChannels(spaceId, categoryId, null);
  }

  /** Move all channels in `fromCategoryId` to `toCategoryId` (null = uncategorized). */
  async reparentChannels(
    spaceId: ObjectId,
    fromCategoryId: ObjectId,
    toCategoryId: ObjectId | null,
  ): Promise<number> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, ''> = {};
    if (toCategoryId) {
      $set.categoryId = toCategoryId;
    } else {
      $unset.categoryId = '';
    }
    const update: UpdateFilter<SpaceChannelDocument> = { $set };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }
    const result = await this.collection.updateMany(
      { spaceId, categoryId: fromCategoryId } as Filter<SpaceChannelDocument>,
      update,
    );
    return result.modifiedCount;
  }

  /** Bulk-set categoryId + position for channels in a Space. */
  async setLayout(
    spaceId: ObjectId,
    entries: ReadonlyArray<{
      channelId: ObjectId;
      categoryId: ObjectId | null;
      position: number;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    const ops = entries.map(({ channelId, categoryId, position }) => {
      const $set: Record<string, unknown> = { position, updatedAt: new Date() };
      const $unset: Record<string, ''> = {};
      if (categoryId) {
        $set.categoryId = categoryId;
      } else {
        $unset.categoryId = '';
      }
      const update: UpdateFilter<SpaceChannelDocument> = { $set };
      if (Object.keys($unset).length > 0) {
        update.$unset = $unset;
      }
      return {
        updateOne: {
          filter: { _id: channelId, spaceId } as Filter<SpaceChannelDocument>,
          update,
        },
      };
    });
    await this.collection.bulkWrite(ops);
  }
}

let spaceChannelRepository: SpaceChannelRepository | null = null;

export function getSpaceChannelRepository(): SpaceChannelRepository {
  if (!spaceChannelRepository) {
    spaceChannelRepository = new SpaceChannelRepository();
  }
  return spaceChannelRepository;
}
