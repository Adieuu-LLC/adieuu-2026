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
): Promise<SubscriptionSummaryPayload | null> {
  const summary = await getSubscriptionSummary(userId);
  if (summary.ok) {
    return summary.data;
  }

  if (summary.reason !== 'stripe_disabled') {
    return null;
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return null;

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
  if (!subscriptionStatus) {
    return { ok: false, reason: 'internal' };
  }

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
