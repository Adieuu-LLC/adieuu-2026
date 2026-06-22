/**
 * Jurisdiction regulatory requirements (seeded reference data).
 */

import type { Filter, UpdateFilter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db/mongo';
import type { JurisdictionRequirementDocument } from '../models/jurisdiction-requirement';

/** @internal test helper and shared upsert builder for seed/admin operations. */
export function buildJurisdictionSeedUpsertUpdate(
  row: Omit<JurisdictionRequirementDocument, '_id' | 'createdAt' | 'updatedAt'>,
  now: Date,
  opts?: { preserveVerificationConfig?: boolean },
): UpdateFilter<JurisdictionRequirementDocument> {
  const jurisdiction = row.jurisdiction.trim().toUpperCase();
  const preserveVerificationConfig = opts?.preserveVerificationConfig !== false;
  const { verificationConfig, ...rest } = row;
  const $set: Record<string, unknown> = {
    ...rest,
    jurisdiction,
    updatedAt: now,
  };
  const update: UpdateFilter<JurisdictionRequirementDocument> = {
    $set: $set as never,
    $setOnInsert: { createdAt: now },
  };
  if (verificationConfig !== undefined) {
    $set.verificationConfig = verificationConfig;
  } else if (!preserveVerificationConfig) {
    update.$unset = { verificationConfig: '' };
  }
  return update;
}

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
   * Idempotent seed upsert (used by maintainer script and admin seed).
   * When `preserveVerificationConfig` is true and the seed row omits
   * `verificationConfig`, existing admin-configured IDs are left unchanged.
   */
  async upsertSeedRow(
    row: Omit<JurisdictionRequirementDocument, '_id' | 'createdAt' | 'updatedAt'>,
    opts?: { preserveVerificationConfig?: boolean },
  ): Promise<void> {
    const now = new Date();
    const jurisdiction = row.jurisdiction.trim().toUpperCase();
    const filter = { jurisdiction } as Filter<JurisdictionRequirementDocument>;
    const update = buildJurisdictionSeedUpsertUpdate(row, now, opts);
    await this.collection.updateOne(filter, update, { upsert: true });
  }

  async patchVerificationConfig(
    jurisdiction: string,
    vmyBusinessSettingsId: string | undefined,
  ): Promise<JurisdictionRequirementDocument | null> {
    const code = jurisdiction.trim().toUpperCase();
    const existing = await this.findByJurisdiction(code);
    if (!existing) return null;

    const now = new Date();
    if (vmyBusinessSettingsId) {
      await this.collection.updateOne(
        { jurisdiction: code } as Filter<JurisdictionRequirementDocument>,
        {
          $set: {
            verificationConfig: { vmyBusinessSettingsId },
            updatedAt: now,
          },
          $unset: { vmyBusinessSettingsId: '' },
        },
      );
    } else {
      await this.collection.updateOne(
        { jurisdiction: code } as Filter<JurisdictionRequirementDocument>,
        {
          $unset: { verificationConfig: '', vmyBusinessSettingsId: '' },
          $set: { updatedAt: now },
        },
      );
    }

    return this.findByJurisdiction(code);
  }
}

let repo: JurisdictionRequirementRepository | null = null;

export function getJurisdictionRequirementRepository(): JurisdictionRequirementRepository {
  if (!repo) {
    repo = new JurisdictionRequirementRepository();
  }
  return repo;
}
