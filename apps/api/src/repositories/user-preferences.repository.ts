/**
 * User Preferences repository.
 * Data access layer for user theme/appearance preferences.
 *
 * @module repositories/user-preferences
 */

import { ObjectId } from 'mongodb';
import { getCollection, Collections } from '../db';
import { withTimestamps, withUpdatedAt } from '../models/base';
import type {
  UserPreferencesDocument,
  CreateUserPreferencesInput,
  UpdateUserPreferencesInput,
} from '../models/user-preferences';

export class UserPreferencesRepository {
  private get collection() {
    return getCollection<UserPreferencesDocument>(Collections.USER_PREFERENCES);
  }

  async findByUserId(userId: string | ObjectId): Promise<UserPreferencesDocument | null> {
    const oid = userId instanceof ObjectId ? userId : new ObjectId(userId);
    return this.collection.findOne({ userId: oid });
  }

  async upsert(userId: string | ObjectId, update: UpdateUserPreferencesInput): Promise<UserPreferencesDocument> {
    const oid = userId instanceof ObjectId ? userId : new ObjectId(userId);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { userId: oid },
      {
        $set: { ...update, updatedAt: now },
        $setOnInsert: { userId: oid, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return result!;
  }
}

let instance: UserPreferencesRepository | null = null;

export function getUserPreferencesRepository(): UserPreferencesRepository {
  if (!instance) instance = new UserPreferencesRepository();
  return instance;
}
