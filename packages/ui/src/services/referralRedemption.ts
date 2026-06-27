import type { createApiClient } from '@adieuu/shared';
import {
  clearPendingReferralCode,
  PENDING_REFERRAL_CODE_STORAGE_KEY,
  readPendingReferralCode,
  resolveReferralCodeFromLocation,
} from '@adieuu/shared';

type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Persists a referral code from the current URL query param into localStorage.
 */
export function captureReferralCodeFromSearch(search: string): void {
  const code = resolveReferralCodeFromLocation(search);
  if (!code) return;
  try {
    window.localStorage.setItem(PENDING_REFERRAL_CODE_STORAGE_KEY, code);
  } catch {
    // ignore storage failures
  }
}

/**
 * Attempts to redeem a pending referral code after account authentication.
 * Failures are silent — referral is optional and may already be applied.
 */
export async function tryRedeemPendingReferral(
  api: ApiClient,
  options?: { search?: string },
): Promise<{ redeemed: boolean; code?: string }> {
  const fromUrl = options?.search
    ? resolveReferralCodeFromLocation(options.search)
    : null;
  const code = fromUrl ?? readPendingReferralCode();
  if (!code) return { redeemed: false };

  try {
    const response = await api.referral.redeem({ code });
    clearPendingReferralCode();

    if (response.success && response.data) {
      return { redeemed: true, code: response.data.code };
    }

    return { redeemed: false };
  } catch {
    clearPendingReferralCode();
    return { redeemed: false };
  }
}
