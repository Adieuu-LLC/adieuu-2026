#!/usr/bin/env bun
/**
 * Upserts the jurisdiction regulatory matrix into MongoDB.
 *
 * Run from repo root:
 *   bun run apps/api/scripts/seed-jurisdiction-requirements.ts
 *
 * Or from apps/api:
 *   bun run scripts/seed-jurisdiction-requirements.ts
 *
 * Requires MONGODB_URI (and optional MONGODB_DB_NAME) in the environment.
 */

import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { getJurisdictionRequirementRepository } from '../src/repositories/jurisdiction-requirement.repository';
import { JURISDICTION_REQUIREMENT_SEED } from './data/jurisdiction-requirements.seed';

async function main() {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  const repo = getJurisdictionRequirementRepository();
  let n = 0;
  for (const row of JURISDICTION_REQUIREMENT_SEED) {
    await repo.upsertSeedRow(row);
    n += 1;
    console.log(`  Upserted ${row.jurisdiction} — ${row.jurisdictionName}`);
  }
  console.log(`\nDone. ${n} jurisdiction rows upserted.`);
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
