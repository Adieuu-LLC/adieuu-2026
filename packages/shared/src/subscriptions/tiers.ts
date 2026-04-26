/**
 * Subscription tier identifiers shared between API and UI.
 *
 * Display copy (name, description, feature bullets) lives in the i18n bundle
 * so that renaming a tier is a single-file change. Only type-level identifiers
 * belong here.
 */

export const SUBSCRIPTION_TIER_IDS = ['vanguard'] as const;

export type SubscriptionTierId = (typeof SUBSCRIPTION_TIER_IDS)[number];
