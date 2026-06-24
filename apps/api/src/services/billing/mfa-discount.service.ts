/**
 * MFA Discount Service
 *
 * Manages automatic Stripe coupon application based on MFA credential status.
 * Two tiers:
 *   - basic: 2% off subscriptions (any MFA method enabled)
 *   - hardware_key: 5% off all purchases (hardware security key attached)
 */

import Stripe from 'stripe';
import { config } from '../../config';
import { getStripe } from './stripe.client';
import { getTotpRepository, getWebAuthnRepository } from '../../repositories/mfa.repository';
import { getUserRepository } from '../../repositories/user.repository';
import type { WebAuthnCredentialDocument } from '../../models/mfa';
import elog from '../../utils/adieuuLogger';

export type MfaDiscountTier = 'none' | 'basic' | 'hardware_key';

const HARDWARE_KEY_TRANSPORTS: ReadonlySet<string> = new Set(['usb', 'nfc', 'ble']);

/**
 * Determines the user's MFA discount tier based on their registered credentials.
 */
export async function getUserMfaDiscountTier(userId: string): Promise<MfaDiscountTier> {
  const webauthnRepo = getWebAuthnRepository();
  const totpRepo = getTotpRepository();

  const [webauthnCreds, totpCreds] = await Promise.all([
    webauthnRepo.findByUserId(userId),
    totpRepo.findVerifiedByUserId(userId),
  ]);

  if (isHardwareKeyCredential(webauthnCreds)) {
    return 'hardware_key';
  }

  if (totpCreds.length > 0 || webauthnCreds.length > 0) {
    return 'basic';
  }

  return 'none';
}

/**
 * Returns true if any credential qualifies as a hardware security key:
 * non-backed-up with a physical transport (USB, NFC, or BLE).
 */
function isHardwareKeyCredential(credentials: WebAuthnCredentialDocument[]): boolean {
  return credentials.some(
    (c) => !c.backedUp && c.transports?.some((t) => HARDWARE_KEY_TRANSPORTS.has(t)),
  );
}

/**
 * Returns the Stripe coupon ID for a given discount tier, or undefined if none.
 */
export function getCouponIdForTier(tier: MfaDiscountTier): string | undefined {
  switch (tier) {
    case 'hardware_key':
      return config.stripe.coupons.mfaHardwareKey || undefined;
    case 'basic':
      return config.stripe.coupons.mfaBasic || undefined;
    case 'none':
      return undefined;
  }
}

/**
 * Returns the coupon ID for checkout sessions. For subscriptions, both tiers apply.
 * For one-time payments, only hardware_key tier applies.
 */
export function getCouponIdForCheckout(
  tier: MfaDiscountTier,
  checkoutMode: 'subscription' | 'payment',
): string | undefined {
  if (tier === 'hardware_key') {
    return config.stripe.coupons.mfaHardwareKey || undefined;
  }

  if (tier === 'basic' && checkoutMode === 'subscription') {
    return config.stripe.coupons.mfaBasic || undefined;
  }

  return undefined;
}

/**
 * Reconciles the MFA discount on the user's active Stripe subscription.
 * Called whenever MFA credentials are added or removed.
 *
 * - Adding/upgrading discount: prorates immediately
 * - Removing/downgrading discount: takes effect at next renewal (no proration)
 */
export async function reconcileMfaDiscount(userId: string): Promise<void> {
  if (!config.stripe.enabled) return;

  const desiredTier = await getUserMfaDiscountTier(userId);
  const desiredCouponId = getCouponIdForTier(desiredTier);

  if (!desiredCouponId && desiredTier !== 'none') {
    elog.debug('MFA discount coupon IDs not configured; skipping reconciliation', { userId, desiredTier });
    return;
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return;

  const subscriptionId = user.billing?.stripeSubscriptionId;
  if (!subscriptionId) {
    elog.debug('No active subscription to apply MFA discount', { userId, desiredTier });
    return;
  }

  const stripe = getStripe();

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    elog.warn('Failed to retrieve subscription for MFA discount reconciliation', {
      userId,
      subscriptionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return;
  }

  const currentMfaCouponId = findMfaDiscount(subscription);
  if (currentMfaCouponId === (desiredCouponId ?? null)) {
    return;
  }

  const isUpgrade = isDiscountUpgrade(currentMfaCouponId, desiredCouponId ?? null);

  try {
    if (desiredCouponId) {
      const discounts: Stripe.SubscriptionUpdateParams.Discount[] = [
        { coupon: desiredCouponId },
        ...getOtherDiscounts(subscription),
      ];
      await stripe.subscriptions.update(subscriptionId, {
        discounts,
        proration_behavior: isUpgrade ? 'create_prorations' : 'none',
      });
    } else {
      const otherDiscounts = getOtherDiscounts(subscription);
      await stripe.subscriptions.update(subscriptionId, {
        discounts: otherDiscounts.length > 0 ? otherDiscounts : [],
        proration_behavior: 'none',
      });
    }

    elog.info('MFA discount reconciled on subscription', {
      userId,
      subscriptionId,
      previousCoupon: currentMfaCouponId,
      newCoupon: desiredCouponId ?? 'none',
      prorated: isUpgrade,
    });
  } catch (err) {
    elog.error('Failed to reconcile MFA discount', {
      userId,
      subscriptionId,
      desiredCouponId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Finds the current MFA-managed coupon on a subscription (if any).
 */
function findMfaDiscount(subscription: Stripe.Subscription): string | null {
  const mfaCouponIds = new Set([
    config.stripe.coupons.mfaBasic,
    config.stripe.coupons.mfaHardwareKey,
  ].filter(Boolean));

  const discount = subscription.discounts?.find((d) => {
    if (typeof d === 'string') return mfaCouponIds.has(d);
    const coupon = d.source?.coupon;
    const couponId = typeof coupon === 'string' ? coupon : coupon?.id;
    return couponId && mfaCouponIds.has(couponId);
  });

  if (!discount) return null;
  if (typeof discount === 'string') return discount;
  const coupon = discount.source?.coupon;
  return (typeof coupon === 'string' ? coupon : coupon?.id) ?? null;
}

/**
 * Returns non-MFA discounts on the subscription (to preserve when updating).
 */
function getOtherDiscounts(
  subscription: Stripe.Subscription,
): Stripe.SubscriptionUpdateParams.Discount[] {
  const mfaCouponIds = new Set([
    config.stripe.coupons.mfaBasic,
    config.stripe.coupons.mfaHardwareKey,
  ].filter(Boolean));

  return (subscription.discounts ?? [])
    .filter((d) => {
      if (typeof d === 'string') return !mfaCouponIds.has(d);
      const coupon = d.source?.coupon;
      const couponId = typeof coupon === 'string' ? coupon : coupon?.id;
      return couponId && !mfaCouponIds.has(couponId);
    })
    .map((d) => {
      if (typeof d === 'string') return { discount: d };
      return { discount: d.id };
    });
}

/**
 * Determines if the change is an upgrade (user gets more discount)
 * so we can apply immediate proration.
 */
function isDiscountUpgrade(
  currentCouponId: string | null,
  desiredCouponId: string | null,
): boolean {
  const tierRank = (couponId: string | null): number => {
    if (!couponId) return 0;
    if (couponId === config.stripe.coupons.mfaBasic) return 1;
    if (couponId === config.stripe.coupons.mfaHardwareKey) return 2;
    return 0;
  };

  return tierRank(desiredCouponId) > tierRank(currentCouponId);
}
