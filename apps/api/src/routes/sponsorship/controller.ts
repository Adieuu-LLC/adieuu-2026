/**
 * Sponsorship controller — request, directory, checkout, withdraw, and status.
 *
 * @module routes/sponsorship/controller
 */

import type { PurchasableProductId } from '@adieuu/shared';
import { PURCHASABLE_PRODUCT_IDS } from '@adieuu/shared';
import { ObjectId } from 'mongodb';
import { getUserRepository } from '../../repositories/user.repository';
import {
  getSponsorshipRequestRepository,
  getSponsorshipLogRepository,
} from '../../repositories/sponsorship.repository';
import { resolveEffectiveAccess } from '../../services/billing/resolve-access';
import {
  getOrCreateStripeCustomer,
  BillingConfigurationError,
  billingErrorLogFields,
} from '../../services/billing/billing.service';
import { getStripe } from '../../services/billing/stripe.client';
import { PURCHASABLE_PRODUCTS } from '../../constants/subscription-tiers';
import { config } from '../../config';
import { checkRateLimit, type RateLimitConfig } from '../../services/rate-limit.service';
import { sanitizeString } from '../../utils/sanitize';
import elog from '../../utils/adieuuLogger';
import type { SponsorshipRequestDocument } from '../../models/sponsorship';
import type { SponsorshipDirectoryEntry, SponsorshipRequestStatus } from '@adieuu/shared';

const REQUEST_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 3600 };
const DIRECTORY_RATE_LIMIT: RateLimitConfig = { limit: 120, windowSeconds: 3600 };
const CHECKOUT_RATE_LIMIT: RateLimitConfig = { limit: 20, windowSeconds: 3600 };

const MAX_MESSAGE_LENGTH = 280;

// ---------------------------------------------------------------------------
// GET /api/sponsorship/status
// ---------------------------------------------------------------------------

export type GetSponsorshipStatusResult =
  | { ok: true; data: SponsorshipRequestStatus }
  | { ok: false; reason: 'user_not_found' };

export async function getSponsorshipStatus(
  userId: string,
): Promise<GetSponsorshipStatusResult> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const repo = getSponsorshipRequestRepository();
  const doc = await repo.findByUserId(user._id);

  if (!doc) {
    return { ok: true, data: { hasRequest: false } };
  }

  const data: SponsorshipRequestStatus = {
    hasRequest: true,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
    fulfilledProduct: doc.fulfilledProduct,
    fulfilledAt: doc.fulfilledAt?.toISOString(),
    sponsorRevealed: doc.sponsorRevealed,
    sponsorFirstName: doc.sponsorRevealed ? doc.sponsorFirstName : undefined,
    sponsorLastInitial: doc.sponsorRevealed ? doc.sponsorLastInitial : undefined,
  };

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// POST /api/sponsorship/request
// ---------------------------------------------------------------------------

export type CreateSponsorshipRequestResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'rate_limited' | 'user_not_found' | 'has_subscription' | 'already_requested' | 'validation' | 'stripe_disabled' };

export async function createSponsorshipRequest(
  userId: string,
  body: unknown,
): Promise<CreateSponsorshipRequestResult> {
  if (!config.stripe.enabled) return { ok: false, reason: 'stripe_disabled' };

  const rl = await checkRateLimit('sponsorship-request', userId, REQUEST_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const access = resolveEffectiveAccess(user);
  if (access.subscriptions.length > 0) {
    return { ok: false, reason: 'has_subscription' };
  }

  const input = body as {
    firstName?: unknown;
    lastInitial?: unknown;
    message?: unknown;
    preferredProduct?: unknown;
  } | undefined;

  const firstName = sanitizeString(String(input?.firstName ?? ''), 'general');
  const lastInitial = sanitizeString(String(input?.lastInitial ?? ''), 'general');

  if (!firstName.value || firstName.value.length < 1 || firstName.value.length > 50) {
    return { ok: false, reason: 'validation' };
  }
  if (!lastInitial.value || lastInitial.value.length !== 1) {
    return { ok: false, reason: 'validation' };
  }

  let message: string | undefined;
  if (input?.message !== undefined && input.message !== null && input.message !== '') {
    const sanitized = sanitizeString(String(input.message), 'general');
    if (sanitized.value && sanitized.value.length > MAX_MESSAGE_LENGTH) {
      return { ok: false, reason: 'validation' };
    }
    message = sanitized.value || undefined;
  }

  let preferredProduct: PurchasableProductId | undefined;
  if (input?.preferredProduct) {
    const prod = String(input.preferredProduct);
    if (PURCHASABLE_PRODUCT_IDS.includes(prod as PurchasableProductId)) {
      preferredProduct = prod as PurchasableProductId;
    }
  }

  const jurisdiction = user.geo?.jurisdiction ?? 'Unknown';

  const repo = getSponsorshipRequestRepository();
  const existing = await repo.findByUserId(user._id);
  if (existing) {
    return { ok: false, reason: 'already_requested' };
  }

  const doc = await repo.createRequest({
    userId: user._id,
    firstName: firstName.value,
    lastInitial: lastInitial.value,
    jurisdiction,
    message,
    preferredProduct,
    status: 'active',
  });

  elog.info('Sponsorship request created', { userId, requestId: doc._id.toHexString() });
  return { ok: true, id: doc._id.toHexString() };
}

// ---------------------------------------------------------------------------
// DELETE /api/sponsorship/request
// ---------------------------------------------------------------------------

export type WithdrawSponsorshipRequestResult =
  | { ok: true }
  | { ok: false; reason: 'user_not_found' | 'no_active_request' };

export async function withdrawSponsorshipRequest(
  userId: string,
): Promise<WithdrawSponsorshipRequestResult> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const repo = getSponsorshipRequestRepository();
  const withdrawn = await repo.withdraw(user._id);
  if (!withdrawn) return { ok: false, reason: 'no_active_request' };

  elog.info('Sponsorship request withdrawn', { userId });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// GET /api/sponsorship/directory
// ---------------------------------------------------------------------------

export type GetSponsorshipDirectoryResult =
  | { ok: true; data: { entries: SponsorshipDirectoryEntry[]; hasMore: boolean } }
  | { ok: false; reason: 'rate_limited' };

export async function getSponsorshipDirectory(
  userId: string,
  cursorParam?: string,
): Promise<GetSponsorshipDirectoryResult> {
  const rl = await checkRateLimit('sponsorship-directory', userId, DIRECTORY_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const pageSize = 20;
  const cursor = cursorParam ? new Date(cursorParam) : undefined;

  const repo = getSponsorshipRequestRepository();
  const docs = await repo.findActiveDirectory(cursor, pageSize + 1);

  const hasMore = docs.length > pageSize;
  const page = hasMore ? docs.slice(0, pageSize) : docs;

  const entries: SponsorshipDirectoryEntry[] = page.map(toDirectoryEntry);

  return { ok: true, data: { entries, hasMore } };
}

function toDirectoryEntry(doc: SponsorshipRequestDocument): SponsorshipDirectoryEntry {
  return {
    id: doc._id.toHexString(),
    firstName: doc.firstName,
    lastInitial: doc.lastInitial,
    jurisdiction: doc.jurisdiction,
    message: doc.message,
    preferredProduct: doc.preferredProduct,
    createdAt: doc.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// POST /api/sponsorship/checkout
// ---------------------------------------------------------------------------

export type CreateSponsorshipCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'stripe_disabled' | 'rate_limited' | 'validation' | 'user_not_found' | 'request_not_found' | 'request_not_active' | 'self_sponsor' | 'billing_config' | 'internal' };

export async function createSponsorshipCheckout(
  userId: string,
  body: unknown,
): Promise<CreateSponsorshipCheckoutResult> {
  if (!config.stripe.enabled) return { ok: false, reason: 'stripe_disabled' };

  const rl = await checkRateLimit('sponsorship-checkout', userId, CHECKOUT_RATE_LIMIT);
  if (!rl.allowed) return { ok: false, reason: 'rate_limited' };

  const input = body as {
    requestId?: unknown;
    product?: unknown;
    revealIdentity?: unknown;
    sponsorFirstName?: unknown;
    sponsorLastInitial?: unknown;
  } | undefined;

  const requestId = typeof input?.requestId === 'string' ? input.requestId : '';
  const productRaw = typeof input?.product === 'string' ? input.product : '';
  const revealIdentity = input?.revealIdentity === true;
  const sponsorFirstName = typeof input?.sponsorFirstName === 'string' ? input.sponsorFirstName : undefined;
  const sponsorLastInitial = typeof input?.sponsorLastInitial === 'string' ? input.sponsorLastInitial : undefined;

  if (!requestId || !PURCHASABLE_PRODUCT_IDS.includes(productRaw as PurchasableProductId)) {
    return { ok: false, reason: 'validation' };
  }
  const product = productRaw as PurchasableProductId;

  const userRepo = getUserRepository();
  const sponsor = await userRepo.findById(userId);
  if (!sponsor) return { ok: false, reason: 'user_not_found' };

  const requestRepo = getSponsorshipRequestRepository();
  const request = await requestRepo.findById(requestId);
  if (!request) return { ok: false, reason: 'request_not_found' };
  if (request.status !== 'active') return { ok: false, reason: 'request_not_active' };
  if (request.userId.toHexString() === userId) return { ok: false, reason: 'self_sponsor' };

  const productMeta = PURCHASABLE_PRODUCTS[product];
  const priceId = config.stripe.prices[productMeta.priceConfigKey];
  if (!priceId) {
    return { ok: false, reason: 'billing_config' };
  }

  try {
    const stripe = getStripe();
    const customerId = await getOrCreateStripeCustomer(sponsor);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: config.stripe.successUrl,
      cancel_url: config.stripe.cancelUrl,
      metadata: {
        sponsorship: 'true',
        sponsorUserId: userId,
        beneficiaryUserId: request.userId.toHexString(),
        sponsorshipRequestId: requestId,
        productId: product,
        revealIdentity: String(revealIdentity),
        sponsorFirstName: revealIdentity ? (sponsorFirstName ?? '') : '',
        sponsorLastInitial: revealIdentity ? (sponsorLastInitial ?? '') : '',
      },
    });

    if (!session.url) {
      return { ok: false, reason: 'internal' };
    }

    elog.info('Sponsorship checkout session created', {
      sponsorUserId: userId,
      beneficiaryUserId: request.userId.toHexString(),
      requestId,
      product,
      sessionId: session.id,
    });

    return { ok: true, url: session.url };
  } catch (err) {
    if (err instanceof BillingConfigurationError) {
      return { ok: false, reason: 'billing_config' };
    }
    elog.error('Sponsorship checkout failed', { userId, ...billingErrorLogFields(err) });
    return { ok: false, reason: 'internal' };
  }
}

// ---------------------------------------------------------------------------
// GET /api/sponsorship/sponsor-stats
// ---------------------------------------------------------------------------

export type GetSponsorStatsResult =
  | { ok: true; data: { lifetimeCount: number; activeCount: number; hasAchievementOptIn: boolean } }
  | { ok: false; reason: 'user_not_found' };

export async function getSponsorStats(
  userId: string,
): Promise<GetSponsorStatsResult> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const logRepo = getSponsorshipLogRepository();
  const sponsorObjId = new ObjectId(userId);

  const [lifetimeCount, activeCount] = await Promise.all([
    logRepo.countBySponsor(sponsorObjId),
    logRepo.countActiveBySponsor(sponsorObjId),
  ]);

  const hasAchievementOptIn = user.entitlementOverrides?.includes('sponsor') ?? false;

  return { ok: true, data: { lifetimeCount, activeCount, hasAchievementOptIn } };
}

// ---------------------------------------------------------------------------
// POST /api/sponsorship/sponsor-achievement
// ---------------------------------------------------------------------------

export type SetSponsorAchievementResult =
  | { ok: true }
  | { ok: false; reason: 'user_not_found' | 'not_a_sponsor' | 'validation' };

export async function setSponsorAchievement(
  userId: string,
  body: unknown,
): Promise<SetSponsorAchievementResult> {
  const input = body as { enabled?: unknown } | undefined;
  if (typeof input?.enabled !== 'boolean') {
    return { ok: false, reason: 'validation' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const logRepo = getSponsorshipLogRepository();
  const sponsorObjId = new ObjectId(userId);
  const count = await logRepo.countBySponsor(sponsorObjId);
  if (count === 0) return { ok: false, reason: 'not_a_sponsor' };

  if (input.enabled) {
    await userRepo.addEntitlementOverride(user._id, 'sponsor');
  } else {
    await userRepo.removeEntitlementOverride(user._id, 'sponsor');
  }

  elog.info('Sponsor achievement preference updated', {
    userId,
    enabled: input.enabled,
  });

  return { ok: true };
}
