/**
 * Space preferences repository
 * Data access layer for per-identity Space preferences (favorites).
 *
 * Each record is keyed by (identityId, spaceId) with a unique compound index.
 */

import { ObjectId } from 'mongodb';
import { getCollection, Collections } from '../db';
import type { SpacePreferencesDocument } from '../models/space-preferences';

export interface SpacePreferencesPatch {
  favorited?: boolean;
}

export class SpacePreferencesRepository {
  private get collection() {
    return getCollection<SpacePreferencesDocument>(Collections.SPACE_PREFERENCES);
  }

  async findForIdentity(identityId: ObjectId): Promise<SpacePreferencesDocument[]> {
    return this.collection.find({ identityId }).toArray() as Promise<SpacePreferencesDocument[]>;
  }

  async findOne(
    identityId: ObjectId,
    spaceId: ObjectId,
  ): Promise<SpacePreferencesDocument | null> {
    return this.collection.findOne({
      identityId,
      spaceId,
    }) as Promise<SpacePreferencesDocument | null>;
  }

  async upsert(
    identityId: ObjectId,
    spaceId: ObjectId,
    patch: SpacePreferencesPatch,
  ): Promise<SpacePreferencesDocument> {
    const now = new Date();

    const $set: Record<string, unknown> = { updatedAt: now };
    if (patch.favorited !== undefined) $set.favorited = patch.favorited;

    const result = await this.collection.findOneAndUpdate(
      { identityId, spaceId },
      {
        $set,
        $setOnInsert: {
          identityId,
          spaceId,
          createdAt: now,
          ...(patch.favorited === undefined ? { favorited: false } : {}),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result as SpacePreferencesDocument;
  }

  async deleteForSpace(identityId: ObjectId, spaceId: ObjectId): Promise<boolean> {
    const result = await this.collection.deleteOne({
      identityId,
      spaceId,
    });
    return result.deletedCount > 0;
  }
}

let instance: SpacePreferencesRepository | null = null;

export function getSpacePreferencesRepository(): SpacePreferencesRepository {
  if (!instance) instance = new SpacePreferencesRepository();
  return instance;
}
