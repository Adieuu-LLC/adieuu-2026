/**
 * Space repository
 * Data access for Spaces (Discord-like servers). Membership, channels, and
 * roles live in their own collections; this repository handles the Space
 * document itself plus slug lookup and directory discovery.
 */

import { type Filter, ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import { withTimestamps } from '../models/base';
import type { SpaceDocument, CreateSpaceInput } from '../models/space';

export interface DiscoverSpacesOptions {
  q?: string;
  limit?: number;
  cursor?: ObjectId;
}

export class SpaceRepository extends BaseRepository<SpaceDocument> {
  constructor() {
    super(Collections.SPACES);
  }

  /**
   * Create a Space. Supports a client-generated `_id` so the cipher challenge
   * can bind the final Space id atomically.
   */
  async createSpace(input: CreateSpaceInput): Promise<SpaceDocument> {
    const { _id, ...rest } = input;
    const doc = withTimestamps(rest) as SpaceDocument;
    if (_id) {
      doc._id = _id;
    }
    const result = await this.collection.insertOne(
      doc as OptionalUnlessRequiredId<SpaceDocument>
    );
    return { ...doc, _id: result.insertedId } as SpaceDocument;
  }

  async findBySlug(slug: string): Promise<SpaceDocument | null> {
    return await this.findOne({ slug } as Filter<SpaceDocument>);
  }

  async findByIds(ids: ObjectId[]): Promise<SpaceDocument[]> {
    if (ids.length === 0) return [];
    return (await this.collection
      .find({ _id: { $in: ids } } as Filter<SpaceDocument>)
      .toArray()) as SpaceDocument[];
  }

  /**
   * Discover public/listed Spaces for the directory. Hidden Spaces are never
   * returned. Optional case-insensitive match on plaintext name/description
   * or slug. Identity-encrypted Spaces are only matched by slug.
   */
  async discover(options: DiscoverSpacesOptions = {}): Promise<SpaceDocument[]> {
    const { q, limit = 30, cursor } = options;
    const filter: Record<string, unknown> = {
      visibility: { $in: ['public', 'listed'] },
    };
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(escaped, 'i');
      filter.$or = [
        { encryptIdentity: { $ne: true }, name: rx },
        { encryptIdentity: { $ne: true }, description: rx },
        { slug: rx },
      ];
    }
    if (cursor) {
      filter._id = { $lt: cursor };
    }
    return (await this.collection
      .find(filter as Filter<SpaceDocument>)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray()) as SpaceDocument[];
  }

  async incrementMemberCount(spaceId: ObjectId, delta = 1): Promise<void> {
    const filter: Filter<SpaceDocument> =
      delta < 0
        ? ({ _id: spaceId, memberCount: { $gte: Math.abs(delta) } } as Filter<SpaceDocument>)
        : ({ _id: spaceId } as Filter<SpaceDocument>);
    const result = await this.collection.updateOne(filter, {
      $inc: { memberCount: delta },
      $set: { updatedAt: new Date() },
    });
    if (delta < 0 && result.matchedCount === 0) {
      throw new Error('Space memberCount cannot be decremented below zero');
    }
  }
}

let spaceRepository: SpaceRepository | null = null;

export function getSpaceRepository(): SpaceRepository {
  if (!spaceRepository) {
    spaceRepository = new SpaceRepository();
  }
  return spaceRepository;
}
