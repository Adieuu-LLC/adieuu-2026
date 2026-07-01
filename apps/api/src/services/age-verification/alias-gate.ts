/**
 * Alias gate -- account-level enforcement for age verification and geofencing.
 *
 * Evaluated before identity create and identity login. There is no admin
 * bypass: the account-identity separation is by design and we cannot know
 * at the account level whether any of the account's aliases are platform admins.
 */

import type { UserDocument } from '../../models/user';
import { isAgeVerificationEnabled, getBlockedJurisdictions, getLawLinkForJurisdiction, getRequiredMode } from './av-settings';
import { requiresAgeVerification, getAgeVerificationPolicy, getDefaultAgeVerificationPolicy, type JurisdictionAgePolicy } from './jurisdiction-policy';

const FAILED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days
const EXPIRED_COOLDOWN_MS = 24 * 60 * 60 * 1000;            // 24 hours
const MAX_EXPIRATIONS_BEFORE_LONG_COOLDOWN = 3;

export type AliasGateResult =
  | { allowed: true }
  | { allowed: false; code: 'GEOFENCE_BLOCKED'; jurisdiction: string; lawUrl?: string }
  | {
      allowed: false;
      code: 'AGE_VERIFICATION_REQUIRED';
      jurisdiction: string;
      leastInvasiveMethod: string;
      requiredReason?: 'legislation' | 'abusive_ip' | 'utah_attestation' | 'admin';
    }
  | { allowed: false; code: 'AGE_VERIFICATION_FAILED'; jurisdiction: string; retryAfter: Date }
  | { allowed: false; code: 'AGE_VERIFICATION_COOLDOWN'; jurisdiction: string; retryAfter: Date };

const ALLOWED: AliasGateResult = { allowed: true };

export async function evaluateAliasGate(user: UserDocument): Promise<AliasGateResult> {
  // 1. Feature disabled -> allow
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) return ALLOWED;

  // 1b. Sponsored (gifted) users must always verify age, regardless of jurisdiction.
  // When the jurisdiction has no seed data, fall back to the US standard method set
  // so all methods (email background check, facial age estimation, ID scan) are available.
  const hasGifted =
    user.billing?.entitlements?.includes('gifted') ||
    user.entitlementOverrides?.includes('gifted');
  if (hasGifted) {
    const jurisdiction = user.geo?.jurisdiction ?? 'GIFTED';
    const policy = await getAgeVerificationPolicy(jurisdiction);
    const effectivePolicy = policy ?? getDefaultAgeVerificationPolicy();
    return evaluateAvStatus(user, jurisdiction, undefined, effectivePolicy);
  }

  const jurisdiction = user.geo?.jurisdiction;

  // Geofence wins over compliance-driven AV paths when jurisdiction is known
  if (jurisdiction) {
    const blocked = await getBlockedJurisdictions();
    if (blocked.has(jurisdiction.toUpperCase())) {
      const lawUrl = await getLawLinkForJurisdiction(jurisdiction);
      return { allowed: false, code: 'GEOFENCE_BLOCKED', jurisdiction, lawUrl };
    }
  }

  // Compliance-driven AV: abusive IP flag
  const av = user.ageVerification;
  if (av?.requiredReason === 'abusive_ip' && av.status !== 'verified') {
    return evaluateAvStatus(user, 'COMPLIANCE', 'abusive_ip');
  }

  // Utah self-attestation on VPN US IP
  if (user.compliance?.attestedUtahResidency === true) {
    return evaluateAvStatus(user, 'US-UT', 'utah_attestation');
  }

  // 2. Jurisdiction unresolved
  if (!jurisdiction) {
    // When mode is 'all', even unresolved jurisdictions must verify
    const mode = await getRequiredMode();
    if (mode === 'all') {
      return evaluateAvStatus(user, 'UNRESOLVED');
    }
    // Otherwise allow; UI shows advisory with voluntary opt-in
    return ALLOWED;
  }

  // 3. Does this jurisdiction require AV?
  const avRequired = await requiresAgeVerification(jurisdiction);
  if (!avRequired) return ALLOWED;

  // 4. Credit card method satisfied by active subscription?
  const policy = await getAgeVerificationPolicy(jurisdiction);
  if (policy && hasSubscriptionSatisfiedCreditCardMethod(user, policy)) {
    return ALLOWED;
  }

  return evaluateAvStatus(user, jurisdiction, undefined, policy);
}

/**
 * Returns true when the jurisdiction accepts credit card as an age verification
 * method and the user already has an active paid subscription (or lifetime purchase).
 */
function hasSubscriptionSatisfiedCreditCardMethod(
  user: UserDocument,
  policy: JurisdictionAgePolicy,
): boolean {
  if (!policy.compatibleMethodSlugs?.includes('credit_card')) return false;
  const billing = user.billing;
  if (!billing) return false;
  const hasActiveSub = billing.activeSubscriptions.length > 0
    && (billing.status === 'active' || billing.status === 'trialing');
  return hasActiveSub || billing.isLifetime;
}

/**
 * Checks the user's age verification status and returns the appropriate
 * gate result. Used for both resolved jurisdictions and the 'all' mode
 * fallback for unresolved jurisdictions.
 */
async function evaluateAvStatus(
  user: UserDocument,
  jurisdiction: string,
  requiredReason?: 'legislation' | 'abusive_ip' | 'utah_attestation' | 'admin',
  prefetchedPolicy?: JurisdictionAgePolicy | null,
): Promise<AliasGateResult> {
  const av = user.ageVerification;

  // Already verified
  if (av?.status === 'verified') return ALLOWED;

  // Failed -> 30-day cooldown
  if (av?.status === 'failed' && av.failedAt) {
    const retryAfter = new Date(av.failedAt.getTime() + FAILED_COOLDOWN_MS);
    if (Date.now() < retryAfter.getTime()) {
      return { allowed: false, code: 'AGE_VERIFICATION_FAILED', jurisdiction, retryAfter };
    }
  }

  // Expired -> 24h cooldown (or 30-day if >= 3 expirations)
  if (av?.status === 'expired' && av.lastExpiredAt) {
    const count = av.expirationCount ?? 0;
    const cooldownMs = count >= MAX_EXPIRATIONS_BEFORE_LONG_COOLDOWN
      ? FAILED_COOLDOWN_MS
      : EXPIRED_COOLDOWN_MS;
    const retryAfter = new Date(av.lastExpiredAt.getTime() + cooldownMs);
    if (Date.now() < retryAfter.getTime()) {
      return { allowed: false, code: 'AGE_VERIFICATION_COOLDOWN', jurisdiction, retryAfter };
    }
  }

  // AV required but not verified (or cooldown elapsed)
  const policy = prefetchedPolicy !== undefined
    ? prefetchedPolicy
    : await getAgeVerificationPolicy(jurisdiction);
  const leastInvasiveMethod = policy?.leastInvasiveMethod ?? 'Email';

  return {
    allowed: false,
    code: 'AGE_VERIFICATION_REQUIRED',
    jurisdiction,
    leastInvasiveMethod,
    requiredReason: requiredReason ?? (jurisdiction === 'COMPLIANCE' ? 'abusive_ip' : 'legislation'),
  };
}
