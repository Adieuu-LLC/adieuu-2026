/**
 * Per-tier limits for identity (alias) creation.
 *
 * Lifetime users and users with Vanguard/Founder entitlements receive
 * the highest allowance regardless of which subscription tier they hold.
 *
 * Individual accounts may override these via `user.maxIdentities`
 * (always takes precedence when higher than the tier-resolved value).
 */

export const IDENTITY_LIMITS = {
  access: 1,
  insider: 2,
  lifetime: 3,
} as const;
