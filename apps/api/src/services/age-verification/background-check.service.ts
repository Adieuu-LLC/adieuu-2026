/**
 * Silent background email/phone age check.
 *
 * Triggered at account creation (for email-based signups) to proactively
 * run a VerifyMy background check. If the check passes immediately, the
 * user's account is updated to `verified` before they ever encounter the
 * alias gate. If inconclusive, the attempt is stored so the webhook can
 * resolve it later.
 *
 * This runs fire-and-forget from the signup path -- failures are logged
 * but never surface to the user.
 */

import type { UserDocument, UserAgeVerification } from '../../models/user';
import { getAgeVerificationRepository } from '../../repositories/age-verification.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { getActiveProvider } from './providers';
import { isAgeVerificationEnabled } from './av-settings';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

/**
 * Initiates a silent background age check for a newly-created email account.
 *
 * Does nothing if:
 * - Age verification is disabled platform-wide
 * - The user has no email
 * - The user already has a verification in progress or completed
 *
 * This is intentionally resilient: any error is caught and logged without
 * propagation, since it must never break the signup flow.
 */
export async function initiateBackgroundCheck(user: UserDocument): Promise<void> {
  try {
    const enabled = await isAgeVerificationEnabled();
    if (!enabled) return;

    if (!user.email) return;

    if (user.ageVerification?.status === 'verified' || user.ageVerification?.status === 'pending') {
      return;
    }

    const provider = await getActiveProvider();
    const repo = getAgeVerificationRepository();
    const userRepo = getUserRepository();

    const callbackUrl = `${config.apiBaseUrl}/api/age-verification/callback`;

    const countryCode = user.geo?.countryCode?.toLowerCase() ?? 'us';

    const providerResult = await provider.startVerification({
      redirectUrl: callbackUrl,
      country: countryCode,
      externalUserId: user._id.toHexString(),
      userInfo: { email: user.email },
    });

    const doc = await repo.createVerification({
      userId: user._id,
      providerId: provider.id,
      providerVerificationId: providerResult.verificationId,
      status: providerResult.status === 'approved' ? 'approved' : 'started',
      jurisdiction: user.geo?.jurisdiction ?? countryCode.toUpperCase(),
      requestedMethod: undefined,
      startedAt: new Date(),
      redirectUrl: providerResult.redirectUrl,
      optedIn: false,
      backgroundOnly: true,
    });

    if (providerResult.status === 'approved') {
      const av: UserAgeVerification = {
        status: 'verified',
        providerId: provider.id,
        providerVerificationId: providerResult.verificationId,
        verifiedAt: new Date(),
        lastJurisdiction: user.geo?.jurisdiction ?? countryCode.toUpperCase(),
        expirationCount: 0,
      };
      await userRepo.updateAgeVerification(user._id, av);
      await repo.updateStatus(doc._id, 'approved', {
        approvalMethod: 'background_check',
        completedAt: new Date(),
      });

      elog.info('Background check passed immediately for new account', {
        userId: user._id.toHexString(),
      });
    } else {
      const av: UserAgeVerification = {
        status: 'pending',
        providerId: provider.id,
        providerVerificationId: providerResult.verificationId,
        lastJurisdiction: user.geo?.jurisdiction ?? countryCode.toUpperCase(),
        expirationCount: 0,
        lastStatusCheckAt: new Date(),
      };
      await userRepo.updateAgeVerification(user._id, av);

      elog.info('Background check started for new account (pending)', {
        userId: user._id.toHexString(),
        providerVerificationId: providerResult.verificationId,
      });
    }
  } catch (err) {
    elog.warn('Background age check failed (non-blocking)', {
      userId: user._id.toHexString(),
      error: err,
    });
  }
}
