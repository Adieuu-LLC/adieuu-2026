#!/usr/bin/env bun
/**
 * One-off fix: update the friends-family promo code to grant lifetime Insider
 * instead of timed Access.
 *
 * Run from repo root:
 *   bun run apps/api/scripts/fix-friends-family-promo.ts
 */

import { connectMongo, disconnectMongo } from '../src/db/mongo';
import { getPromoCodeRepository } from '../src/repositories/promo-code.repository';

async function main() {
  console.log('Connecting to MongoDB...');
  await connectMongo();

  const repo = getPromoCodeRepository();
  const code = await repo.findByShortcode('friends-family');
  if (!code) {
    console.error('Promo code "friends-family" not found.');
    await disconnectMongo();
    process.exit(1);
  }

  console.log('Current config:', JSON.stringify(code.subscription));

  const updated = await repo.updateByShortcode('friends-family', {
    subscription: { tier: 'insider', durationMonths: null },
    entitlements: ['founder'],
  });

  if (!updated) {
    console.error('Failed to update promo code.');
    await disconnectMongo();
    process.exit(1);
  }

  console.log('Updated config:', JSON.stringify(updated.subscription));
  console.log('Entitlements:', updated.entitlements);
  console.log('\nDone. friends-family now grants lifetime Insider + founder entitlement.');
  await disconnectMongo();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
