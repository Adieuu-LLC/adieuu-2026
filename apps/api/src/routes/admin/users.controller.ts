/**
 * Admin user management controller — search, profile, and moderation actions.
 *
 * @module routes/admin/users.controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import { SUBSCRIPTION_TIER_IDS, type SubscriptionTierId, ACCOUNT_MODERATION_CATEGORIES, BAN_TROLL_COUNTDOWN_MS, type AccountModerationCategory } from '@adieuu/shared';
import { getUserRepository } from '../../repositories/user.repository';
import { getSessionRepository } from '../../repositories/session.repository';
import { getAuditLogRepository } from '../../repositories/audit.repository';
import { resolveEffectiveAccess } from '../../services/billing/resolve-access';
import { maskIpAddress, toPublicSession } from '../../models/session';
import type { UserDocument } from '../../models/user';
import type { AuditAction, AuditLogDocument } from '../../models/audit';
import type { SessionDocument } from '../../models/session';
import { isSelfIdentityTarget } from './moderation-guards';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(128),
});

export const GiftSubscriptionSchema = z.object({
  tier: z.enum(SUBSCRIPTION_TIER_IDS as unknown as [string, ...string[]]),
  durationMonths: z.number().int().min(1).max(120).optional(),
});

/** Alias — subscription overrides and gift subscriptions share the same input shape. */
export const SubscriptionOverrideInputSchema = GiftSubscriptionSchema;

const AccountModerationCategorySchema = z.enum(
  ACCOUNT_MODERATION_CATEGORIES as unknown as [AccountModerationCategory, ...AccountModerationCategory[]],
);

export const SuspendAccountSchema = z.object({
  reason: z.string().min(1).max(1024),
  durationMs: z.number().int().min(60_000).optional(),
  category: AccountModerationCategorySchema.optional(),
});

export const BanAccountSchema = z.object({
  reason: z.string().min(1).max(1024),
  category: AccountModerationCategorySchema.optional(),
});

export const AddEntitlementSchema = z.object({
  entitlement: z.string().min(1).max(64),
});

export const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminSubscriptionOverrideItem {
  tier: string;
  expiresAt?: string;
}

function subscriptionOverrideFromInput(input: z.infer<typeof SubscriptionOverrideInputSchema>): {
  tier: SubscriptionTierId;
  expiresAt?: Date;
} {
  const expiresAt = input.durationMonths
    ? new Date(Date.now() + input.durationMonths * 30 * 24 * 60 * 60 * 1000)
    : undefined;
  return {
    tier: input.tier as SubscriptionTierId,
    expiresAt,
  };
}

function toSubscriptionOverrideItem(
  override: { tier: SubscriptionTierId; expiresAt?: Date },
): AdminSubscriptionOverrideItem {
  return {
    tier: override.tier,
    expiresAt: override.expiresAt?.toISOString(),
  };
}

function parseSubscriptionOverrideIndex(indexSegment: string | undefined): number | null {
  if (!indexSegment || !/^\d+$/.test(indexSegment)) return null;
  const index = Number.parseInt(indexSegment, 10);
  if (!Number.isInteger(index) || index < 0) return null;
  return index;
}

export interface AdminUserSearchItem {
  id: string;
  email?: string;
  phone?: string;
  displayName?: string;
  createdAt: string;
  status: 'active' | 'suspended' | 'banned';
}

export interface AdminUserProfile {
  id: string;
  email?: string;
  emailVerified: boolean;
  phone?: string;
  phoneVerified: boolean;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
  geo?: {
    jurisdiction: string;
    countryCode: string;
    regionCode?: string;
    checkedAt: string;
  };
  ageVerification?: {
    status: string;
    verifiedAt?: string;
    failedAt?: string;
    lastJurisdiction?: string;
    optedIn?: boolean;
    expirationCount: number;
    lastExpiredAt?: string;
  };
  billing?: {
    activeSubscriptions: string[];
    entitlements: string[];
    isLifetime: boolean;
    status?: string;
    currentPeriodEnd?: string;
  };
  subscriptionOverrides?: Array<{ tier: string; expiresAt?: string }>;
  entitlementOverrides?: string[];
  moderation: {
    status: 'active' | 'suspended' | 'banned';
    suspendedUntil?: string;
    reason?: string;
    category?: AccountModerationCategory;
    moderatedBy?: string;
    moderatedAt?: string;
  };
}

export interface AdminUserSessionItem {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface AdminAuditEntry {
  id: string;
  action: AuditAction;
  createdAt: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserModerationStatus(user: UserDocument): 'active' | 'suspended' | 'banned' {
  if (user.isBanned) return 'banned';
  if (user.suspendedUntil && user.suspendedUntil > new Date()) return 'suspended';
  return 'active';
}

function toSearchItem(user: UserDocument): AdminUserSearchItem {
  return {
    id: user._id.toHexString(),
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    status: getUserModerationStatus(user),
  };
}

function toAdminProfile(user: UserDocument): AdminUserProfile {
  return {
    id: user._id.toHexString(),
    email: user.email,
    emailVerified: user.emailVerified,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
    geo: user.geo
      ? {
          jurisdiction: user.geo.jurisdiction,
          countryCode: user.geo.countryCode,
          regionCode: user.geo.regionCode,
          checkedAt: user.geo.checkedAt.toISOString(),
        }
      : undefined,
    ageVerification: user.ageVerification
      ? {
          status: user.ageVerification.status,
          verifiedAt: user.ageVerification.verifiedAt?.toISOString(),
          failedAt: user.ageVerification.failedAt?.toISOString(),
          lastJurisdiction: user.ageVerification.lastJurisdiction,
          optedIn: user.ageVerification.optedIn,
          expirationCount: user.ageVerification.expirationCount,
          lastExpiredAt: user.ageVerification.lastExpiredAt?.toISOString(),
        }
      : undefined,
    billing: user.billing
      ? {
          activeSubscriptions: user.billing.activeSubscriptions,
          entitlements: user.billing.entitlements,
          isLifetime: user.billing.isLifetime,
          status: user.billing.status,
          currentPeriodEnd: user.billing.currentPeriodEnd?.toISOString(),
        }
      : undefined,
    subscriptionOverrides: user.subscriptionOverrides?.map((o) => ({
      tier: o.tier,
      expiresAt: o.expiresAt?.toISOString(),
    })),
    entitlementOverrides: user.entitlementOverrides,
    moderation: {
      status: getUserModerationStatus(user),
      suspendedUntil: user.suspendedUntil?.toISOString() ?? undefined,
      reason: user.moderationReason,
      category: user.moderationCategory,
      moderatedBy: user.moderatedBy,
      moderatedAt: user.moderatedAt?.toISOString(),
    },
  };
}

function toAdminSession(session: SessionDocument): AdminUserSessionItem {
  return {
    id: session.sessionId,
    createdAt: session.createdAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    userAgent: session.userAgent,
    ipAddress: maskIpAddress(session.ipAddress),
  };
}

function toAuditEntry(doc: AuditLogDocument): AdminAuditEntry {
  return {
    id: doc._id.toHexString(),
    action: doc.action,
    createdAt: doc.createdAt.toISOString(),
    userAgent: doc.userAgent,
    metadata: doc.metadata,
  };
}

// ---------------------------------------------------------------------------
// Controller functions
// ---------------------------------------------------------------------------

/** Normalise route query input (URLSearchParams or plain object) for Zod parsing. */
function queryToRecord(query: unknown): Record<string, unknown> {
  if (query instanceof URLSearchParams) {
    return Object.fromEntries(query.entries());
  }
  if (query && typeof query === 'object') {
    return query as Record<string, unknown>;
  }
  return {};
}

export type SearchResult =
  | { ok: true; users: AdminUserSearchItem[] }
  | { ok: false; reason: 'validation_failed' };

export async function searchUsers(query: unknown): Promise<SearchResult> {
  const parsed = SearchQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const docs = await userRepo.searchByIdentifier(parsed.data.q.trim());
  return { ok: true, users: docs.map(toSearchItem) };
}

export type GetProfileResult =
  | { ok: true; profile: AdminUserProfile }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getUserProfile(userIdSegment: string | undefined): Promise<GetProfileResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  return { ok: true, profile: toAdminProfile(user) };
}

export type GetSessionsResult =
  | { ok: true; sessions: AdminUserSessionItem[] }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getUserSessions(userIdSegment: string | undefined): Promise<GetSessionsResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const sessionRepo = getSessionRepository();
  const sessions = await sessionRepo.findActiveByUserId(new ObjectId(userIdSegment));
  return { ok: true, sessions: sessions.map(toAdminSession) };
}

export type GetAuditLogResult =
  | { ok: true; entries: AdminAuditEntry[]; total: number }
  | { ok: false; reason: 'validation_failed' };

export async function getUserAuditLog(
  userIdSegment: string | undefined,
  query: unknown,
): Promise<GetAuditLogResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = AuditLogQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const limit = parsed.data.limit ?? 50;
  const offset = parsed.data.offset ?? 0;
  const auditRepo = getAuditLogRepository();

  const docs = await auditRepo.findByUserId(new ObjectId(userIdSegment), limit + offset);
  const sliced = docs.slice(offset, offset + limit);

  return { ok: true, entries: sliced.map(toAuditEntry), total: docs.length };
}

export type GiftSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function giftSubscription(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  body: unknown,
): Promise<GiftSubscriptionResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = GiftSubscriptionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const override = subscriptionOverrideFromInput(parsed.data);
  await userRepo.addSubscriptionOverride(user._id, override);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_gift_subscription',
    ipHash: 'admin',
    metadata: {
      tier: parsed.data.tier,
      durationMonths: parsed.data.durationMonths ?? 'lifetime',
      adminIdentityId,
    },
  });

  return { ok: true };
}

export type GetSubscriptionOverridesResult =
  | { ok: true; effective: SubscriptionTierId[]; overrides: AdminSubscriptionOverrideItem[] }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getSubscriptionOverrides(
  userIdSegment: string | undefined,
): Promise<GetSubscriptionOverridesResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const access = resolveEffectiveAccess(user);
  return {
    ok: true,
    effective: access.subscriptions,
    overrides: (user.subscriptionOverrides ?? []).map(toSubscriptionOverrideItem),
  };
}

export type ModifySubscriptionOverrideResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'override_not_found' };

export async function addSubscriptionOverride(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  body: unknown,
): Promise<ModifySubscriptionOverrideResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = SubscriptionOverrideInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const override = subscriptionOverrideFromInput(parsed.data);
  await userRepo.addSubscriptionOverride(user._id, override);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_add_subscription_override',
    ipHash: 'admin',
    metadata: {
      tier: parsed.data.tier,
      durationMonths: parsed.data.durationMonths ?? 'lifetime',
      adminIdentityId,
    },
  });

  return { ok: true };
}

export async function updateSubscriptionOverride(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  indexSegment: string | undefined,
  body: unknown,
): Promise<ModifySubscriptionOverrideResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const index = parseSubscriptionOverrideIndex(indexSegment);
  if (index === null) return { ok: false, reason: 'validation_failed' };

  const parsed = SubscriptionOverrideInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const override = subscriptionOverrideFromInput(parsed.data);
  const updated = await userRepo.updateSubscriptionOverrideAt(user._id, index, override);
  if (!updated) return { ok: false, reason: 'override_not_found' };

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_update_subscription_override',
    ipHash: 'admin',
    metadata: {
      index,
      tier: parsed.data.tier,
      durationMonths: parsed.data.durationMonths ?? 'lifetime',
      adminIdentityId,
    },
  });

  return { ok: true };
}

export async function removeSubscriptionOverride(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  indexSegment: string | undefined,
): Promise<ModifySubscriptionOverrideResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const index = parseSubscriptionOverrideIndex(indexSegment);
  if (index === null) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const existing = user.subscriptionOverrides?.[index];
  if (!existing) return { ok: false, reason: 'override_not_found' };

  const removed = await userRepo.removeSubscriptionOverrideAt(user._id, index);
  if (!removed) return { ok: false, reason: 'override_not_found' };

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_remove_subscription_override',
    ipHash: 'admin',
    metadata: {
      index,
      tier: existing.tier,
      expiresAt: existing.expiresAt?.toISOString() ?? 'lifetime',
      adminIdentityId,
    },
  });

  return { ok: true };
}

export type ApproveAgeResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function approveAge(
  adminIdentityId: string,
  userIdSegment: string | undefined,
): Promise<ApproveAgeResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  await userRepo.approveAge(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_approve_age',
    ipHash: 'admin',
    metadata: { adminIdentityId },
  });

  return { ok: true };
}

export type GetEntitlementsResult =
  | { ok: true; effective: string[]; overrides: string[] }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getEntitlements(
  userIdSegment: string | undefined,
): Promise<GetEntitlementsResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  const access = resolveEffectiveAccess(user);
  return {
    ok: true,
    effective: access.entitlements,
    overrides: user.entitlementOverrides ?? [],
  };
}

export type ModifyEntitlementResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function addEntitlement(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  body: unknown,
): Promise<ModifyEntitlementResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = AddEntitlementSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  await userRepo.addEntitlementOverride(user._id, parsed.data.entitlement);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_add_entitlement',
    ipHash: 'admin',
    metadata: { entitlement: parsed.data.entitlement, adminIdentityId },
  });

  return { ok: true };
}

export async function removeEntitlement(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  entitlementName: string | undefined,
): Promise<ModifyEntitlementResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }
  if (!entitlementName || entitlementName.length > 64) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  await userRepo.removeEntitlementOverride(user._id, entitlementName);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_remove_entitlement',
    ipHash: 'admin',
    metadata: { entitlement: entitlementName, adminIdentityId },
  });

  return { ok: true };
}

export type SuspendResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'self_action' };

export async function suspendAccount(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  body: unknown,
): Promise<SuspendResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = SuspendAccountSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  if (isSelfIdentityTarget(adminIdentityId, userIdSegment)) {
    return { ok: false, reason: 'self_action' };
  }

  const suspendedUntil = parsed.data.durationMs
    ? new Date(Date.now() + parsed.data.durationMs)
    : new Date(Date.now() + BAN_TROLL_COUNTDOWN_MS);

  await userRepo.suspendAccount(user._id, {
    suspendedUntil,
    reason: parsed.data.reason,
    moderatedBy: adminIdentityId,
    category: parsed.data.category,
  });

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForUser(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_suspend_account',
    ipHash: 'admin',
    metadata: {
      reason: parsed.data.reason,
      category: parsed.data.category,
      durationMs: parsed.data.durationMs ?? 'indefinite',
      suspendedUntil: suspendedUntil.toISOString(),
      adminIdentityId,
    },
  });

  return { ok: true };
}

export type UnsuspendResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function unsuspendAccount(
  adminIdentityId: string,
  userIdSegment: string | undefined,
): Promise<UnsuspendResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  await userRepo.unsuspendAccount(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_unsuspend_account',
    ipHash: 'admin',
    metadata: { adminIdentityId },
  });

  return { ok: true };
}

export type BanResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'self_action' };

export async function banAccount(
  adminIdentityId: string,
  userIdSegment: string | undefined,
  body: unknown,
): Promise<BanResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = BanAccountSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  if (isSelfIdentityTarget(adminIdentityId, userIdSegment)) {
    return { ok: false, reason: 'self_action' };
  }

  await userRepo.banAccount(user._id, {
    reason: parsed.data.reason,
    moderatedBy: adminIdentityId,
    category: parsed.data.category,
  });

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForUser(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_ban_account',
    ipHash: 'admin',
    metadata: { reason: parsed.data.reason, category: parsed.data.category, adminIdentityId },
  });

  return { ok: true };
}

export type UnbanResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function unbanAccount(
  adminIdentityId: string,
  userIdSegment: string | undefined,
): Promise<UnbanResult> {
  if (!userIdSegment || !ObjectId.isValid(userIdSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const userRepo = getUserRepository();
  const user = await userRepo.findById(new ObjectId(userIdSegment));
  if (!user) return { ok: false, reason: 'not_found' };

  await userRepo.unbanAccount(user._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    userId: user._id,
    action: 'admin_unban_account',
    ipHash: 'admin',
    metadata: { adminIdentityId },
  });

  return { ok: true };
}
