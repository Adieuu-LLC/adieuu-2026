/**
 * Space join access rules (tier gating).
 *
 * Defaults (matching the original free-tier policy):
 * - Open-joining a `public` or `listed` Space requires a paid tier (`access`+).
 * - `hidden` Spaces cannot be open-joined at all — invite only.
 * - Joining any Space via an accepted invite requires only the `free` tier.
 *
 * Per-Space override:
 * - A Space admin may set `allowFreeMembers` to let free-tier identities
 *   open-join (and post in) `public`/`listed` Spaces. Default is `false`.
 *
 * Space *creation* is gated separately (paid-only) at the API layer and is not
 * covered here.
 */

import type { SubscriptionTierId } from '../subscriptions';
import { SUBSCRIPTION_TIER_IDS } from '../subscriptions';
import type { SpaceVisibility } from '../api/spaces-types';

export interface SpaceAccessRule {
  /** Minimum tier required to join via this method. */
  minTier: SubscriptionTierId;
}

/** Default minimum tier to open-join a discoverable (`public`/`listed`) Space. */
export const SPACE_OPEN_JOIN_MIN_TIER: SubscriptionTierId = 'access';

/** Minimum tier to join any Space via an accepted invite. */
export const SPACE_INVITE_JOIN_MIN_TIER: SubscriptionTierId = 'free';

export const SPACE_ACCESS_RULES = {
  joinPublic: { minTier: SPACE_OPEN_JOIN_MIN_TIER },
  joinListed: { minTier: SPACE_OPEN_JOIN_MIN_TIER },
  joinViaInvite: { minTier: SPACE_INVITE_JOIN_MIN_TIER },
} as const satisfies Record<string, SpaceAccessRule>;

/** Returns true when `tier` is at least `minimum` in the tier hierarchy. */
export function tierMeetsMinimum(
  tier: SubscriptionTierId,
  minimum: SubscriptionTierId
): boolean {
  return SUBSCRIPTION_TIER_IDS.indexOf(tier) >= SUBSCRIPTION_TIER_IDS.indexOf(minimum);
}

export interface SpaceJoinContext {
  visibility: SpaceVisibility;
  /** Whether the Space allows free-tier members (admin toggle). */
  allowFreeMembers: boolean;
  /** True when the join is authorized by an accepted invite. */
  viaInvite: boolean;
  /** Highest effective tier of the joining identity. */
  tier: SubscriptionTierId;
}

export type SpaceJoinDenyReason = 'invite_required' | 'tier_required';

export type SpaceJoinDecision =
  | { allowed: true }
  | { allowed: false; reason: SpaceJoinDenyReason; minTier?: SubscriptionTierId };

/**
 * Evaluates whether an identity may join a Space. Pure function usable by both
 * the API (enforcement) and the client (pre-flight UX).
 */
export function evaluateSpaceJoin(ctx: SpaceJoinContext): SpaceJoinDecision {
  if (ctx.viaInvite) {
    if (tierMeetsMinimum(ctx.tier, SPACE_INVITE_JOIN_MIN_TIER)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'tier_required', minTier: SPACE_INVITE_JOIN_MIN_TIER };
  }

  // Open (non-invite) join.
  if (ctx.visibility === 'hidden') {
    return { allowed: false, reason: 'invite_required' };
  }

  if (ctx.allowFreeMembers) {
    return { allowed: true };
  }

  if (tierMeetsMinimum(ctx.tier, SPACE_OPEN_JOIN_MIN_TIER)) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'tier_required', minTier: SPACE_OPEN_JOIN_MIN_TIER };
}
