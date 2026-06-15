/**
 * Referral program service — code management, redemption, and credit granting.
 */

import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import {
  getReferralAttributionRepository,
  getReferralCodeRepository,
  MAX_ACTIVE_CODES_PER_USER,
} from '../repositories/referral.repository';
import { getUserRepository } from '../repositories/user.repository';
import { getPromoRedemptionRepository } from '../repositories/promo-code.repository';
import { withTransaction, Collections, getCollection } from '../db/mongo';
import { checkRateLimit, type RateLimitConfig } from './rate-limit.service';
import { sanitizeString } from '../utils/sanitize';
import { config } from '../config';
import { getOrCreateStripeCustomer } from './billing/billing.service';
import elog from '../utils/adieuuLogger';
import type { ReferralAttributionDocument, ReferralCodeDocument } from '../models/referral';
import type { UserDocument } from '../models/user';

const CODE_MIN_LENGTH = 3;
const CODE_MAX_LENGTH = 24;
const CUSTOM_MESSAGE_MAX_LENGTH = 300;
const RANDOM_CODE_LENGTH = 8;

const REFERRAL_REDEEM_RATE_LIMIT: RateLimitConfig = { limit: 10, windowSeconds: 3600 };
const REFERRAL_CREATE_RATE_LIMIT: RateLimitConfig = { limit: 5, windowSeconds: 86400 };

const CODE_FORMAT_RE = /^[a-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const { value } = sanitizeString(raw.trim(), 'alphanumdash');
  const code = value.toLowerCase();
  if (!code || code.length < CODE_MIN_LENGTH || code.length > CODE_MAX_LENGTH) return null;
  if (!CODE_FORMAT_RE.test(code)) return null;
  return code;
}

export function sanitizeReferralCustomMessage(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const { value } = sanitizeString(trimmed.slice(0, CUSTOM_MESSAGE_MAX_LENGTH), 'general');
  const cleaned = value.trim();
  return cleaned || undefined;
}

async function generateUniqueRandomCode(): Promise<string> {
  const codeRepo = getReferralCodeRepository();
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = randomBytes(RANDOM_CODE_LENGTH);
    const code = [...bytes]
      .map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36])
      .join('');
    if (!(await codeRepo.isCodeReserved(code))) {
      return code;
    }
  }
  throw new Error('Failed to generate unique referral code');
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ReferralCreateReason =
  | 'validation'
  | 'rate_limited'
  | 'user_not_found'
  | 'code_limit_reached'
  | 'code_taken'
  | 'invalid_message';

export type ReferralUpdateReason =
  | 'validation'
  | 'user_not_found'
  | 'not_found'
  | 'code_taken'
  | 'invalid_message';

export type ReferralDeleteReason = 'validation' | 'user_not_found' | 'not_found';

export type ReferralRedeemReason =
  | 'validation'
  | 'rate_limited'
  | 'user_not_found'
  | 'invalid_code'
  | 'self_referral'
  | 'already_referred';

export interface PublicReferralCode {
  id: string;
  code: string;
  customMessage?: string;
  useCount: number;
  signupCount: number;
  subscriptionCount: number;
  createdAt: string;
}

export interface ReferralStatsResult {
  codes: PublicReferralCode[];
  totalSignups: number;
  totalSubscriptions: number;
  hasBeenReferred: boolean;
  referredBy?: { code: string; date: string };
}

export interface ReferralLandingResult {
  valid: boolean;
  customMessage?: string;
}

function toPublicReferralCode(doc: ReferralCodeDocument): PublicReferralCode {
  return {
    id: doc._id.toHexString(),
    code: doc.code,
    customMessage: doc.customMessage,
    useCount: doc.useCount,
    signupCount: doc.signupCount,
    subscriptionCount: doc.subscriptionCount,
    createdAt: doc.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Code management
// ---------------------------------------------------------------------------

export async function getReferralStats(userId: string): Promise<ReferralStatsResult | null> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return null;

  const codeRepo = getReferralCodeRepository();
  const attributionRepo = getReferralAttributionRepository();

  const codes = await codeRepo.findActiveByUserId(user._id);
  const publicCodes = codes.map(toPublicReferralCode);

  let referredBy: ReferralStatsResult['referredBy'];
  const hasBeenReferred = !!user.referredBy;

  if (hasBeenReferred) {
    const attribution = await attributionRepo.findByReferredUserId(user._id);
    if (attribution) {
      referredBy = {
        code: attribution.code,
        date: attribution.attributedAt.toISOString(),
      };
    }
  }

  return {
    codes: publicCodes,
    totalSignups: publicCodes.reduce((sum, c) => sum + c.signupCount, 0),
    totalSubscriptions: publicCodes.reduce((sum, c) => sum + c.subscriptionCount, 0),
    hasBeenReferred,
    referredBy,
  };
}

export async function createReferralCode(
  userId: string,
  rawCode?: unknown,
  rawMessage?: unknown,
): Promise<
  | { ok: true; code: PublicReferralCode }
  | { ok: false; reason: ReferralCreateReason }
> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const rate = await checkRateLimit('referral_create', userId, REFERRAL_CREATE_RATE_LIMIT);
  if (!rate.allowed) return { ok: false, reason: 'rate_limited' };

  const customMessage = sanitizeReferralCustomMessage(rawMessage);
  if (rawMessage != null && rawMessage !== '' && customMessage === undefined) {
    return { ok: false, reason: 'invalid_message' };
  }

  const codeRepo = getReferralCodeRepository();
  const activeCount = await codeRepo.countActiveByUserId(user._id);
  if (activeCount >= MAX_ACTIVE_CODES_PER_USER) {
    return { ok: false, reason: 'code_limit_reached' };
  }

  let code: string;
  if (rawCode === undefined || rawCode === null || rawCode === '') {
    code = await generateUniqueRandomCode();
  } else {
    const normalized = normalizeReferralCode(rawCode);
    if (!normalized) return { ok: false, reason: 'validation' };
    if (await codeRepo.isCodeReserved(normalized)) {
      return { ok: false, reason: 'code_taken' };
    }
    code = normalized;
  }

  const doc = await codeRepo.createCode({
    userId: user._id,
    code,
    previousVersions: [],
    customMessage,
    useCount: 0,
    signupCount: 0,
    subscriptionCount: 0,
    isDeleted: false,
  });

  return { ok: true, code: toPublicReferralCode(doc) };
}

export async function updateReferralCode(
  userId: string,
  codeId: string,
  updates: { code?: unknown; customMessage?: unknown },
): Promise<
  | { ok: true; code: PublicReferralCode }
  | { ok: false; reason: ReferralUpdateReason }
> {
  if (!ObjectId.isValid(codeId)) return { ok: false, reason: 'validation' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const codeRepo = getReferralCodeRepository();
  const existing = await codeRepo.findOwnedCode(user._id, new ObjectId(codeId));
  if (!existing) return { ok: false, reason: 'not_found' };

  const patch: Partial<
    Pick<ReferralCodeDocument, 'code' | 'customMessage' | 'previousVersions'>
  > = {};

  if (updates.customMessage !== undefined) {
    const customMessage = sanitizeReferralCustomMessage(updates.customMessage);
    if (updates.customMessage !== null && updates.customMessage !== '' && customMessage === undefined) {
      return { ok: false, reason: 'invalid_message' };
    }
    patch.customMessage = customMessage;
  }

  if (updates.code !== undefined) {
    const normalized = normalizeReferralCode(updates.code);
    if (!normalized) return { ok: false, reason: 'validation' };
    if (normalized === existing.code) {
      // no-op code change
    } else {
      if (await codeRepo.isCodeReserved(normalized)) {
        return { ok: false, reason: 'code_taken' };
      }
      patch.previousVersions = [...existing.previousVersions, existing.code];
      patch.code = normalized;
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true, code: toPublicReferralCode(existing) };
  }

  const updated = await codeRepo.updateOwnedCode(user._id, existing._id, patch);
  if (!updated) return { ok: false, reason: 'not_found' };

  return { ok: true, code: toPublicReferralCode(updated) };
}

export async function deleteReferralCode(
  userId: string,
  codeId: string,
): Promise<{ ok: true } | { ok: false; reason: ReferralDeleteReason }> {
  if (!ObjectId.isValid(codeId)) return { ok: false, reason: 'validation' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  const codeRepo = getReferralCodeRepository();
  const existing = await codeRepo.findOwnedCode(user._id, new ObjectId(codeId));
  if (!existing) return { ok: false, reason: 'not_found' };

  const now = new Date();
  await codeRepo.updateOwnedCode(user._id, existing._id, {
    isDeleted: true,
    deletedAt: now,
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Public landing
// ---------------------------------------------------------------------------

export async function getReferralLandingData(rawCode: string): Promise<ReferralLandingResult> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { valid: false };

  const codeRepo = getReferralCodeRepository();
  const doc = await codeRepo.findByCode(code);
  if (!doc || doc.isDeleted) {
    return { valid: false };
  }

  await codeRepo.incrementUseCount(code);

  return {
    valid: true,
    customMessage: doc.customMessage,
  };
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

export async function redeemReferralCode(
  userId: string,
  rawCode: unknown,
): Promise<
  | { ok: true; code: string; attributedAt: string }
  | { ok: false; reason: ReferralRedeemReason }
> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: 'validation' };

  const rate = await checkRateLimit('referral_redeem', userId, REFERRAL_REDEEM_RATE_LIMIT);
  if (!rate.allowed) return { ok: false, reason: 'rate_limited' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) return { ok: false, reason: 'user_not_found' };

  if (user.referredBy) return { ok: false, reason: 'already_referred' };

  const attributionRepo = getReferralAttributionRepository();
  const existingAttribution = await attributionRepo.findByReferredUserId(user._id);
  if (existingAttribution) return { ok: false, reason: 'already_referred' };

  const codeRepo = getReferralCodeRepository();
  const referralCode = await codeRepo.findByCode(code);
  if (!referralCode || referralCode.isDeleted) {
    return { ok: false, reason: 'invalid_code' };
  }

  if (referralCode.userId.equals(user._id)) {
    return { ok: false, reason: 'self_referral' };
  }

  const promoRedemptionRepo = getPromoRedemptionRepository();
  const promoRedemptions = await promoRedemptionRepo.findAllByUser(user._id);
  const promoBlockedCredit = promoRedemptions.length > 0;

  const now = new Date();

  try {
    await withTransaction(async (session) => {
      await attributionRepo.createAttribution(
        {
          referrerId: referralCode.userId,
          referredUserId: user._id,
          referralCodeId: referralCode._id,
          code: referralCode.code,
          attributedAt: now,
          creditGranted: false,
          promoBlockedCredit,
        },
        session,
      );

      await codeRepo.incrementSignupCount(referralCode._id, session);

      const users = getCollection<UserDocument>(Collections.USERS);
      await users.updateOne(
        { _id: user._id },
        { $set: { referredBy: referralCode.userId, updatedAt: new Date() } },
        { session },
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes('duplicate key')) {
      return { ok: false, reason: 'already_referred' };
    }
    throw err;
  }

  return { ok: true, code: referralCode.code, attributedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Credit granting (webhook)
// ---------------------------------------------------------------------------

async function calculateReferralCreditCents(): Promise<number | null> {
  if (!config.stripe?.enabled) return null;

  const priceId = config.stripe.prices?.accessAnnual;
  if (!priceId) return null;

  try {
    const { getStripe } = await import('./billing/stripe.client');
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    if (!price.unit_amount) return null;
    return Math.round(price.unit_amount / 12);
  } catch (err) {
    elog.warn('Failed to retrieve Access price for referral credit', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function grantReferralCreditForPayment(
  referredUserId: string,
  amountPaidCents: number,
): Promise<{ granted: boolean; creditAmountCents?: number }> {
  if (amountPaidCents <= 0) return { granted: false };

  const userRepo = getUserRepository();
  const referredUser = await userRepo.findById(referredUserId);
  if (!referredUser) return { granted: false };

  const attributionRepo = getReferralAttributionRepository();
  const attribution = await attributionRepo.findPendingCreditByReferredUserId(referredUser._id);
  if (!attribution) return { granted: false };

  const creditAmountCents = await calculateReferralCreditCents();
  if (creditAmountCents == null || creditAmountCents <= 0) {
    elog.warn('Referral credit skipped — unable to calculate credit amount', {
      referredUserId,
    });
    return { granted: false };
  }

  const referrer = await userRepo.findById(attribution.referrerId);
  if (!referrer) {
    elog.warn('Referral credit skipped — referrer not found', {
      referredUserId,
      referrerId: attribution.referrerId.toHexString(),
    });
    return { granted: false };
  }

  if (config.stripe?.enabled) {
    try {
      const customerId = await getOrCreateStripeCustomer(referrer);
      const { getStripe } = await import('./billing/stripe.client');
      const stripe = getStripe();
      const priceId = config.stripe.prices?.accessAnnual;
      const price = priceId ? await stripe.prices.retrieve(priceId) : null;
      const currency = price?.currency ?? 'usd';

      const idempotencyKey = `referral_credit_${attribution._id.toHexString()}`;
      await stripe.customers.createBalanceTransaction(
        customerId,
        {
          amount: -creditAmountCents,
          currency,
          description: `Referral credit (${attribution.code})`,
          metadata: {
            referredUserId: referredUser._id.toHexString(),
            referralCode: attribution.code,
            source: 'referral',
          },
        },
        { idempotencyKey },
      );
    } catch (err) {
      elog.error('Failed to apply referral balance credit', {
        referredUserId,
        referrerId: attribution.referrerId.toHexString(),
        error: err instanceof Error ? err.message : String(err),
      });
      return { granted: false };
    }
  }

  const codeRepo = getReferralCodeRepository();

  await withTransaction(async (session) => {
    const updated = await attributionRepo.markCreditGranted(
      attribution._id,
      creditAmountCents,
      session,
    );
    if (!updated) {
      throw new Error('Referral attribution already credited');
    }
    await codeRepo.incrementSubscriptionCount(attribution.referralCodeId, session);
  });

  elog.info('Referral credit granted', {
    referredUserId,
    referrerId: attribution.referrerId.toHexString(),
    creditAmountCents,
    code: attribution.code,
  });

  return { granted: true, creditAmountCents };
}
