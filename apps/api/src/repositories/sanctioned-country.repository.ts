/**
 * OFAC / export-control sanctioned countries (seeded reference data).
 */

import type { Filter, UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type { SanctionedCountryDocument } from '../models/sanctioned-country';

export class SanctionedCountryRepository extends BaseRepository<SanctionedCountryDocument> {
  constructor() {
    super(Collections.SANCTIONED_COUNTRIES);
  }

  async findActiveByCountryCode(
    countryCode: string,
  ): Promise<SanctionedCountryDocument | null> {
    const code = countryCode.trim().toUpperCase();
    return this.findOne({
      countryCode: code,
      active: true,
    } as Filter<SanctionedCountryDocument>);
  }

  async findAllActive(limit = 100): Promise<SanctionedCountryDocument[]> {
    const docs = await this.findMany({ active: true } as Filter<SanctionedCountryDocument>, limit);
    return docs.sort((a, b) => a.countryName.localeCompare(b.countryName));
  }

  async findAll(limit = 200): Promise<SanctionedCountryDocument[]> {
    const docs = await this.findMany({}, limit);
    return docs.sort((a, b) => {
      const activeCompare = Number(b.active) - Number(a.active);
      if (activeCompare !== 0) return activeCompare;
      return a.countryName.localeCompare(b.countryName);
    });
  }

  /**
   * Sets `active: false` on rows whose countryCode is not in the keep set.
   * Returns the number of rows deactivated.
   */
  async deactivateNotIn(keepCountryCodes: readonly string[]): Promise<number> {
    const keep = new Set(keepCountryCodes.map((c) => c.trim().toUpperCase()).filter(Boolean));
    const docs = await this.findAll();
    let deactivated = 0;
    for (const doc of docs) {
      if (!doc.active || keep.has(doc.countryCode)) continue;
      await this.collection.updateOne(
        { _id: doc._id } as Filter<SanctionedCountryDocument>,
        { $set: { active: false, updatedAt: new Date() } },
      );
      deactivated += 1;
    }
    return deactivated;
  }

  async upsertSeedRow(
    row: Omit<SanctionedCountryDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const now = new Date();
    const countryCode = row.countryCode.trim().toUpperCase();
    const filter = { countryCode } as Filter<SanctionedCountryDocument>;
    const $set = {
      ...row,
      countryCode,
      updatedAt: now,
    };
    const update: UpdateFilter<SanctionedCountryDocument> = {
      $set: $set as never,
      $setOnInsert: { createdAt: now },
    };
    await this.collection.updateOne(filter, update, { upsert: true });
  }
}

let repo: SanctionedCountryRepository | null = null;

export function getSanctionedCountryRepository(): SanctionedCountryRepository {
  if (!repo) {
    repo = new SanctionedCountryRepository();
  }
  return repo;
}
