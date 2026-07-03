/**
 * Subscription and product identifiers shared between API and UI.
 *
 * **SubscriptionTierId** — the effective access levels used for feature gating.
 * **PurchasableProductId** — every buyable line item in the Stripe catalogue.
 *
 * Display copy (name, description, feature bullets) lives in the i18n bundle
 * so that renaming a product is a single-file change. Only type-level
 * identifiers belong here.
 */

/** Access levels granted to a user (hierarchical: insider includes access includes free). */
export const SUBSCRIPTION_TIER_IDS = ['free', 'access', 'insider'] as const;
export type SubscriptionTierId = (typeof SUBSCRIPTION_TIER_IDS)[number];

/** Everything a user can buy (recurring subscriptions + one-time lifetime purchases). */
export const PURCHASABLE_PRODUCT_IDS = ['free', 'access', 'insider', 'vanguard', 'founder'] as const;
export type PurchasableProductId = (typeof PURCHASABLE_PRODUCT_IDS)[number];
