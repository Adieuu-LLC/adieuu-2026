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

    if (fields.name !== undefined) $set.name = fields.name;
    if (fields.allowedRoleIds !== undefined) $set.allowedRoleIds = fields.allowedRoleIds;
    if (fields.encryptedName !== undefined) $set.encryptedName = fields.encryptedName;
    if (fields.nameNonce !== undefined) $set.nameNonce = fields.nameNonce;
    if (fields.cipherId !== undefined) $set.cipherId = fields.cipherId;
    if (fields.position !== undefined) $set.position = fields.position;

    const result = await this.collection.findOneAndUpdate(
      { _id: categoryId, spaceId } as Filter<SpaceChannelCategoryDocument>,
      { $set } as UpdateFilter<SpaceChannelCategoryDocument>,
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

  /** Bulk-set positions for an ordered list of category ids in a Space. */
  async setPositions(
    spaceId: ObjectId,
    orderedIds: readonly ObjectId[],
  ): Promise<void> {
    if (orderedIds.length === 0) return;
    const ops = orderedIds.map((id, position) => ({
      updateOne: {
        filter: { _id: id, spaceId } as Filter<SpaceChannelCategoryDocument>,
        update: { $set: { position, updatedAt: new Date() } },
      },
    }));
    await this.collection.bulkWrite(ops);
  }
}

let spaceChannelCategoryRepository: SpaceChannelCategoryRepository | null = null;

export function getSpaceChannelCategoryRepository(): SpaceChannelCategoryRepository {
  if (!spaceChannelCategoryRepository) {
    spaceChannelCategoryRepository = new SpaceChannelCategoryRepository();
  }
  return spaceChannelCategoryRepository;
}
