/**
 * Community Theme repository.
 * Data access layer for publicly shared themes.
 *
 * @module repositories/community-theme
 */

import { ObjectId, type Filter, type Sort } from 'mongodb';
import { getCollection, Collections } from '../db';
import { withTimestamps } from '../models/base';
import type {
  CommunityThemeDocument,
  CreateCommunityThemeInput,
} from '../models/community-theme';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ThemeListOptions {
  page: number;
  limit: number;
  search?: string;
  tag?: string;
  sort: 'newest' | 'downloads' | 'upvotes';
}

export class CommunityThemeRepository {
  private get collection() {
    return getCollection<CommunityThemeDocument>(Collections.COMMUNITY_THEMES);
  }

  async findById(id: string | ObjectId): Promise<CommunityThemeDocument | null> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    return this.collection.findOne({ _id: oid, removedByAdmin: { $ne: true } });
  }

  async list(options: ThemeListOptions): Promise<{ themes: CommunityThemeDocument[]; total: number }> {
    const filter: Filter<CommunityThemeDocument> = { removedByAdmin: { $ne: true } };

    if (options.search) {
      filter.name = { $regex: escapeRegex(options.search), $options: 'i' };
    }
    if (options.tag) {
      filter.tags = options.tag;
    }

    const sortSpec: Sort = options.sort === 'downloads'
      ? { downloads: -1, createdAt: -1 }
      : options.sort === 'upvotes'
        ? { upvotes: -1, createdAt: -1 }
        : { createdAt: -1 };

    const skip = (options.page - 1) * options.limit;

    const [themes, total] = await Promise.all([
      this.collection.find(filter).sort(sortSpec).skip(skip).limit(options.limit).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return { themes, total };
  }

  async create(input: CreateCommunityThemeInput): Promise<CommunityThemeDocument> {
    const _id = new ObjectId();
    const doc: CommunityThemeDocument = {
      _id,
      ...withTimestamps({
        ...input,
        downloads: 0,
        upvotes: 0,
        upvotedBy: [] as ObjectId[],
        reported: false,
        removedByAdmin: false,
      }),
    };

    await this.collection.insertOne(doc);
    return doc;
  }

  async deleteByIdAndAuthor(id: string | ObjectId, authorIdentityId: ObjectId): Promise<boolean> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    const result = await this.collection.deleteOne({ _id: oid, authorIdentityId });
    return result.deletedCount > 0;
  }

  async incrementDownloads(id: string | ObjectId): Promise<void> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    await this.collection.updateOne({ _id: oid }, { $inc: { downloads: 1 } });
  }

  async upvote(id: string | ObjectId, identityId: ObjectId): Promise<boolean> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    const result = await this.collection.updateOne(
      { _id: oid, upvotedBy: { $ne: identityId } },
      { $addToSet: { upvotedBy: identityId }, $inc: { upvotes: 1 } },
    );
    return result.modifiedCount > 0;
  }

  async markReported(id: string | ObjectId): Promise<void> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    await this.collection.updateOne({ _id: oid }, { $set: { reported: true } });
  }

  async removeByAdmin(id: string | ObjectId): Promise<boolean> {
    const oid = id instanceof ObjectId ? id : new ObjectId(id);
    const result = await this.collection.updateOne(
      { _id: oid },
      { $set: { removedByAdmin: true } },
    );
    return result.modifiedCount > 0;
  }

  async existsByChecksumAndAuthor(colorChecksum: string, authorIdentityId: ObjectId): Promise<boolean> {
    const doc = await this.collection.findOne(
      { colorChecksum, authorIdentityId, removedByAdmin: { $ne: true } },
      { projection: { _id: 1 } },
    );
    return doc !== null;
  }

  /**
   * Colour checksums for all community themes still published by this author.
   * Used by the client to hide "Share" for custom themes that are already shared.
   */
  async listColorChecksumsByAuthor(authorIdentityId: ObjectId): Promise<string[]> {
    const docs = await this.collection
      .find({ authorIdentityId, removedByAdmin: { $ne: true } }, { projection: { colorChecksum: 1 } })
      .toArray();
    return docs.map((d) => d.colorChecksum);
  }

  async countByAuthor(authorIdentityId: ObjectId): Promise<number> {
    return this.collection.countDocuments({ authorIdentityId, removedByAdmin: { $ne: true } });
  }
}

let instance: CommunityThemeRepository | null = null;

export function getCommunityThemeRepository(): CommunityThemeRepository {
  if (!instance) instance = new CommunityThemeRepository();
  return instance;
}
