/**
 * Jurisdiction regulatory requirements (seeded reference data).
 */

import type { Filter, UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type { JurisdictionRequirementDocument } from '../models/jurisdiction-requirement';

export class JurisdictionRequirementRepository extends BaseRepository<JurisdictionRequirementDocument> {
  constructor() {
    super(Collections.JURISDICTION_REQUIREMENTS);
  }

  async findByJurisdiction(
    jurisdiction: string,
  ): Promise<JurisdictionRequirementDocument | null> {
    const code = jurisdiction.trim().toUpperCase();
    return this.findOne({ jurisdiction: code } as Filter<JurisdictionRequirementDocument>);
  }

  /**
   * Returns all documents whose `jurisdiction` is in the list (uppercased, deduped).
   */
  async findByJurisdictions(
    jurisdictions: string[],
  ): Promise<JurisdictionRequirementDocument[]> {
    const codes = [...new Set(jurisdictions.map((j) => j.trim().toUpperCase()).filter(Boolean))];
    if (codes.length === 0) return [];
    return this.findMany(
      { jurisdiction: { $in: codes } } as Filter<JurisdictionRequirementDocument>,
      200,
    );
  }

  /**
   * Returns seeded rows whose requirements include any age-verification slug.
   */
  async findRequiringAgeVerification(
    requirementSlugs: readonly string[],
    limit = 200,
  ): Promise<JurisdictionRequirementDocument[]> {
    if (requirementSlugs.length === 0) return [];
    const docs = await this.findMany(
      { requirements: { $in: [...requirementSlugs] } } as Filter<JurisdictionRequirementDocument>,
      limit,
    );
    return docs.sort((a, b) => {
      const regionCompare = a.region.localeCompare(b.region);
      if (regionCompare !== 0) return regionCompare;
      return a.jurisdictionName.localeCompare(b.jurisdictionName);
    });
  }

  /**
   * Idempotent seed upsert (used by maintainer script only).
   */
  async upsertSeedRow(
    row: Omit<JurisdictionRequirementDocument, '_id' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const now = new Date();
    const jurisdiction = row.jurisdiction.trim().toUpperCase();
    const filter = { jurisdiction } as Filter<JurisdictionRequirementDocument>;
    const $set = {
      ...row,
      jurisdiction,
      updatedAt: now,
    };
    const update: UpdateFilter<JurisdictionRequirementDocument> = {
      $set: $set as never,
      $setOnInsert: { createdAt: now },
    };
    await this.collection.updateOne(filter, update, { upsert: true });
  }
}

let repo: JurisdictionRequirementRepository | null = null;

export function getJurisdictionRequirementRepository(): JurisdictionRequirementRepository {
  if (!repo) {
    repo = new JurisdictionRequirementRepository();
  }
  return repo;
}
