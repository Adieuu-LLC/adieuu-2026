/**
 * Age verification orchestration service.
 *
 * Coordinates verification sessions between our API, the provider (VerifyMy v3),
 * and the user document. Implements progressive escalation: background email/phone
 * check first, then interactive redirect with the least invasive method.
 */

import { ObjectId } from 'mongodb';
import { config } from '../../config';
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
 * Starts a new verification for a user. Attempts a background check
 * first if PII is available and the jurisdiction allows it.
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

  const policy = await getAgeVerificationPolicy(opts.jurisdiction);
  const leastInvasive = policy?.leastInvasiveMethod;

  const countryCode = opts.countryOverride
    ?? user.geo?.countryCode?.toLowerCase()
    ?? 'us';

  const redirectUrl = `${opts.callbackBaseUrl}/api/age-verification/callback`;

  const input: Parameters<typeof provider.startVerification>[0] = {
    redirectUrl,
    country: countryCode,
    externalUserId: user._id.toHexString(),
    method: leastInvasive,
  };

  // Include user_info for background check if email is available
  // and the jurisdiction supports email_age_check
  const canBackgroundCheck = policy?.compatibleMethods.includes('Email');
  if (canBackgroundCheck && user.email) {
    input.userInfo = { email: user.email };
    if (user.phone) {
      input.userInfo.phone = user.phone;
    }
  }

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

  // Persist the attempt
  const doc = await repo.createVerification({
    userId: user._id,
    providerId: provider.id,
    providerVerificationId: providerResult.verificationId,
    status: providerResult.status === 'approved' ? 'approved' : 'started',
    jurisdiction: opts.jurisdiction,
    requestedMethod: leastInvasive,
    startedAt: new Date(),
    optedIn: opts.optedIn ?? false,
  });

  // If immediately approved (background check succeeded), update user
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
    // Mark user as pending
    const av: UserAgeVerification = {
      status: 'pending',
      providerId: provider.id,
      providerVerificationId: providerResult.verificationId,
      lastJurisdiction: opts.jurisdiction,
      optedIn: opts.optedIn,
      expirationCount: user.ageVerification?.expirationCount ?? 0,
    };
    await userRepo.updateAgeVerification(user._id, av);
  }

  return {
    verificationId: doc._id.toHexString(),
    providerVerificationId: providerResult.verificationId,
    status: providerResult.status,
    redirectUrl: providerResult.redirectUrl,
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

  // Update local doc if status changed
  if (providerStatus.status !== doc.status) {
    await repo.updateStatus(doc._id, providerStatus.status, {
      approvalMethod: providerStatus.approvalMethod,
      backgroundCheck: providerStatus.backgroundCheck,
      completedAt: providerStatus.status === 'approved' || providerStatus.status === 'failed'
        ? new Date()
        : undefined,
    });

    // Update user document for terminal states
    if (providerStatus.status === 'approved') {
      await userRepo.updateAgeVerification(user._id, {
        status: 'verified',
        providerId: provider.id,
        providerVerificationId,
        verifiedAt: new Date(),
        lastJurisdiction: doc.jurisdiction,
        optedIn: doc.optedIn || undefined,
        expirationCount: user.ageVerification?.expirationCount ?? 0,
      });
    } else if (providerStatus.status === 'failed') {
      await userRepo.updateAgeVerification(user._id, {
        status: 'failed',
        providerId: provider.id,
        providerVerificationId,
        failedAt: new Date(),
        lastJurisdiction: doc.jurisdiction,
        optedIn: doc.optedIn || undefined,
        expirationCount: user.ageVerification?.expirationCount ?? 0,
      });
    } else if (providerStatus.status === 'expired') {
      const prevCount = user.ageVerification?.expirationCount ?? 0;
      await userRepo.updateAgeVerification(user._id, {
        status: 'expired',
        providerId: provider.id,
        providerVerificationId,
        lastExpiredAt: new Date(),
        lastJurisdiction: doc.jurisdiction,
        optedIn: doc.optedIn || undefined,
        expirationCount: prevCount + 1,
      });
    }
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
