/**
 * Export-control, VPN attestation, and abusive IP compliance enforcement.
 */

import {
  ACCOUNT_MODERATION_PRESETS,
  type AccountModerationCategory,
} from '@adieuu/shared';
import { getRedis, isRedisConnected, RedisKeys } from '../../db/redis';
import type { UserDocument, UserAgeVerification, UserCompliance, VpnAttestationStep } from '../../models/user';
import { toPublicSanctionedCountry } from '../../models/sanctioned-country';
import { getAuditLogRepository } from '../../repositories/audit.repository';
import { getSanctionedCountryRepository } from '../../repositories/sanctioned-country.repository';
import { getSessionRepository } from '../../repositories/session.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { hashIpForGeo, refreshUserGeoIfStale } from '../geo/geo.service';
import { sendAbusiveIpAccessNotification } from './compliance-notification';
import elog from '../../utils/adieuuLogger';

const SYSTEM_MODERATOR = 'system:compliance';
const SANCTIONED_CACHE_TTL_SECONDS = 3600;

export const ABUSIVE_IP_BLOCKED_MESSAGE =
  'This IP address has a known history of abuse and cannot be used to access Adieuu. Please sign in from a different network.';

export interface SanctionedCountrySummary {
  countryCode: string;
  countryName: string;
}

export type ComplianceEvaluationResult =
  | { action: 'none'; user: UserDocument }
  | {
      action: 'ofac_banned';
      category: AccountModerationCategory;
      reason: string;
    }
  | { action: 'abusive_ip_blocked'; message: string }
  | {
      action: 'attestation_required';
      user: UserDocument;
      step: VpnAttestationStep;
      sanctionedCountries: SanctionedCountrySummary[];
      vpnCountryCode?: string;
    };

export type VpnAttestationAnswer = 'yes' | 'no';

export type VpnAttestationSubmitResult =
  | { ok: true; next?: 'utah_notice' | 'continue' }
  | { ok: false; reason: 'no_pending' | 'invalid_step' | 'ip_mismatch' }
  | { ok: false; banned: true; silent: true };

let sanctionedCache: { codes: Set<string>; expiresAt: number } | null = null;

async function getActiveSanctionedCountryCodes(): Promise<Set<string>> {
  const now = Date.now();
  if (sanctionedCache && sanctionedCache.expiresAt > now) {
    return sanctionedCache.codes;
  }

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      const cached = await redis.get(RedisKeys.sanctionedCountries());
      if (cached) {
        const codes = new Set(JSON.parse(cached) as string[]);
        sanctionedCache = { codes, expiresAt: now + SANCTIONED_CACHE_TTL_SECONDS * 1000 };
        return codes;
      }
    } catch {
      // fall through to Mongo
    }
  }

  const repo = getSanctionedCountryRepository();
  const rows = await repo.findAllActive();
  const codes = new Set(rows.map((r) => r.countryCode));

  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      await redis.set(
        RedisKeys.sanctionedCountries(),
        JSON.stringify([...codes]),
        'EX',
        SANCTIONED_CACHE_TTL_SECONDS,
      );
    } catch {
      // best-effort
    }
  }

  sanctionedCache = { codes, expiresAt: now + SANCTIONED_CACHE_TTL_SECONDS * 1000 };
  return codes;
}

/** Clears in-process and Redis sanctioned-country caches after admin mutations. */
export async function invalidateSanctionedCountriesCache(): Promise<void> {
  sanctionedCache = null;
  if (isRedisConnected()) {
    try {
      const redis = getRedis();
      await redis.del(RedisKeys.sanctionedCountries());
    } catch {
      // best-effort
    }
  }
}

export async function isSanctionedCountry(countryCode: string): Promise<boolean> {
  const codes = await getActiveSanctionedCountryCodes();
  return codes.has(countryCode.trim().toUpperCase());
}

export async function listSanctionedCountriesForClient(): Promise<SanctionedCountrySummary[]> {
  const repo = getSanctionedCountryRepository();
  const rows = await repo.findAllActive();
  return rows.map((r) => toPublicSanctionedCountry(r));
}

export async function enforceOfacBan(
  user: UserDocument,
  category: 'ofac_sanctioned' | 'ofac_self_attestation',
  ipHash: string,
): Promise<void> {
  const reason = ACCOUNT_MODERATION_PRESETS[category];
  const userRepo = getUserRepository();
  await userRepo.banAccount(user._id, {
    reason,
    moderatedBy: SYSTEM_MODERATOR,
    category,
  });

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForUser(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'compliance_ofac_ban',
    ipHash,
    metadata: { category },
  });

  elog.info('OFAC compliance ban applied', {
    userId: user._id.toHexString(),
    category,
  });
}

function defaultAgeVerification(user: UserDocument): UserAgeVerification {
  return user.ageVerification ?? { status: 'unverified', expirationCount: 0 };
}

export async function handleAbusiveIpAccess(
  user: UserDocument,
  ipHash: string,
): Promise<UserDocument> {
  const userRepo = getUserRepository();
  let updated = user;

  const av = defaultAgeVerification(user);
  if (av.status !== 'verified') {
    const nextAv: UserAgeVerification = {
      ...av,
      requiredReason: 'abusive_ip',
      requiredReasonAt: new Date(),
      requiredReasonIpHash: ipHash,
    };
    await userRepo.updateAgeVerification(user._id, nextAv);
    updated = { ...updated, ageVerification: nextAv };
  }

  void sendAbusiveIpAccessNotification(updated);

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForUser(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'compliance_abusive_ip_blocked',
    ipHash,
  });

  elog.info('Abusive IP access blocked', { userId: user._id.toHexString() });
  return updated;
}

function isVpnAttestationComplete(user: UserDocument, ipHash: string): boolean {
  const last = user.compliance?.lastVpnAttestation;
  return last?.ipHash === ipHash && last.sanctionedMembership === false;
}

async function setVpnAttestationPending(
  user: UserDocument,
  ipHash: string,
  step: VpnAttestationStep,
  vpnCountryCode?: string,
): Promise<UserDocument> {
  const userRepo = getUserRepository();
  const compliance: UserCompliance = {
    ...user.compliance,
    vpnAttestationPending: {
      ipHash,
      step,
      detectedAt: new Date(),
      vpnCountryCode,
    },
  };
  await userRepo.updateCompliance(user._id, compliance);
  return { ...user, compliance };
}

export async function evaluateComplianceOnAccess(
  user: UserDocument,
  ip: string,
): Promise<ComplianceEvaluationResult> {
  const geo = await refreshUserGeoIfStale(user, ip);
  let currentUser: UserDocument = geo ? { ...user, geo } : user;

  const countryCode = currentUser.geo?.countryCode;
  if (countryCode && (await isSanctionedCountry(countryCode))) {
    const ipHash = hashIpForGeo(ip);
    await enforceOfacBan(currentUser, 'ofac_sanctioned', ipHash);
    return {
      action: 'ofac_banned',
      category: 'ofac_sanctioned',
      reason: ACCOUNT_MODERATION_PRESETS.ofac_sanctioned,
    };
  }

  if (currentUser.geo?.isAbuser) {
    const ipHash = hashIpForGeo(ip);
    await handleAbusiveIpAccess(currentUser, ipHash);
    return { action: 'abusive_ip_blocked', message: ABUSIVE_IP_BLOCKED_MESSAGE };
  }

  const ipHash = hashIpForGeo(ip);
  const userGeo = currentUser.geo;
  if (userGeo?.isAnonymous && !isVpnAttestationComplete(currentUser, ipHash)) {
    const pending = currentUser.compliance?.vpnAttestationPending;
    if (!pending || pending.ipHash !== ipHash) {
      currentUser = await setVpnAttestationPending(
        currentUser,
        ipHash,
        'sanctioned_membership',
        userGeo.countryCode,
      );
    }

    const sanctionedCountries = await listSanctionedCountriesForClient();
    return {
      action: 'attestation_required',
      user: currentUser,
      step: currentUser.compliance?.vpnAttestationPending?.step ?? 'sanctioned_membership',
      sanctionedCountries,
      vpnCountryCode: userGeo.countryCode,
    };
  }

  return { action: 'none', user: currentUser };
}

export async function submitVpnAttestation(
  user: UserDocument,
  ip: string,
  step: VpnAttestationStep,
  answer: VpnAttestationAnswer,
): Promise<VpnAttestationSubmitResult> {
  const pending = user.compliance?.vpnAttestationPending;
  if (!pending) {
    return { ok: false, reason: 'no_pending' };
  }

  const ipHash = hashIpForGeo(ip);
  if (pending.ipHash !== ipHash) {
    return { ok: false, reason: 'ip_mismatch' };
  }

  if (pending.step !== step) {
    return { ok: false, reason: 'invalid_step' };
  }

  const userRepo = getUserRepository();

  if (step === 'sanctioned_membership') {
    if (answer === 'yes') {
      await enforceOfacBan(user, 'ofac_self_attestation', ipHash);
      return { ok: false, banned: true, silent: true };
    }

    const vpnCountryCode = pending.vpnCountryCode?.toUpperCase();
    if (vpnCountryCode === 'US') {
      const compliance: UserCompliance = {
        ...user.compliance,
        vpnAttestationPending: {
          ipHash,
          step: 'utah_residency',
          detectedAt: pending.detectedAt,
          vpnCountryCode: pending.vpnCountryCode,
        },
      };
      await userRepo.updateCompliance(user._id, compliance);
      return { ok: true, next: 'continue' };
    }

    const compliance: UserCompliance = {
      ...user.compliance,
      vpnAttestationPending: undefined,
      lastVpnAttestation: {
        ipHash,
        completedAt: new Date(),
        sanctionedMembership: false,
        utahResidency: false,
      },
    };
    await userRepo.updateCompliance(user._id, compliance);
    return { ok: true, next: 'continue' };
  }

  if (step === 'utah_residency') {
    if (answer === 'yes') {
      const compliance: UserCompliance = {
        ...user.compliance,
        attestedUtahResidency: true,
        vpnAttestationPending: undefined,
        lastVpnAttestation: {
          ipHash,
          completedAt: new Date(),
          sanctionedMembership: false,
          utahResidency: true,
        },
      };
      await userRepo.updateCompliance(user._id, compliance);
      return { ok: true, next: 'utah_notice' };
    }

    const compliance: UserCompliance = {
      ...user.compliance,
      vpnAttestationPending: undefined,
      lastVpnAttestation: {
        ipHash,
        completedAt: new Date(),
        sanctionedMembership: false,
        utahResidency: false,
      },
    };
    await userRepo.updateCompliance(user._id, compliance);
    return { ok: true, next: 'continue' };
  }

  return { ok: false, reason: 'invalid_step' };
}

export function hasPendingVpnAttestation(user: UserDocument, ip: string): boolean {
  const pending = user.compliance?.vpnAttestationPending;
  if (!pending) return false;
  return pending.ipHash === hashIpForGeo(ip);
}

export function buildVpnAttestationSessionPayload(
  user: UserDocument,
  sanctionedCountries: SanctionedCountrySummary[],
) {
  const pending = user.compliance?.vpnAttestationPending;
  if (!pending) return undefined;

  return {
    required: true as const,
    step: pending.step,
    sanctionedCountries,
    vpnCountryCode: pending.vpnCountryCode,
  };
}
