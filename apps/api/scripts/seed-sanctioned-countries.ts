#!/usr/bin/env bun
/**
 * Upserts OFAC sanctioned countries into MongoDB.
 *
 * Run from repo root:
 *   bun run apps/api/scripts/seed-sanctioned-countries.ts
 */

import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { getSanctionedCountryRepository } from '../src/repositories/sanctioned-country.repository';
import { SANCTIONED_COUNTRY_SEED } from '../src/data/sanctioned-countries.seed';

async function main() {
  console.log('Connecting to MongoDB...');
  await connectMongo();
  const repo = getSanctionedCountryRepository();
  let n = 0;
  for (const row of SANCTIONED_COUNTRY_SEED) {
    await repo.upsertSeedRow(row);
    n += 1;
    console.log(`  Upserted ${row.countryCode} — ${row.countryName}`);
  }
  console.log(`\nDone. ${n} sanctioned country rows upserted.`);
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
