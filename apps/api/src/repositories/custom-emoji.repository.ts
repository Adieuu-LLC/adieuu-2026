/**
 * Custom emoji repository
 * Data access layer for custom emoji CRUD with MongoDB persistence.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { CustomEmojiDocument } from '../models/custom-emoji';
import { withUpdatedAt } from '../models/base';

export class CustomEmojiRepository extends BaseRepository<CustomEmojiDocument> {
  constructor() {
    super(Collections.CUSTOM_EMOJIS);
  }

  async findByIdentityId(
    identityId: string | ObjectId,
    limit = 50
  ): Promise<CustomEmojiDocument[]> {
    const objectId = this.toObjectId(identityId);
    return await this.collection
      .find({ identityId: objectId } as Filter<CustomEmojiDocument>)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray() as CustomEmojiDocument[];
  }

  async findByShortcode(shortcode: string): Promise<CustomEmojiDocument | null> {
    return await this.findOne({
      shortcode: shortcode.toLowerCase(),
    } as Filter<CustomEmojiDocument>);
  }

  async countByIdentityId(identityId: string | ObjectId): Promise<number> {
    const objectId = this.toObjectId(identityId);
    return await this.count({ identityId: objectId } as Filter<CustomEmojiDocument>);
  }

  async updateShortcodeAndName(
    id: string | ObjectId,
    shortcode: string,
    name: string
  ): Promise<CustomEmojiDocument | null> {
    const objectId = this.toObjectId(id);
    const update = withUpdatedAt({ shortcode: shortcode.toLowerCase(), name });

    const result = await this.collection.findOneAndUpdate(
      { _id: objectId } as Filter<CustomEmojiDocument>,
      { $set: update },
      { returnDocument: 'after' }
    );

    return result as CustomEmojiDocument | null;
  }
}

let customEmojiRepository: CustomEmojiRepository | null = null;

export function getCustomEmojiRepository(): CustomEmojiRepository {
  if (!customEmojiRepository) {
    customEmojiRepository = new CustomEmojiRepository();
  }
  return customEmojiRepository;
}
