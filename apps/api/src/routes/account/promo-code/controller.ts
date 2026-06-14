/**
 * Account promo code controller — user redemption.
 */

import { getUserRepository } from '../../../repositories/user.repository';
import { resolveEffectiveAccess } from '../../../services/billing/resolve-access';
import { redeemPromoCode, type PromoCodeRedeemReason } from '../../../services/promo-code.service';
import {
  getSubscriptionSummary,
  type SubscriptionSummaryPayload,
} from '../subscription/controller';
import elog from '../../../utils/adieuuLogger';

export type RedeemPromoCodeResponseResult =
  | {
      ok: true;
      data: {
        shortcode: string;
        subscriptionApplied?: { tier: string; expiresAt: string };
        entitlementsApplied: string[];
        subscriptionStatus: SubscriptionSummaryPayload;
      };
    }
  | { ok: false; reason: PromoCodeRedeemReason };

async function buildSubscriptionSummaryPayload(
  userId: string,
): Promise<SubscriptionSummaryPayload> {
  try {
    const summary = await getSubscriptionSummary(userId);
    if (summary.ok) {
      return summary.data;
    }

    if (summary.reason !== 'stripe_disabled') {
      elog.warn('Subscription summary unavailable after promo redemption, building fallback', {
        userId,
        reason: summary.reason,
      });
    }
  } catch (err) {
    elog.error('Subscription summary threw after promo redemption, building fallback', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) {
    return {
      activeSubscriptions: [],
      entitlements: [],
      isLifetime: false,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      hasStripeCustomer: false,
      sponsoredExpiry: null,
    };
  }

  const resolved = resolveEffectiveAccess(user);
  const hasGifted = resolved.entitlements.includes('gifted');
  let sponsoredExpiry: string | null = null;
  if (hasGifted && user.subscriptionOverrides?.length) {
    const now = new Date();
    const activeOverrides = user.subscriptionOverrides
      .filter((o) => o.expiresAt && o.expiresAt > now)
      .sort((a, b) => a.expiresAt!.getTime() - b.expiresAt!.getTime());
    if (activeOverrides.length > 0) {
      sponsoredExpiry = activeOverrides[0]!.expiresAt!.toISOString();
    }
  }

  return {
    activeSubscriptions: resolved.subscriptions,
    entitlements: resolved.entitlements,
    isLifetime: resolved.isLifetime,
    status: user.billing?.status ?? null,
    currentPeriodEnd: user.billing?.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: user.billing?.cancelAtPeriodEnd ?? false,
    cancelAt: user.billing?.cancelAt?.toISOString() ?? null,
    hasStripeCustomer: !!user.stripeCustomerId,
    sponsoredExpiry,
  };
}

export async function redeemPromoCodeForUser(
  userId: string,
  shortcode: unknown,
): Promise<RedeemPromoCodeResponseResult> {
  const result = await redeemPromoCode(userId, shortcode);
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  const subscriptionStatus = await buildSubscriptionSummaryPayload(userId);

  return {
    ok: true,
    data: {
      shortcode: result.shortcode,
      subscriptionApplied: result.subscriptionApplied,
      entitlementsApplied: result.entitlementsApplied,
      subscriptionStatus,
    },
  };
}
