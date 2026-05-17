/**
 * Resolves effective subscriptions and entitlements by merging Stripe-managed
 * billing with admin-granted overrides.
 *
 * Overrides live outside `UserBilling` so Stripe sync never clobbers them.
 * Subscription overrides support an optional expiry; entitlement overrides
 * are always lifetime (e.g. `vanguard`, `founder`, `gifted`).
 *
 * PRIVACY: Account-level helpers accept `UserDocument`. Identity-level
 * helpers accept `IdentityDocument`. These types are never interchanged.
 *
 * @module services/billing/resolve-access
 */

import type { SubscriptionTierId } from '@adieuu/shared';
import type { UserDocument, SubscriptionOverride } from '../../models/user';
import type { IdentityDocument } from '../../models/identity';
import type { IdentityContext } from '../../middleware/identity-session';

// ---------------------------------------------------------------------------
// Resolved access type
// ---------------------------------------------------------------------------

export interface ResolvedAccess {
  subscriptions: SubscriptionTierId[];
  entitlements: string[];
  isLifetime: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function filterActiveSubscriptionOverrides(
  overrides: SubscriptionOverride[] | undefined,
): SubscriptionTierId[] {
  if (!overrides?.length) return [];
  const now = new Date();
  return overrides
    .filter((o) => !o.expiresAt || o.expiresAt > now)
    .map((o) => o.tier);
}

function hasLifetimeOverride(
  overrides: SubscriptionOverride[] | undefined,
  entitlementOverrides: string[] | undefined,
): boolean {
  if (entitlementOverrides?.length) return true;
  if (!overrides?.length) return false;
  return overrides.some((o) => !o.expiresAt);
}

/**
 * Whether the identity document carries admin overrides that signal lifetime
 * access: any subscription override without an `expiresAt`, or any
 * entitlement override (entitlement overrides are always lifetime).
 *
 * Used at both grant-construction time ({@link buildBillingFromMetadata}) and
 * at middleware merge time ({@link enrichIdentitySession}) to ensure the
 * `isLifetime` flag stays consistent when overrides are added after the
 * session was originally created.
 */
export function hasLifetimeIdentityOverrides(identity: IdentityDocument): boolean {
  return hasLifetimeOverride(identity.subscriptionOverrides, identity.entitlementOverrides);
}

// ---------------------------------------------------------------------------
// Account-level resolution
// ---------------------------------------------------------------------------

/**
 * Merges Stripe billing with account-level admin overrides to produce the
 * effective subscriptions, entitlements, and lifetime flag.
 */
export function resolveEffectiveAccess(user: UserDocument): ResolvedAccess {
  const billingTiers = user.billing?.activeSubscriptions ?? [];
  const billingEntitlements = user.billing?.entitlements ?? [];
  const overrideTiers = filterActiveSubscriptionOverrides(user.subscriptionOverrides);
  const overrideEntitlements = user.entitlementOverrides ?? [];

  const subscriptions = [...new Set<SubscriptionTierId>([...billingTiers, ...overrideTiers])];
  const entitlements = [...new Set<string>([...billingEntitlements, ...overrideEntitlements])];

  const isLifetime =
    (user.billing?.isLifetime ?? false) ||
    hasLifetimeOverride(user.subscriptionOverrides, user.entitlementOverrides);

  return { subscriptions, entitlements, isLifetime };
}

// ---------------------------------------------------------------------------
// Identity-level resolution
// ---------------------------------------------------------------------------

/**
 * Returns the identity's own override additions (already filtered for expiry).
 * These are merged into the session-derived arrays at the middleware layer.
 */
export function resolveIdentityOverrides(
  identity: IdentityDocument,
): { subscriptions: SubscriptionTierId[]; entitlements: string[] } {
  return {
    subscriptions: filterActiveSubscriptionOverrides(identity.subscriptionOverrides),
    entitlements: identity.entitlementOverrides ?? [],
  };
}

// ---------------------------------------------------------------------------
// Subscription tier hierarchy
// ---------------------------------------------------------------------------

/**
 * Subscription tiers ordered from lowest to highest privilege. A user holding
 * a higher-ranked tier implicitly satisfies checks for any lower-ranked tier
 * (inherited mode). Add new tiers in ascending order of privilege.
 */
const TIER_HIERARCHY: readonly SubscriptionTierId[] = ['access', 'insider'];

const TIER_RANK = new Map<SubscriptionTierId, number>(
  TIER_HIERARCHY.map((t, i) => [t, i]),
);

function highestTierRank(subscriptions: readonly SubscriptionTierId[]): number {
  let max = -1;
  for (const t of subscriptions) {
    const rank = TIER_RANK.get(t);
    if (rank !== undefined && rank > max) max = rank;
  }
  return max;
}

// ---------------------------------------------------------------------------
// Identity-level access-check helpers (hierarchy-aware)
// ---------------------------------------------------------------------------

export interface RequiresTierOptions {
  /**
   * When `true`, the check only passes if the exact tier is present in the
   * user's subscriptions (useful for badge display, tier-specific UI).
   * When `false` (the default), a higher-ranked tier satisfies the check.
   */
  exact?: boolean;
}

/**
 * Whether the identity context satisfies a subscription tier requirement.
 *
 * **Inherited mode (default):** `insider` satisfies an `access` check because
 * `insider` outranks `access` in {@link TIER_HIERARCHY}.
 *
 * **Exact mode:** only passes when the precise tier is present (e.g. for
 * displaying tier-specific badges).
 */
export function requiresTier(
  ctx: IdentityContext,
  tier: SubscriptionTierId,
  opts?: RequiresTierOptions,
): boolean {
  if (opts?.exact) {
    return ctx.subscriptions.includes(tier);
  }
  const requiredRank = TIER_RANK.get(tier);
  if (requiredRank === undefined) return false;
  return highestTierRank(ctx.subscriptions) >= requiredRank;
}

/**
 * Whether the identity context includes a specific entitlement.
 *
 * Entitlements are parallel feature flags (e.g. `vanguard`, `founder`) with
 * no hierarchy — each must be checked independently.
 */
export function requiresEntitlement(
  ctx: IdentityContext,
  entitlement: string,
): boolean {
  return ctx.entitlements.includes(entitlement);
}
