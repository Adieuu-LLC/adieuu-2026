#!/usr/bin/env bun
/**
 * Creates MFA discount coupons in Stripe (idempotent).
 *
 * Run from repo root:
 *   bun run apps/api/scripts/seed-mfa-discount-coupons.ts
 *
 * After running, copy the coupon IDs printed to your .env:
 *   STRIPE_COUPON_MFA_BASIC=<id>
 *   STRIPE_COUPON_MFA_HARDWARE_KEY=<id>
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY env var is required');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const COUPONS = [
  {
    id: 'mfa_enabled',
    name: 'MFA Enabled Discount (2%)',
    percent_off: 2,
    duration: 'forever' as const,
    metadata: { managed_by: 'mfa_discount_system', tier: 'basic' },
  },
  {
    id: 'mfa_hardware_key',
    name: 'Hardware Key MFA Discount (5%)',
    percent_off: 5,
    duration: 'forever' as const,
    metadata: { managed_by: 'mfa_discount_system', tier: 'hardware_key' },
  },
];

async function main() {
  console.log(`Using Stripe key: ${STRIPE_SECRET_KEY!.slice(0, 8)}****${STRIPE_SECRET_KEY!.slice(-4)}`);
  console.log('');

  for (const couponDef of COUPONS) {
    try {
      const existing = await stripe.coupons.retrieve(couponDef.id);

      const drifts: string[] = [];
      if (existing.percent_off !== couponDef.percent_off) {
        drifts.push(`percent_off: expected ${couponDef.percent_off}, got ${existing.percent_off}`);
      }
      if (existing.duration !== couponDef.duration) {
        drifts.push(`duration: expected ${couponDef.duration}, got ${existing.duration}`);
      }
      for (const [key, expected] of Object.entries(couponDef.metadata)) {
        const actual = existing.metadata?.[key];
        if (actual !== expected) {
          drifts.push(`metadata.${key}: expected "${expected}", got "${actual}"`);
        }
      }

      if (drifts.length > 0) {
        console.error(`  ✗ Coupon "${couponDef.id}" has drifted from expected definition:`);
        for (const d of drifts) console.error(`      - ${d}`);
        process.exit(1);
      }

      console.log(`  ✓ Coupon "${couponDef.id}" already exists and matches (${existing.percent_off}% off, ${existing.duration})`);
    } catch (err: unknown) {
      if (err instanceof Stripe.errors.StripeError && err.statusCode === 404) {
        const created = await stripe.coupons.create(couponDef);
        console.log(`  + Created coupon "${created.id}" — ${created.percent_off}% off, duration: ${created.duration}`);
      } else {
        throw err;
      }
    }
  }

  console.log('\nDone. Add these to your .env:');
  console.log(`  STRIPE_COUPON_MFA_BASIC=mfa_enabled`);
  console.log(`  STRIPE_COUPON_MFA_HARDWARE_KEY=mfa_hardware_key`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
