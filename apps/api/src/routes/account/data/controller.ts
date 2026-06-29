/**
 * Account data controller.
 *
 * Handles data export (GDPR portability) and account deletion with
 * OTP-verified double-confirmation.
 *
 * @module routes/account/data/controller
 */

import { ObjectId } from 'mongodb';
import { getCollection, Collections, withTransaction } from '../../../db';
import { getUserRepository } from '../../../repositories/user.repository';
import { generateAccountHash } from '../../../services/account-token.service';
import {
  destroyAllSessions,
  buildAuthClearCookies,
} from '../../../services/session.service';
import { createOtp, verifyOtp } from '../../../services/otp.service';
import { sendEmail } from '../../../services/messaging';
import { getEmailTemplate, type Locale, DEFAULT_LOCALE } from '../../../i18n';
import { checkRateLimit } from '../../../services/rate-limit.service';
import { createHmac } from 'crypto';
import { config } from '../../../config';
import elog from '../../../utils/adieuuLogger';
import type { UserDocument } from '../../../models/user';
import type { DeletedEmailDocument } from '../../../models/deleted-email';

const APP_NAME = 'Adieuu';
const OTP_EXPIRES_IN_MINUTES = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashEmailForDeletion(email: string): string {
  return createHmac('sha256', config.security.accountHashSecret)
    .update(email.toLowerCase())
    .digest('hex');
}

function stripOidFields<T extends Record<string, unknown>>(doc: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v instanceof ObjectId) {
      out[k] = v.toHexString();
    } else if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item && typeof item === 'object' ? stripOidFields(item as Record<string, unknown>) : item,
      );
    } else if (v && typeof v === 'object' && !(v instanceof Date)) {
      out[k] = stripOidFields(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data Export
// ---------------------------------------------------------------------------

export interface AccountDataExport {
  account: Record<string, unknown>;
  sessions: Record<string, unknown>[];
  mfaTotp: Record<string, unknown>[];
  mfaWebAuthn: Record<string, unknown>[];
  preferences: Record<string, unknown> | null;
  ageVerifications: Record<string, unknown>[];
  auditLogs: Record<string, unknown>[];
  referralCodes: Record<string, unknown>[];
  referralAttributions: Record<string, unknown>[];
  promoRedemptions: Record<string, unknown>[];
  sponsorshipRequests: Record<string, unknown>[];
  sponsorshipLogs: Record<string, unknown>[];
  supportTickets: Record<string, unknown>[];
  identityCount: number;
  exportedAt: string;
}

/**
 * Gathers all account-scoped data for export.
 */
export async function gatherAccountData(
  userId: string,
  user: UserDocument,
): Promise<AccountDataExport> {
  const oid = new ObjectId(userId);

  const [
    sessions,
    totpCreds,
    webauthnCreds,
    preferences,
    ageVerifications,
    auditLogs,
    referralCodes,
    referralAttributions,
    promoRedemptions,
    sponsorshipRequests,
    sponsorshipLogs,
    supportTickets,
    identityCountDoc,
  ] = await Promise.all([
    getCollection(Collections.SESSIONS)
      .find({ userId: oid, type: 'account', revoked: { $ne: true } })
      .project({ sessionId: 0 })
      .toArray(),
    getCollection(Collections.TOTP_CREDENTIALS)
      .find({ userId: oid })
      .project({ secret: 0 })
      .toArray(),
    getCollection(Collections.WEBAUTHN_CREDENTIALS)
      .find({ userId: oid })
      .project({ credentialPublicKey: 0 })
      .toArray(),
    getCollection(Collections.USER_PREFERENCES).findOne({ userId: oid }),
    getCollection(Collections.AGE_VERIFICATIONS).find({ userId: oid }).toArray(),
    getCollection(Collections.AUDIT_LOGS)
      .find({ userId: oid })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray(),
    getCollection(Collections.REFERRAL_CODES).find({ userId: oid }).toArray(),
    getCollection(Collections.REFERRAL_ATTRIBUTIONS)
      .find({ $or: [{ referrerId: oid }, { referredUserId: oid }] })
      .toArray(),
    getCollection(Collections.PROMO_REDEMPTIONS).find({ userId: oid }).toArray(),
    getCollection(Collections.SPONSORSHIP_REQUESTS).find({ userId: oid }).toArray(),
    getCollection(Collections.SPONSORSHIP_LOGS)
      .find({ $or: [{ recipientUserId: oid }, { sponsorUserId: oid }] })
      .toArray(),
    getCollection(Collections.SUPPORT_TICKETS)
      .find({ submitterId: userId, submitterType: 'account' })
      .toArray(),
    getCollection(Collections.IDENTITY_COUNTS).findOne({
      accountHash: generateAccountHash(userId, user.createdAt),
    }),
  ]);

  const { stripeCustomerId, ...safeUser } = user as UserDocument & { stripeCustomerId?: string };

  return {
    account: stripOidFields(safeUser as unknown as Record<string, unknown>),
    sessions: sessions.map((s) => stripOidFields(s as unknown as Record<string, unknown>)),
    mfaTotp: totpCreds.map((c) => stripOidFields(c as unknown as Record<string, unknown>)),
    mfaWebAuthn: webauthnCreds.map((c) => stripOidFields(c as unknown as Record<string, unknown>)),
    preferences: preferences
      ? stripOidFields(preferences as unknown as Record<string, unknown>)
      : null,
    ageVerifications: ageVerifications.map((a) =>
      stripOidFields(a as unknown as Record<string, unknown>),
    ),
    auditLogs: auditLogs.map((a) => stripOidFields(a as unknown as Record<string, unknown>)),
    referralCodes: referralCodes.map((r) =>
      stripOidFields(r as unknown as Record<string, unknown>),
    ),
    referralAttributions: referralAttributions.map((r) =>
      stripOidFields(r as unknown as Record<string, unknown>),
    ),
    promoRedemptions: promoRedemptions.map((p) =>
      stripOidFields(p as unknown as Record<string, unknown>),
    ),
    sponsorshipRequests: sponsorshipRequests.map((s) =>
      stripOidFields(s as unknown as Record<string, unknown>),
    ),
    sponsorshipLogs: sponsorshipLogs.map((s) =>
      stripOidFields(s as unknown as Record<string, unknown>),
    ),
    supportTickets: supportTickets.map((t) =>
      stripOidFields(t as unknown as Record<string, unknown>),
    ),
    identityCount: identityCountDoc?.count ?? 0,
    exportedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Deletion request (send OTP)
// ---------------------------------------------------------------------------

export type DeleteRequestResult =
  | { ok: true }
  | { ok: false; reason: 'rate_limited' | 'no_email' | 'internal' };

export async function requestAccountDeletion(
  userId: string,
  ip: string,
): Promise<DeleteRequestResult> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user?.email) {
    return { ok: false, reason: 'no_email' };
  }

  const limit = await checkRateLimit('account_delete', userId, {
    limit: 3,
    windowSeconds: 15 * 60,
  });
  if (!limit.allowed) {
    return { ok: false, reason: 'rate_limited' };
  }

  const otp = await createOtp(user.email, 'email');
  if (!otp) {
    return { ok: false, reason: 'internal' };
  }

  sendDeletionOtpEmail(user.email, otp).catch((err) => {
    elog.error('Failed to send account deletion OTP email', {
      error: err instanceof Error ? err.message : String(err),
      userId,
    });
  });

  return { ok: true };
}

async function sendDeletionOtpEmail(
  email: string,
  otp: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<void> {
  const template = getEmailTemplate('otpAccountDeletion', locale, {
    appName: APP_NAME,
    otp,
    expiresInMinutes: OTP_EXPIRES_IN_MINUTES,
  });

  await sendEmail({
    to: email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

// ---------------------------------------------------------------------------
// Deletion confirmation (verify OTP + cleanup)
// ---------------------------------------------------------------------------

export type DeleteConfirmResult =
  | { ok: true; cookies: string[] }
  | { ok: false; reason: 'invalid_code' | 'user_not_found' | 'no_email' | 'internal' };

export async function confirmAccountDeletion(
  userId: string,
  code: string,
): Promise<DeleteConfirmResult> {
  const userRepo = getUserRepository();
  const user = await userRepo.findById(userId);
  if (!user) {
    return { ok: false, reason: 'user_not_found' };
  }

  if (!user.email) {
    return { ok: false, reason: 'no_email' };
  }

  const otpResult = await verifyOtp(user.email, code);
  if (!otpResult.valid) {
    return { ok: false, reason: 'invalid_code' };
  }

  try {
    await performAccountDeletion(userId, user);
  } catch (err) {
    elog.error('Account deletion failed', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'internal' };
  }

  elog.info('Account deleted', { userId });

  return { ok: true, cookies: buildAuthClearCookies() };
}

async function performAccountDeletion(
  userId: string,
  user: UserDocument,
): Promise<void> {
  const oid = new ObjectId(userId);

  // Cancel Stripe subscription if active (outside transaction -- Stripe is
  // external and GDPR deletion must not be blocked by a Stripe outage)
  if (config.stripe?.enabled && user.stripeCustomerId) {
    try {
      const { getStripe } = await import('../../../services/billing/stripe.client');
      const stripe = getStripe();
      if (stripe) {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
        });
        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      }
    } catch (err) {
      elog.warn('Failed to cancel Stripe subscriptions during account deletion', {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Destroy all sessions (Mongo + Redis -- outside transaction since Redis
  // is not transactional)
  await destroyAllSessions(userId);

  // All Mongo mutations in one transaction so a crash cannot leave a
  // partially-deleted account
  await withTransaction(async (session) => {
    if (user.email) {
      const emailHash = hashEmailForDeletion(user.email);
      await getCollection<DeletedEmailDocument>(Collections.DELETED_EMAILS).updateOne(
        { emailHash },
        { $setOnInsert: { emailHash, deletedAt: new Date(), createdAt: new Date(), updatedAt: new Date() } },
        { upsert: true, session },
      );
    }

    await Promise.all([
      getCollection(Collections.TOTP_CREDENTIALS).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.WEBAUTHN_CREDENTIALS).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.USER_PREFERENCES).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.AGE_VERIFICATIONS).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.REFERRAL_CODES).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.REFERRAL_ATTRIBUTIONS).deleteMany(
        { $or: [{ referrerId: oid }, { referredUserId: oid }] },
        { session },
      ),
      getCollection(Collections.PROMO_REDEMPTIONS).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.SPONSORSHIP_REQUESTS).deleteMany({ userId: oid }, { session }),
      getCollection(Collections.SPONSORSHIP_LOGS).deleteMany(
        { $or: [{ recipientUserId: oid }, { sponsorUserId: oid }] },
        { session },
      ),
      getCollection(Collections.AUDIT_LOGS).updateMany(
        { userId: oid },
        { $unset: { userId: '' }, $set: { anonymisedAt: new Date() } },
        { session },
      ),
      getCollection(Collections.SUPPORT_TICKETS).updateMany(
        { submitterId: userId, submitterType: 'account' },
        { $unset: { submitterId: '' }, $set: { submitterType: 'deleted_account', anonymisedAt: new Date() } },
        { session },
      ),
    ]);

    await getCollection(Collections.USERS).deleteOne({ _id: oid }, { session });
  });
}

// ---------------------------------------------------------------------------
// Check if an email hash exists in deleted_emails
// ---------------------------------------------------------------------------

export async function isEmailDeleted(
  email: string,
  options?: { session?: import('mongodb').ClientSession },
): Promise<boolean> {
  const emailHash = hashEmailForDeletion(email);
  const doc = await getCollection<DeletedEmailDocument>(Collections.DELETED_EMAILS).findOne(
    { emailHash },
    { session: options?.session },
  );
  return doc !== null;
}
