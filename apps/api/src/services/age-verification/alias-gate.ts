/**
 * Alias gate -- account-level enforcement for age verification and geofencing.
 *
 * Evaluated before identity create and identity login. There is no admin
 * bypass: the account-identity separation is by design and we cannot know
 * at the account level whether any of the account's aliases are platform admins.
 */

import type { UserDocument } from '../../models/user';
import { isAgeVerificationEnabled, getBlockedJurisdictions, getLawLinkForJurisdiction, getRequiredMode } from './av-settings';
import { requiresAgeVerification, getAgeVerificationPolicy } from './jurisdiction-policy';

const FAILED_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;       // 30 days
const EXPIRED_COOLDOWN_MS = 24 * 60 * 60 * 1000;            // 24 hours
const MAX_EXPIRATIONS_BEFORE_LONG_COOLDOWN = 3;

export type AliasGateResult =
  | { allowed: true }
  | { allowed: false; code: 'GEOFENCE_BLOCKED'; jurisdiction: string; lawUrl?: string }
  | { allowed: false; code: 'AGE_VERIFICATION_REQUIRED'; jurisdiction: string; leastInvasiveMethod: string }
  | { allowed: false; code: 'AGE_VERIFICATION_FAILED'; jurisdiction: string; retryAfter: Date }
  | { allowed: false; code: 'AGE_VERIFICATION_COOLDOWN'; jurisdiction: string; retryAfter: Date };

const ALLOWED: AliasGateResult = { allowed: true };

export async function evaluateAliasGate(user: UserDocument): Promise<AliasGateResult> {
  // 1. Feature disabled -> allow
  const enabled = await isAgeVerificationEnabled();
  if (!enabled) return ALLOWED;

  // 2. Jurisdiction unresolved
  const jurisdiction = user.geo?.jurisdiction;
  if (!jurisdiction) {
    // When mode is 'all', even unresolved jurisdictions must verify
    const mode = await getRequiredMode();
    if (mode === 'all') {
      return evaluateAvStatus(user, 'UNRESOLVED');
    }
    // Otherwise allow; UI shows advisory with voluntary opt-in
    return ALLOWED;
  }

  // 3. Geofence check
  const blocked = await getBlockedJurisdictions();
  if (blocked.has(jurisdiction.toUpperCase())) {
    const lawUrl = await getLawLinkForJurisdiction(jurisdiction);
    return { allowed: false, code: 'GEOFENCE_BLOCKED', jurisdiction, lawUrl };
  }

  // 4. Does this jurisdiction require AV?
  const avRequired = await requiresAgeVerification(jurisdiction);
  if (!avRequired) return ALLOWED;

  return evaluateAvStatus(user, jurisdiction);
}

/**
 * Checks the user's age verification status and returns the appropriate
 * gate result. Used for both resolved jurisdictions and the 'all' mode
 * fallback for unresolved jurisdictions.
 */
async function evaluateAvStatus(user: UserDocument, jurisdiction: string): Promise<AliasGateResult> {
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
  const policy = await getAgeVerificationPolicy(jurisdiction);
  const leastInvasiveMethod = policy?.leastInvasiveMethod ?? 'Email';

  return {
    allowed: false,
    code: 'AGE_VERIFICATION_REQUIRED',
    jurisdiction,
    leastInvasiveMethod,
  };
}
