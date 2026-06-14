/**
 * Account promo code controller — user redemption.
 */

import { getUserRepository } from '../../../repositories/user.repository';
import { redeemPromoCode, type PromoCodeRedeemReason } from '../../../services/promo-code.service';
import type { PublicPendingAccountEvent } from '../../../services/pending-account-event.service';
import {
  buildSubscriptionSummaryFromUser,
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
        pendingEvent?: PublicPendingAccountEvent;
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
      planBadge: 'annual',
      planExpiresAt: null,
      status: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      hasStripeCustomer: false,
      sponsoredExpiry: null,
    };
  }

  return buildSubscriptionSummaryFromUser(user);
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
      pendingEvent: result.pendingEvent,
    },
  };
}
