/**
 * Platform settings repository — one document per setting key.
 */

import type { Filter, UpdateFilter } from 'mongodb';
import { getCollection } from '../db';
import { Collections } from '../db/mongo';
import type {
  PlatformSettingsDocument,
  PlatformSettingValue,
  PlatformSettingValueType,
} from '../models/platform-settings';

export interface UpsertPlatformSettingInput {
  key: string;
  description: string;
  valueType: PlatformSettingValueType;
  value: PlatformSettingValue;
  lastUpdatedBy: string;
}

export class PlatformSettingsRepository {
  private collection = getCollection<PlatformSettingsDocument>(Collections.PLATFORM_SETTINGS);

  async findByKey(key: string): Promise<PlatformSettingsDocument | null> {
    return (await this.collection.findOne({ key } as Filter<PlatformSettingsDocument>)) as PlatformSettingsDocument | null;
  }

  async findAll(limit = 200): Promise<PlatformSettingsDocument[]> {
    return (await this.collection.find({}).limit(limit).toArray()) as PlatformSettingsDocument[];
  }

  async upsertByKey(input: UpsertPlatformSettingInput): Promise<PlatformSettingsDocument> {
    const now = new Date();
    const filter = { key: input.key } as Filter<PlatformSettingsDocument>;
    const update: UpdateFilter<PlatformSettingsDocument> = {
      $set: {
        key: input.key,
        description: input.description,
        valueType: input.valueType,
        value: input.value,
        lastUpdatedBy: input.lastUpdatedBy,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    };

    const result = await this.collection.findOneAndUpdate(filter, update, {
      upsert: true,
      returnDocument: 'after',
    });

    if (!result) {
      throw new Error('Platform setting upsert returned no document');
    }

    return result as PlatformSettingsDocument;
  }
}

let repo: PlatformSettingsRepository | null = null;

export function getPlatformSettingsRepository(): PlatformSettingsRepository {
  if (!repo) {
    repo = new PlatformSettingsRepository();
  }
  return repo;
}
