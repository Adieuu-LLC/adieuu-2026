/**
 * Silent background email age check.
 *
 * When enabled via `AGE_VERIFICATION_AUTO_EMAIL_CHECK`, triggered after the
 * user completes billing (subscription or lifetime checkout) so we do not hit
 * the provider until they have subscribed. If the check passes immediately,
 * the user's account is updated to `verified` before they encounter the alias
 * gate. If inconclusive, the attempt is stored so the webhook can resolve it
 * later.
 *
 * Runs fire-and-forget from webhook handlers — failures are logged but never
 * surface to the user.
 */

import type { UserDocument, UserAgeVerification } from '../../models/user';
import { getAgeVerificationRepository } from '../../repositories/age-verification.repository';
import { getUserRepository } from '../../repositories/user.repository';
import { getActiveProvider } from './providers';
import { getAgeVerificationPolicy, resolveBusinessSettingsId } from './jurisdiction-policy';
import { isAgeVerificationEnabled, isAutoEmailBackgroundCheckEnabled } from './av-settings';
import { config } from '../../config';
import elog from '../../utils/adieuuLogger';

/**
 * Initiates a silent background age check for an email-backed account after subscription.
 *
 * Does nothing if:
 * - Age verification is disabled platform-wide
 * - The automatic post-checkout email background check is disabled platform-wide
 * - The user has no email
 * - The user already has a verification in progress or completed
 *
 * This is intentionally resilient: any error is caught and logged without
 * propagation, since it must never break checkout or signup flows.
 */
export async function initiateBackgroundCheck(user: UserDocument): Promise<void> {
  try {
    const enabled = await isAgeVerificationEnabled();
    if (!enabled) return;

    const autoBg = await isAutoEmailBackgroundCheckEnabled();
    if (!autoBg) return;

    if (!user.email) return;

    if (user.ageVerification?.status === 'verified' || user.ageVerification?.status === 'pending') {
      return;
    }

    const provider = await getActiveProvider();
    const repo = getAgeVerificationRepository();
    const userRepo = getUserRepository();

    const callbackUrl = `${config.apiBaseUrl}/api/age-verification/callback`;

    const countryCode = user.geo?.countryCode?.toLowerCase() ?? 'us';
    const jurisdiction = user.geo?.jurisdiction ?? countryCode.toUpperCase();
    const policy = await getAgeVerificationPolicy(jurisdiction);

    const providerResult = await provider.startVerification({
      redirectUrl: callbackUrl,
      country: countryCode,
      externalUserId: user._id.toHexString(),
      userInfo: { email: user.email },
      businessSettingsId: await resolveBusinessSettingsId(policy?.vmyBusinessSettingsId),
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
