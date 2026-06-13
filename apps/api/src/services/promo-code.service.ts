/**
 * Promotional code service — validation, redemption, and admin management.
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import {
  SUBSCRIPTION_TIER_IDS,
  type SubscriptionTierId,
} from '@adieuu/shared';
import { withTransaction } from '../db/mongo';
import type { PromoCodeDocument, PromoRedemptionDocument, PromoRedemptionStripeAction } from '../models/promo-code';
import {
  getPromoCodeRepository,
  getPromoRedemptionRepository,
} from '../repositories/promo-code.repository';
import { getUserRepository } from '../repositories/user.repository';
import type { UserDocument } from '../models/user';
import { resolveEffectiveAccess } from './billing/resolve-access';
import { checkRateLimit, type RateLimitConfig } from './rate-limit.service';
import { sanitizeString } from '../utils/sanitize';
import { parseJurisdictionList } from './geo/jurisdiction';
import { config } from '../config';
import { PURCHASABLE_PRODUCTS, type StripePriceConfigKey } from '../constants/subscription-tiers';
import elog from '../utils/adieuuLogger';

const PROMO_REDEEM_RATE_LIMIT: RateLimitConfig = { limit: 15, windowSeconds: 3600 };

const SHORTCODE_MAX_LENGTH = 32;
const JURISDICTION_CODE_RE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function sanitizeDescription(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const { value } = sanitizeString(raw.trim(), 'general');
  return value || undefined;
}

function sanitizeEntitlementList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const { value } = sanitizeString(item.trim(), 'alphanumdash');
    if (value && value.length <= 64 && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function normalizeJurisdictionList(raw: string[]): string[] | null {
  const parsed = [...parseJurisdictionList(raw)];
  for (const code of parsed) {
    if (!JURISDICTION_CODE_RE.test(code)) {
      return null;
    }
  }
  return parsed;
}

// Sanitize and normalize to lowercase.
export function normalizePromoShortcode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const { value } = sanitizeString(raw.trim(), 'alphanumdash');
  const shortcode = value.toLowerCase();
  if (!shortcode || shortcode.length > SHORTCODE_MAX_LENGTH) return null;
  return shortcode;
}

function normalizeShortcodeList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const normalized = normalizePromoShortcode(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function isPromoCodeActive(code: PromoCodeDocument, now: Date): boolean {
  if (code.validFrom && now < code.validFrom) return false;
  if (code.validTo && now > code.validTo) return false;
  return true;
}

function isJurisdictionAllowed(code: PromoCodeDocument, userJurisdiction: string | undefined): boolean {
  if (!code.jurisdictions.length) return true;
  if (!userJurisdiction) return false;
  return code.jurisdictions.includes(userJurisdiction);
}

// ---------------------------------------------------------------------------
// Admin schemas
// ---------------------------------------------------------------------------

const PromoSubscriptionGrantSchema = z.object({
  tier: z.enum(SUBSCRIPTION_TIER_IDS as unknown as [string, ...string[]]),
  durationMonths: z.number().int().min(1).max(120),
});

const AUDIENCE_VALUES = ['all', 'first_time', 'unsubscribed'] as const;

export const CreatePromoCodeSchema = z.object({
  shortcode: z.string().min(1).max(SHORTCODE_MAX_LENGTH),
  description: z.string().max(512).optional(),
  subscription: PromoSubscriptionGrantSchema.optional(),
  entitlements: z.array(z.string().min(1).max(64)).default([]),
  requiredCodes: z.array(z.string().min(1).max(SHORTCODE_MAX_LENGTH)).default([]),
  incompatibleCodes: z.array(z.string().min(1).max(SHORTCODE_MAX_LENGTH)).default([]),
  maxUses: z.number().int().min(1).nullable().optional(),
  jurisdictions: z.array(z.string().min(2).max(16)).default([]),
  audience: z.enum(AUDIENCE_VALUES).default('all'),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
});

export const UpdatePromoCodeSchema = CreatePromoCodeSchema.omit({ shortcode: true }).partial();

export const PromoCodeListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

function queryToRecord(query: unknown): Record<string, unknown> {
  if (query instanceof URLSearchParams) {
    return Object.fromEntries(query.entries());
  }
  if (query && typeof query === 'object') {
    return query as Record<string, unknown>;
  }
  return {};
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PromoCodeRedeemReason =
  | 'validation'
  | 'rate_limited'
  | 'not_found'
  | 'expired'
  | 'jurisdiction_restricted'
  | 'max_uses_reached'
  | 'already_redeemed'
  | 'missing_required_codes'
  | 'incompatible_code_redeemed'
  | 'audience_restricted'
  | 'user_not_found'
  | 'internal';

export type RedeemPromoCodeResult =
  | {
      ok: true;
      shortcode: string;
      subscriptionApplied?: { tier: SubscriptionTierId; expiresAt: string };
      entitlementsApplied: string[];
    }
  | { ok: false; reason: PromoCodeRedeemReason };

export interface PublicPromoCode {
  shortcode: string;
  description?: string;
  subscription?: { tier: SubscriptionTierId; durationMonths: number };
  entitlements: string[];
  requiredCodes: string[];
  incompatibleCodes: string[];
  maxUses: number | null;
  currentUses: number;
  jurisdictions: string[];
  audience?: 'all' | 'first_time' | 'unsubscribed';
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicPromoRedemption {
  id: string;
  userId: string;
  shortcode: string;
  redeemedAt: string;
  subscriptionOverrideApplied?: { tier: SubscriptionTierId; expiresAt: string };
  entitlementsApplied: string[];
  stripeAction?: PromoRedemptionStripeAction;
}

function toPublicPromoCode(doc: PromoCodeDocument): PublicPromoCode {
  return {
    shortcode: doc.shortcode,
    description: doc.description,
    subscription: doc.subscription,
    entitlements: doc.entitlements,
    requiredCodes: doc.requiredCodes,
    incompatibleCodes: doc.incompatibleCodes,
    maxUses: doc.maxUses,
    currentUses: doc.currentUses,
    jurisdictions: doc.jurisdictions,
    audience: doc.audience,
    validFrom: doc.validFrom?.toISOString() ?? null,
    validTo: doc.validTo?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toPublicRedemption(doc: PromoRedemptionDocument): PublicPromoRedemption {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    shortcode: doc.shortcode,
    redeemedAt: doc.redeemedAt.toISOString(),
    subscriptionOverrideApplied: doc.subscriptionOverrideApplied
      ? {
          tier: doc.subscriptionOverrideApplied.tier,
          expiresAt: doc.subscriptionOverrideApplied.expiresAt.toISOString(),
        }
      : undefined,
    entitlementsApplied: doc.entitlementsApplied,
    stripeAction: doc.stripeAction,
  };
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Stripe promo helpers
// ---------------------------------------------------------------------------

function getPriceIdForTier(tier: SubscriptionTierId): string | null {
  for (const product of Object.values(PURCHASABLE_PRODUCTS)) {
    if (
      product.checkoutMode === 'subscription' &&
      product.grantsTiers.includes(tier)
    ) {
      return config.stripe?.prices?.[product.priceConfigKey] ?? null;
    }
  }
  return null;
}

async function createPromoTrialSubscription(
  user: UserDocument,
  promoTier: SubscriptionTierId,
  durationMonths: number,
): Promise<{ subscriptionId: string } | null> {
  if (!config.stripe?.enabled) return null;
  const customerId = user.stripeCustomerId;
  if (!customerId) return null;

  const priceId = getPriceIdForTier(promoTier);
  if (!priceId) return null;

  try {
    const { getStripe } = await import('./billing/stripe.client');
    const stripe = getStripe();

    const trialEnd = Math.floor(addMonths(new Date(), durationMonths).getTime() / 1000);

    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_end: trialEnd,
      trial_settings: {
        end_behavior: { missing_payment_method: 'cancel' },
      },
      metadata: { userId: user._id.toHexString(), source: 'promo' },
    });

    return { subscriptionId: sub.id };
  } catch (err) {
    elog.warn('Failed to create promo trial subscription', {
      userId: user._id.toHexString(),
      tier: promoTier,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function applyPromoBalanceCredit(
  user: UserDocument,
  promoTier: SubscriptionTierId,
  durationMonths: number,
  shortcode: string,
): Promise<boolean> {
  if (!config.stripe?.enabled || !user.stripeCustomerId) return false;

  const priceId = getPriceIdForTier(promoTier);
  if (!priceId) return false;

  try {
    const { getStripe } = await import('./billing/stripe.client');
    const stripe = getStripe();

    const price = await stripe.prices.retrieve(priceId);
    if (!price.unit_amount) return false;

    const creditAmount = Math.round((price.unit_amount / 12) * durationMonths);

    await stripe.customers.createBalanceTransaction(user.stripeCustomerId, {
      amount: -creditAmount,
      currency: price.currency,
      description: `Promo credit (${shortcode}): ${durationMonths} months`,
    });

    return true;
  } catch (err) {
    elog.warn('Failed to apply promo balance credit', {
      userId: user._id.toHexString(),
      shortcode,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function checkAudienceRestriction(
  code: PromoCodeDocument,
  user: UserDocument,
): PromoCodeRedeemReason | null {
  const audience = code.audience ?? 'all';

  if (audience === 'first_time') {
    const hadSubscription =
      !!user.billing?.stripeSubscriptionId ||
      (user.subscriptionOverrides?.length ?? 0) > 0;
    if (hadSubscription) return 'audience_restricted';
  }

  if (audience === 'unsubscribed') {
    const resolved = resolveEffectiveAccess(user);
    if (resolved.subscriptions.length > 0) return 'audience_restricted';
  }

  return null;
}

function determineStripeAction(
  code: PromoCodeDocument,
  user: UserDocument,
): 'trial' | 'credit' | 'override' {
  if (!code.subscription || !config.stripe?.enabled) return 'override';

  const userTiers = user.billing?.activeSubscriptions ?? [];
  const hasMatchingStripeSub =
    !!user.billing?.stripeSubscriptionId &&
    userTiers.includes(code.subscription.tier);

  if (hasMatchingStripeSub) return 'credit';
  if (!userTiers.length && user.stripeCustomerId) return 'trial';
  return 'override';
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

export async function redeemPromoCode(
  userId: string,
  rawShortcode: unknown,
): Promise<RedeemPromoCodeResult> {
  const shortcode = normalizePromoShortcode(rawShortcode);
  if (!shortcode) {
    return { ok: false, reason: 'validation' };
  }

  const rate = await checkRateLimit('promo_redeem', userId, PROMO_REDEEM_RATE_LIMIT);
  if (!rate.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) {
    return { ok: false, reason: 'user_not_found' };
  }

  const promoRepo = getPromoCodeRepository();
  const redemptionRepo = getPromoRedemptionRepository();

  const code = await promoRepo.findByShortcode(shortcode);
  if (!code) {
    return { ok: false, reason: 'not_found' };
  }

  const now = new Date();
  if (!isPromoCodeActive(code, now)) {
    return { ok: false, reason: 'expired' };
  }

  if (!isJurisdictionAllowed(code, user.geo?.jurisdiction)) {
    return { ok: false, reason: 'jurisdiction_restricted' };
  }

  const audienceRejection = checkAudienceRestriction(code, user);
  if (audienceRejection) {
    return { ok: false, reason: audienceRejection };
  }

  if (code.maxUses !== null && code.currentUses >= code.maxUses) {
    return { ok: false, reason: 'max_uses_reached' };
  }

  const userObjectId = user._id;
  const existing = await redemptionRepo.findByUserAndShortcode(userObjectId, shortcode);
  if (existing) {
    return { ok: false, reason: 'already_redeemed' };
  }

  const userRedeemed = new Set(await redemptionRepo.findShortcodesByUser(userObjectId));

  for (const required of code.requiredCodes) {
    if (!userRedeemed.has(required)) {
      return { ok: false, reason: 'missing_required_codes' };
    }
  }

  for (const incompatible of code.incompatibleCodes) {
    if (userRedeemed.has(incompatible)) {
      return { ok: false, reason: 'incompatible_code_redeemed' };
    }
  }

  let stripeAction: PromoRedemptionStripeAction = determineStripeAction(code, user);

  if (code.subscription && stripeAction === 'credit') {
    const credited = await applyPromoBalanceCredit(
      user,
      code.subscription.tier as SubscriptionTierId,
      code.subscription.durationMonths,
      shortcode,
    );
    if (!credited) stripeAction = 'override';
  }

  if (code.subscription && stripeAction === 'trial') {
    const trial = await createPromoTrialSubscription(
      user,
      code.subscription.tier as SubscriptionTierId,
      code.subscription.durationMonths,
    );
    if (!trial) stripeAction = 'override';
  }

  const subscriptionOverrideApplied =
    code.subscription && stripeAction === 'override'
      ? {
          tier: code.subscription.tier as SubscriptionTierId,
          expiresAt: addMonths(now, code.subscription.durationMonths),
        }
      : undefined;

  const entitlementsApplied = [...code.entitlements];

  try {
    await withTransaction(async (session) => {
      const incremented = await promoRepo.tryIncrementUses(shortcode, session);
      if (!incremented) {
        throw new Error('max_uses_reached');
      }

      await redemptionRepo.createRedemption(
        {
          userId: userObjectId,
          shortcode,
          redeemedAt: now,
          subscriptionOverrideApplied,
          entitlementsApplied,
          stripeAction: code.subscription ? stripeAction : undefined,
        },
        { session },
      );

      if (subscriptionOverrideApplied) {
        await userRepo.addSubscriptionOverride(userId, subscriptionOverrideApplied);
      }

      for (const entitlement of entitlementsApplied) {
        await userRepo.addEntitlementOverride(userId, entitlement);
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'max_uses_reached') {
      return { ok: false, reason: 'max_uses_reached' };
    }

    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      return { ok: false, reason: 'already_redeemed' };
    }

    elog.error('Promo code redemption failed', { userId, shortcode, error });
    return { ok: false, reason: 'internal' };
  }

  elog.info('Promo code redeemed', {
    userId,
    shortcode,
    tier: code.subscription?.tier,
    stripeAction: code.subscription ? stripeAction : undefined,
    entitlements: entitlementsApplied,
  });

  return {
    ok: true,
    shortcode,
    subscriptionApplied: subscriptionOverrideApplied
      ? {
          tier: subscriptionOverrideApplied.tier,
          expiresAt: subscriptionOverrideApplied.expiresAt.toISOString(),
        }
      : code.subscription
        ? {
            tier: code.subscription.tier as SubscriptionTierId,
            expiresAt: addMonths(now, code.subscription.durationMonths).toISOString(),
          }
        : undefined,
    entitlementsApplied,
  };
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export type AdminPromoCodeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'validation_failed' | 'not_found' | 'conflict' | 'internal' };

export async function listPromoCodesAdmin(
  query: unknown,
): Promise<AdminPromoCodeResult<{ codes: PublicPromoCode[]; total: number }>> {
  const parsed = PromoCodeListQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const limit = parsed.data.limit ?? 50;
  const offset = parsed.data.offset ?? 0;
  const repo = getPromoCodeRepository();
  const { codes, total } = await repo.listPaginated(offset, limit);

  return {
    ok: true,
    data: {
      codes: codes.map(toPublicPromoCode),
      total,
    },
  };
}

export async function createPromoCodeAdmin(
  body: unknown,
): Promise<AdminPromoCodeResult<PublicPromoCode>> {
  const parsed = CreatePromoCodeSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const shortcode = normalizePromoShortcode(parsed.data.shortcode);
  if (!shortcode) {
    return { ok: false, reason: 'validation_failed' };
  }

  const repo = getPromoCodeRepository();
  const existing = await repo.findByShortcode(shortcode);
  if (existing) {
    return { ok: false, reason: 'conflict' };
  }

  const validFrom = parseOptionalDate(parsed.data.validFrom);
  const validTo = parseOptionalDate(parsed.data.validTo);
  if (validFrom && validTo && validFrom > validTo) {
    return { ok: false, reason: 'validation_failed' };
  }

  const jurisdictions = normalizeJurisdictionList(parsed.data.jurisdictions);
  if (jurisdictions === null) {
    return { ok: false, reason: 'validation_failed' };
  }

  try {
    const doc = await repo.createCode({
      shortcode,
      description: sanitizeDescription(parsed.data.description),
      subscription: parsed.data.subscription
        ? {
            tier: parsed.data.subscription.tier as SubscriptionTierId,
            durationMonths: parsed.data.subscription.durationMonths,
          }
        : undefined,
      entitlements: sanitizeEntitlementList(parsed.data.entitlements),
      requiredCodes: normalizeShortcodeList(parsed.data.requiredCodes),
      incompatibleCodes: normalizeShortcodeList(parsed.data.incompatibleCodes),
      maxUses: parsed.data.maxUses ?? null,
      currentUses: 0,
      jurisdictions,
      audience: parsed.data.audience === 'all' ? undefined : parsed.data.audience,
      validFrom,
      validTo,
    });

    return { ok: true, data: toPublicPromoCode(doc) };
  } catch (error) {
    const mongoError = error as { code?: number };
    if (mongoError.code === 11000) {
      return { ok: false, reason: 'conflict' };
    }
    elog.error('Failed to create promo code', { shortcode, error });
    return { ok: false, reason: 'internal' };
  }
}

export async function updatePromoCodeAdmin(
  shortcodeParam: string,
  body: unknown,
): Promise<AdminPromoCodeResult<PublicPromoCode>> {
  const shortcode = normalizePromoShortcode(shortcodeParam);
  if (!shortcode) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = UpdatePromoCodeSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const repo = getPromoCodeRepository();
  const existing = await repo.findByShortcode(shortcode);
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }

  const update: Partial<PromoCodeDocument> = {};

  if (parsed.data.description !== undefined) {
    update.description = sanitizeDescription(parsed.data.description);
  }
  if (parsed.data.subscription !== undefined) {
    update.subscription = parsed.data.subscription
      ? {
          tier: parsed.data.subscription.tier as SubscriptionTierId,
          durationMonths: parsed.data.subscription.durationMonths,
        }
      : undefined;
  }
  if (parsed.data.entitlements !== undefined) {
    update.entitlements = sanitizeEntitlementList(parsed.data.entitlements);
  }
  if (parsed.data.requiredCodes !== undefined) {
    update.requiredCodes = normalizeShortcodeList(parsed.data.requiredCodes);
  }
  if (parsed.data.incompatibleCodes !== undefined) {
    update.incompatibleCodes = normalizeShortcodeList(parsed.data.incompatibleCodes);
  }
  if (parsed.data.maxUses !== undefined) {
    if (
      parsed.data.maxUses !== null &&
      parsed.data.maxUses < existing.currentUses
    ) {
      return { ok: false, reason: 'validation_failed' };
    }
    update.maxUses = parsed.data.maxUses;
  }
  if (parsed.data.jurisdictions !== undefined) {
    const jurisdictions = normalizeJurisdictionList(parsed.data.jurisdictions);
    if (jurisdictions === null) {
      return { ok: false, reason: 'validation_failed' };
    }
    update.jurisdictions = jurisdictions;
  }
  if (parsed.data.audience !== undefined) {
    update.audience = parsed.data.audience === 'all' ? undefined : parsed.data.audience;
  }

  const validFrom =
    parsed.data.validFrom !== undefined
      ? parseOptionalDate(parsed.data.validFrom)
      : existing.validFrom;
  const validTo =
    parsed.data.validTo !== undefined
      ? parseOptionalDate(parsed.data.validTo)
      : existing.validTo;

  if (parsed.data.validFrom !== undefined) {
    update.validFrom = validFrom;
  }
  if (parsed.data.validTo !== undefined) {
    update.validTo = validTo;
  }

  if (validFrom && validTo && validFrom > validTo) {
    return { ok: false, reason: 'validation_failed' };
  }

  const updated = await repo.updateByShortcode(shortcode, update);
  if (!updated) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true, data: toPublicPromoCode(updated) };
}

export async function deletePromoCodeAdmin(
  shortcodeParam: string,
): Promise<AdminPromoCodeResult<{ deleted: boolean }>> {
  const shortcode = normalizePromoShortcode(shortcodeParam);
  if (!shortcode) {
    return { ok: false, reason: 'validation_failed' };
  }

  const repo = getPromoCodeRepository();
  const deleted = await repo.deleteByShortcode(shortcode);
  if (!deleted) {
    return { ok: false, reason: 'not_found' };
  }

  return { ok: true, data: { deleted: true } };
}

export async function listPromoRedemptionsAdmin(
  shortcodeParam: string,
  query: unknown,
): Promise<AdminPromoCodeResult<{ redemptions: PublicPromoRedemption[]; total: number }>> {
  const shortcode = normalizePromoShortcode(shortcodeParam);
  if (!shortcode) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = PromoCodeListQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const promoRepo = getPromoCodeRepository();
  const code = await promoRepo.findByShortcode(shortcode);
  if (!code) {
    return { ok: false, reason: 'not_found' };
  }

  const limit = parsed.data.limit ?? 50;
  const offset = parsed.data.offset ?? 0;
  const redemptionRepo = getPromoRedemptionRepository();
  const { redemptions, total } = await redemptionRepo.listByShortcode(shortcode, offset, limit);

  return {
    ok: true,
    data: {
      redemptions: redemptions.map(toPublicRedemption),
      total,
    },
  };
}
