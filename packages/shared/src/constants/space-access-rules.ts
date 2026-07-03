/**
 * Free-tier Space access rules (future implementation reference).
 *
 * These rules define how the free tier interacts with Spaces once they
 * are implemented. Enforcement is deferred until Spaces ship.
 *
 * Rules:
 * - Free users CANNOT join public or semi-public spaces.
 * - Free users CAN join private spaces only via explicit invite
 *   (direct invite or invite link, if the Space admin allows free
 *   users on invite links).
 * - Space admins can toggle whether invite links admit free-tier users
 *   (default: false).
 * - Free users can be removed from spaces at admin discretion.
 */

import type { SubscriptionTierId } from '../subscriptions';

export interface SpaceAccessRule {
  /** Minimum tier required to join via this method. */
  minTier: SubscriptionTierId;
}

export const SPACE_ACCESS_RULES = {
  joinPublic: { minTier: 'access' as const },
  joinSemiPublic: { minTier: 'access' as const },
  joinPrivateViaInvite: { minTier: 'free' as const },
} as const satisfies Record<string, SpaceAccessRule>;
