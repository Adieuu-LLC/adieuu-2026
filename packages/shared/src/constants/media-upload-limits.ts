import type { SubscriptionTierId } from '../subscriptions';

/**
 * Baseline attachment caps mirrored by `apps/api` upload validation (`UPLOAD_PURPOSE_CONFIG`).
 */

export const DM_ATTACHMENT_BASE_MAX_BYTES = 50 * 1024 * 1024;
export const CONV_MEDIA_BASE_MAX_BYTES = 1_337_000_000;

/** Insider scalable ceiling (conversation media & DM attachments, decimal GB). */
export const INSIDER_DM_CONV_MAX_BYTES = 4_200_000_000;

/** Lifetime Founder: `founder` entitlement with lifetime billing (decimal GB). */
export const FOUNDER_LIFETIME_DM_CONV_MAX_BYTES = 9_001_000_000;

export type ScalableDmOrConvPurpose = 'dm_attachment' | 'conv_media';

/**
 * Effective max upload size for purposes that tier with Insider / Lifetime Founder grants.
 *
 * Ordering: Lifetime Founder entitlement beats Insider tier beats base caps.
 */
export function resolveScalableDmOrConvMaxUploadBytes(
  purpose: ScalableDmOrConvPurpose,
  subscriptions: readonly SubscriptionTierId[],
  opts: { entitlements: readonly string[]; isLifetime: boolean },
): number {
  const base = purpose === 'conv_media' ? CONV_MEDIA_BASE_MAX_BYTES : DM_ATTACHMENT_BASE_MAX_BYTES;
  if (opts.isLifetime && opts.entitlements.includes('founder')) {
    return FOUNDER_LIFETIME_DM_CONV_MAX_BYTES;
  }
  if (subscriptions.includes('insider')) {
    return INSIDER_DM_CONV_MAX_BYTES;
  }
  return base;
}
