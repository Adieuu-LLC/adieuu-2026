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
