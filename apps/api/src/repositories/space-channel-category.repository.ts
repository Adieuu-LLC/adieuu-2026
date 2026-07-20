/**
 * Space channel category repository
 * Data access for channel categories within a Space.
 */

import { type Filter, type UpdateFilter, ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type {
  SpaceChannelCategoryDocument,
  CreateSpaceChannelCategoryInput,
  UpdateSpaceChannelCategoryFields,
} from '../models/space-channel-category';

export class SpaceChannelCategoryRepository extends BaseRepository<SpaceChannelCategoryDocument> {
  constructor() {
    super(Collections.SPACE_CHANNEL_CATEGORIES);
  }

  async createCategory(
    input: CreateSpaceChannelCategoryInput,
  ): Promise<SpaceChannelCategoryDocument> {
    return await this.create(
      input as Omit<SpaceChannelCategoryDocument, '_id' | 'createdAt' | 'updatedAt'>,
    );
  }

  async updateCategory(
    spaceId: ObjectId,
    categoryId: ObjectId,
    fields: UpdateSpaceChannelCategoryFields,
  ): Promise<SpaceChannelCategoryDocument | null> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, ''> = {};

    if (fields.name !== undefined) $set.name = fields.name;
    if (fields.allowedRoleIds !== undefined) $set.allowedRoleIds = fields.allowedRoleIds;
    if (fields.encryptedName !== undefined) $set.encryptedName = fields.encryptedName;
    if (fields.nameNonce !== undefined) $set.nameNonce = fields.nameNonce;
    if (fields.cipherId !== undefined) $set.cipherId = fields.cipherId;
    if (fields.position !== undefined) $set.position = fields.position;
    if (fields.clearParentCategoryId) {
      $unset.parentCategoryId = '';
    } else if (fields.parentCategoryId !== undefined) {
      if (fields.parentCategoryId === null) {
        $unset.parentCategoryId = '';
      } else {
        $set.parentCategoryId = fields.parentCategoryId;
      }
    }

    const update: UpdateFilter<SpaceChannelCategoryDocument> = { $set };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }

    const result = await this.collection.findOneAndUpdate(
      { _id: categoryId, spaceId } as Filter<SpaceChannelCategoryDocument>,
      update,
      { returnDocument: 'after' },
    );
    return (result as SpaceChannelCategoryDocument | null) ?? null;
  }

  async findBySpace(spaceId: ObjectId): Promise<SpaceChannelCategoryDocument[]> {
    return (await this.collection
      .find({ spaceId } as Filter<SpaceChannelCategoryDocument>)
      .sort({ position: 1, _id: 1 })
      .toArray()) as SpaceChannelCategoryDocument[];
  }

  async findByIdInSpace(
    spaceId: ObjectId,
    categoryId: ObjectId,
  ): Promise<SpaceChannelCategoryDocument | null> {
    return await this.findOne({
      _id: categoryId,
      spaceId,
    } as Filter<SpaceChannelCategoryDocument>);
  }

  async deleteCategory(spaceId: ObjectId, categoryId: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: categoryId,
      spaceId,
    } as Filter<SpaceChannelCategoryDocument>);
    return result.deletedCount === 1;
  }

  async deleteBySpace(spaceId: ObjectId): Promise<number> {
    const result = await this.collection.deleteMany({
      spaceId,
    } as Filter<SpaceChannelCategoryDocument>);
    return result.deletedCount;
  }

  /**
   * Bulk-set parent + position for categories in a Space.
   * `parentCategoryId: null` clears nesting (root).
   */
  async setLayout(
    spaceId: ObjectId,
    entries: ReadonlyArray<{
      categoryId: ObjectId;
      parentCategoryId: ObjectId | null;
      position: number;
    }>,
  ): Promise<void> {
    if (entries.length === 0) return;
    const ops = entries.map(({ categoryId, parentCategoryId, position }) => {
      const $set: Record<string, unknown> = { position, updatedAt: new Date() };
      const $unset: Record<string, ''> = {};
      if (parentCategoryId) {
        $set.parentCategoryId = parentCategoryId;
      } else {
        $unset.parentCategoryId = '';
      }
      const update: UpdateFilter<SpaceChannelCategoryDocument> = { $set };
      if (Object.keys($unset).length > 0) {
        update.$unset = $unset;
      }
      return {
        updateOne: {
          filter: { _id: categoryId, spaceId } as Filter<SpaceChannelCategoryDocument>,
          update,
        },
      };
    });
    await this.collection.bulkWrite(ops);
  }

  /** Promote nested categories from `fromParentId` up to `toParentId` (null = root). */
  async reparentChildren(
    spaceId: ObjectId,
    fromParentId: ObjectId,
    toParentId: ObjectId | null,
  ): Promise<number> {
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    const $unset: Record<string, ''> = {};
    if (toParentId) {
      $set.parentCategoryId = toParentId;
    } else {
      $unset.parentCategoryId = '';
    }
    const update: UpdateFilter<SpaceChannelCategoryDocument> = { $set };
    if (Object.keys($unset).length > 0) {
      update.$unset = $unset;
    }
    const result = await this.collection.updateMany(
      { spaceId, parentCategoryId: fromParentId } as Filter<SpaceChannelCategoryDocument>,
      update,
    );
    return result.modifiedCount;
  }
}

let spaceChannelCategoryRepository: SpaceChannelCategoryRepository | null = null;

export function getSpaceChannelCategoryRepository(): SpaceChannelCategoryRepository {
  if (!spaceChannelCategoryRepository) {
    spaceChannelCategoryRepository = new SpaceChannelCategoryRepository();
  }
  return spaceChannelCategoryRepository;
}
