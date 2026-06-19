/**
 * Age verification orchestration service.
 *
 * Coordinates verification sessions between our API, the provider (VerifyMy v3),
 * and the user document. Implements progressive escalation: background email/phone
 * check first, then interactive redirect with the least invasive method.
 */

import type { UserDocument, UserAgeVerification } from '../../models/user';
import type { AgeVerificationDocument } from '../../models/age-verification';
import { getAgeVerificationRepository } from '../../repositories/age-verification.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { getActiveProvider } from './providers';
import { getAgeVerificationPolicy } from './jurisdiction-policy';
import type { StartVerificationResult, VerificationStatusResult } from './provider';
import elog from '../../utils/adieuuLogger';

export interface StartResult {
  verificationId: string;
  providerVerificationId: string;
  status: string;
  redirectUrl?: string;
  /** True when user_info was sent to the provider (email background check attempted). */
  backgroundCheckAttempted: boolean;
}

export interface StatusResult {
  verificationId: string;
  providerVerificationId: string;
  status: string;
  approvalMethod?: string;
  backgroundCheck?: string | null;
  expiresAt?: string;
  methodAttempts?: Record<string, { enabled: boolean; maxAttempts: number; remaining: number }>;
}

/**
 * Starts a verification for a user, reusing an existing non-terminal attempt
 * when one exists and the hosted URL is still valid.
 *
 * Attempts a background check first if PII is available and the jurisdiction
 * allows it.
 */
export async function startVerification(
  user: UserDocument,
  opts: {
    jurisdiction: string;
    callbackBaseUrl: string;
    optedIn?: boolean;
    countryOverride?: string;
  },
): Promise<StartResult> {
  const provider = await getActiveProvider();
  const repo = getAgeVerificationRepository();
  const userRepo = getUserRepository();

  // Check for an existing non-terminal attempt before creating a new one
  const existing = await repo.findByUserIdAndStatus(user._id, ['started', 'pending']);
  if (existing.length > 0) {
    const candidate = existing[0]!;

    // Best-effort provider status check -- if it fails, still return the
    // existing attempt rather than orphaning it by creating a new one.
    let stillActive = true;
    try {
      const providerStatus = await provider.getVerificationStatus(candidate.providerVerificationId);
      if (providerStatus.status !== 'started' && providerStatus.status !== 'pending') {
        stillActive = false;
        await syncTerminalStatus(candidate, providerStatus, provider.id, user, repo, userRepo);
      }
    } catch (err) {
      elog.warn('Provider status check failed for existing attempt, returning cached', {
        providerVerificationId: candidate.providerVerificationId,
        error: err,
      });
    }

    if (stillActive) {
      elog.info('Age verification: reusing existing non-terminal attempt', {
        userId: user._id.toHexString(),
        providerVerificationId: candidate.providerVerificationId,
        status: candidate.status,
        hasRedirectUrl: !!candidate.redirectUrl,
      });

      if (user.ageVerification) {
        await userRepo.updateAgeVerification(user._id, {
          ...user.ageVerification,
          lastStatusCheckAt: new Date(),
        });
      }
      return {
        verificationId: candidate._id.toHexString(),
        providerVerificationId: candidate.providerVerificationId,
        status: candidate.status,
        redirectUrl: candidate.redirectUrl,
        backgroundCheckAttempted: !!candidate.redirectUrl && !!user.email,
      };
    }
  }

  const policy = await getAgeVerificationPolicy(opts.jurisdiction);
  const leastInvasive = policy?.leastInvasiveMethod;

  const countryCode = opts.countryOverride
    ?? user.geo?.countryCode?.toLowerCase()
    ?? 'us';

  const callbackUrl = `${opts.callbackBaseUrl}/api/age-verification/callback`;

  const input: Parameters<typeof provider.startVerification>[0] = {
    redirectUrl: callbackUrl,
    country: countryCode,
    externalUserId: user._id.toHexString(),
    method: leastInvasive,
    businessSettingsId: policy?.vmyBusinessSettingsId,
  };

  if (user.email) {
    input.userInfo = { email: user.email };
    if (user.phone) {
      input.userInfo.phone = user.phone;
    }
  }

  elog.info('Age verification: policy resolved', {
    userId: user._id.toHexString(),
    jurisdiction: opts.jurisdiction,
    hasPolicy: !!policy,
    compatibleMethods: policy?.compatibleMethods ?? [],
    leastInvasive: leastInvasive ?? null,
    businessSettingsId: policy?.vmyBusinessSettingsId ?? null,
    userHasEmail: !!user.email,
    userHasPhone: !!user.phone,
    willSendUserInfo: !!user.email,
  });

  let providerResult: StartVerificationResult;
  try {
    providerResult = await provider.startVerification(input);
  } catch (err) {
    elog.error('Failed to start verification with provider', {
      providerId: provider.id,
      userId: user._id.toString(),
      error: err,
    });
    throw err;
  }

  const doc = await repo.createVerification({
    userId: user._id,
    providerId: provider.id,
    providerVerificationId: providerResult.verificationId,
    status: providerResult.status === 'approved' ? 'approved' : 'started',
    jurisdiction: opts.jurisdiction,
    requestedMethod: leastInvasive,
    startedAt: new Date(),
    redirectUrl: providerResult.redirectUrl,
    optedIn: opts.optedIn ?? false,
  });

  if (providerResult.status === 'approved') {
    const av: UserAgeVerification = {
      status: 'verified',
      providerId: provider.id,
      providerVerificationId: providerResult.verificationId,
      verifiedAt: new Date(),
      lastJurisdiction: opts.jurisdiction,
      optedIn: opts.optedIn,
      expirationCount: user.ageVerification?.expirationCount ?? 0,
    };
    await userRepo.updateAgeVerification(user._id, av);
    await repo.updateStatus(doc._id, 'approved', {
      approvalMethod: 'background_check',
      completedAt: new Date(),
    });
  } else {
    const av: UserAgeVerification = {
      status: 'pending',
      providerId: provider.id,
      providerVerificationId: providerResult.verificationId,
      lastJurisdiction: opts.jurisdiction,
      optedIn: opts.optedIn,
      expirationCount: user.ageVerification?.expirationCount ?? 0,
      lastStatusCheckAt: new Date(),
    };
    await userRepo.updateAgeVerification(user._id, av);
  }

  return {
    verificationId: doc._id.toHexString(),
    providerVerificationId: providerResult.verificationId,
    status: providerResult.status,
    redirectUrl: providerResult.redirectUrl,
    backgroundCheckAttempted: !!input.userInfo?.email,
  };
}

/**
 * Polls the provider for the current status, updates local records
 * if the status has changed.
 */
export async function checkVerificationStatus(
  user: UserDocument,
  providerVerificationId: string,
): Promise<StatusResult> {
  const provider = await getActiveProvider();
  const repo = getAgeVerificationRepository();
  const userRepo = getUserRepository();

  const doc = await repo.findByProviderVerificationId(providerVerificationId);
  if (!doc || !doc.userId.equals(user._id)) {
    throw new Error('Verification not found');
  }

  // If already in a terminal state locally, return cached
  if (doc.status === 'approved' || doc.status === 'failed' || doc.status === 'expired') {
    return toStatusResult(doc);
  }

  let providerStatus: VerificationStatusResult;
  try {
    providerStatus = await provider.getVerificationStatus(providerVerificationId);
  } catch (err) {
    elog.warn('Failed to poll provider for verification status', {
      providerVerificationId,
      error: err,
    });
    return toStatusResult(doc);
  }

  // Record that we successfully queried the provider (drives /me debounce)
  const now = new Date();
  if (user.ageVerification) {
    await userRepo.updateAgeVerification(user._id, {
      ...user.ageVerification,
      lastStatusCheckAt: now,
    });
  }

  if (providerStatus.status !== doc.status) {
    await syncTerminalStatus(doc, providerStatus, provider.id, user, repo, userRepo);
  }

  return {
    verificationId: doc._id.toHexString(),
    providerVerificationId: doc.providerVerificationId,
    status: providerStatus.status,
    approvalMethod: providerStatus.approvalMethod,
    backgroundCheck: providerStatus.backgroundCheck,
    expiresAt: providerStatus.expiresAt,
    methodAttempts: providerStatus.methodAttempts
      ? Object.fromEntries(
          Object.entries(providerStatus.methodAttempts).map(([k, v]) => [
            k,
            { enabled: v.enabled, maxAttempts: v.maxAttempts, remaining: v.remaining },
          ]),
        )
      : undefined,
  };
}

function toStatusResult(doc: AgeVerificationDocument): StatusResult {
  return {
    verificationId: doc._id.toHexString(),
    providerVerificationId: doc.providerVerificationId,
    status: doc.status,
    approvalMethod: doc.approvalMethod,
    backgroundCheck: doc.backgroundCheck,
  };
}

/**
 * Syncs local attempt + user docs when the provider reports a status change.
 * Used by both `checkVerificationStatus` and the idempotent `startVerification` path.
 */
async function syncTerminalStatus(
  doc: AgeVerificationDocument,
  providerStatus: VerificationStatusResult,
  providerId: string,
  user: UserDocument,
  repo: ReturnType<typeof getAgeVerificationRepository>,
  userRepo: ReturnType<typeof getUserRepository>,
): Promise<void> {
  await repo.updateStatus(doc._id, providerStatus.status, {
    approvalMethod: providerStatus.approvalMethod,
    backgroundCheck: providerStatus.backgroundCheck,
    completedAt: providerStatus.status === 'approved' || providerStatus.status === 'failed'
      ? new Date()
      : undefined,
  });

  const pvId = doc.providerVerificationId;

  if (providerStatus.status === 'approved') {
    await userRepo.updateAgeVerification(user._id, {
      status: 'verified',
      providerId,
      providerVerificationId: pvId,
      verifiedAt: new Date(),
      lastJurisdiction: doc.jurisdiction,
      optedIn: doc.optedIn || undefined,
      expirationCount: user.ageVerification?.expirationCount ?? 0,
      lastStatusCheckAt: new Date(),
    });
  } else if (providerStatus.status === 'failed') {
    await userRepo.updateAgeVerification(user._id, {
      status: 'failed',
      providerId,
      providerVerificationId: pvId,
      failedAt: new Date(),
      lastJurisdiction: doc.jurisdiction,
      optedIn: doc.optedIn || undefined,
      expirationCount: user.ageVerification?.expirationCount ?? 0,
      lastStatusCheckAt: new Date(),
    });
  } else if (providerStatus.status === 'expired') {
    const prevCount = user.ageVerification?.expirationCount ?? 0;
    await userRepo.updateAgeVerification(user._id, {
      status: 'expired',
      providerId,
      providerVerificationId: pvId,
      lastExpiredAt: new Date(),
      lastJurisdiction: doc.jurisdiction,
      optedIn: doc.optedIn || undefined,
      expirationCount: prevCount + 1,
      lastStatusCheckAt: new Date(),
    });
  }
}
