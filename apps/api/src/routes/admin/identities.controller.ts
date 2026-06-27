/**
 * Admin identity management controller — search, profile, and moderation actions.
 *
 * @module routes/admin/identities.controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import { ACCOUNT_MODERATION_CATEGORIES, BAN_TROLL_COUNTDOWN_MS, type AccountModerationCategory } from '@adieuu/shared';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getSessionRepository } from '../../repositories/session.repository';
import { getAuditLogRepository } from '../../repositories/audit.repository';
import { getReportRepository, type ReportListResult } from '../../repositories/report.repository';
import { isDeletedIdent } from '../../models/identity';
import type { IdentityDocument } from '../../models/identity';
import type { SessionDocument } from '../../models/session';
import {
  identityHasPlatformAdminRole,
  isSelfIdentityTarget,
} from './moderation-guards';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const SearchQuerySchema = z.object({
  q: z.string().min(1).max(128),
});

const AccountModerationCategorySchema = z.enum(
  ACCOUNT_MODERATION_CATEGORIES as unknown as [AccountModerationCategory, ...AccountModerationCategory[]],
);

export const SuspendIdentitySchema = z.object({
  reason: z.string().min(1).max(1024),
  durationMs: z.number().int().min(60_000).optional(),
  category: AccountModerationCategorySchema.optional(),
});

export const BanIdentitySchema = z.object({
  reason: z.string().min(1).max(1024),
  category: AccountModerationCategorySchema.optional(),
});

export const AddEntitlementSchema = z.object({
  entitlement: z.string().min(1).max(64),
});

export const ReportsQuerySchema = z.object({
  direction: z.enum(['against', 'by']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminIdentitySearchItem {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  status: 'active' | 'suspended' | 'banned';
  createdAt: string;
}

export interface AdminIdentityProfile {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  createdAt: string;
  lastActiveAt: string;
  platformRoles?: string[];
  platformAttributes?: string[];
  entitlementOverrides?: string[];
  subscriptionOverrides?: Array<{ tier: string; expiresAt?: string }>;
  stats: {
    messagesSent: number;
    conversationsJoined: number;
    friends: number;
    achievementsEarned: number;
  };
  moderation: {
    status: 'active' | 'suspended' | 'banned';
    suspendedUntil?: string;
    reason?: string;
    category?: AccountModerationCategory;
    moderatedBy?: string;
    moderatedAt?: string;
    reportId?: string;
  };
}

export interface AdminIdentitySessionItem {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  userAgent?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIdentityModerationStatus(doc: IdentityDocument): 'active' | 'suspended' | 'banned' {
  if (doc.isBanned) return 'banned';
  if (doc.suspendedUntil && doc.suspendedUntil > new Date()) return 'suspended';
  return 'active';
}

function toSearchItem(doc: IdentityDocument): AdminIdentitySearchItem {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    displayName: doc.displayName,
    avatarUrl: doc.avatarUrl,
    status: getIdentityModerationStatus(doc),
    createdAt: doc.createdAt.toISOString(),
  };
}

function toAdminProfile(doc: IdentityDocument): AdminIdentityProfile {
  return {
    id: doc._id.toHexString(),
    username: doc.username,
    displayName: doc.displayName,
    bio: doc.bio,
    avatarUrl: doc.avatarUrl,
    bannerUrl: doc.bannerUrl,
    createdAt: doc.createdAt.toISOString(),
    lastActiveAt: doc.lastActiveAt.toISOString(),
    platformRoles: doc.platformRoles ?? [],
    platformAttributes: doc.platformAttributes ?? [],
    entitlementOverrides: doc.entitlementOverrides,
    subscriptionOverrides: doc.subscriptionOverrides?.map((o) => ({
      tier: o.tier,
      expiresAt: o.expiresAt?.toISOString(),
    })),
    stats: {
      messagesSent: doc.messagesSentCount ?? 0,
      conversationsJoined: doc.conversationsJoinedCount ?? 0,
      friends: doc.friendCount ?? 0,
      achievementsEarned: doc.achievementsEarnedCount ?? 0,
    },
    moderation: {
      status: getIdentityModerationStatus(doc),
      suspendedUntil: doc.suspendedUntil?.toISOString() ?? undefined,
      reason: doc.moderationReason,
      category: doc.moderationCategory,
      moderatedBy: doc.moderatedBy,
      moderatedAt: doc.moderatedAt?.toISOString(),
      reportId: doc.moderationReportId,
    },
  };
}

function toAdminSession(session: SessionDocument): AdminIdentitySessionItem {
  return {
    id: session.sessionId,
    createdAt: session.createdAt.toISOString(),
    lastActivityAt: session.lastActivityAt.toISOString(),
    userAgent: session.userAgent,
  };
}

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

// ---------------------------------------------------------------------------
// Controller functions
// ---------------------------------------------------------------------------

export type SearchResult =
  | { ok: true; identities: AdminIdentitySearchItem[] }
  | { ok: false; reason: 'validation_failed' };

export async function searchIdentities(query: unknown): Promise<SearchResult> {
  const parsed = SearchQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const identityRepo = getIdentityRepository();
  const docs = await identityRepo.searchForAdmin(parsed.data.q.trim());
  return { ok: true, identities: docs.map(toSearchItem) };
}

export type GetProfileResult =
  | { ok: true; profile: AdminIdentityProfile }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getIdentityProfile(idSegment: string | undefined): Promise<GetProfileResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  return { ok: true, profile: toAdminProfile(doc) };
}

export type GetSessionsResult =
  | { ok: true; sessions: AdminIdentitySessionItem[] }
  | { ok: false; reason: 'validation_failed' };

export async function getIdentitySessions(idSegment: string | undefined): Promise<GetSessionsResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const sessionRepo = getSessionRepository();
  const sessions = await sessionRepo.findByIdentityId(new ObjectId(idSegment));
  return { ok: true, sessions: sessions.map(toAdminSession) };
}

export type GetReportsResult =
  | { ok: true; against: ReportListResult; by: ReportListResult }
  | { ok: false; reason: 'validation_failed' };

export async function getIdentityReports(
  idSegment: string | undefined,
  query: unknown,
): Promise<GetReportsResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = ReportsQuerySchema.safeParse(queryToRecord(query));
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const limit = parsed.data.limit ?? 25;
  const page = parsed.data.page ?? 1;
  const identityId = idSegment;
  const reportRepo = getReportRepository();

  const [against, by] = await Promise.all([
    reportRepo.list({ filter: { targetIdentityId: identityId }, limit, page }),
    reportRepo.list({ filter: { reporterIdentityId: identityId }, limit, page }),
  ]);

  return { ok: true, against, by };
}

export type GetEntitlementsResult =
  | { ok: true; overrides: string[] }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function getIdentityEntitlements(
  idSegment: string | undefined,
): Promise<GetEntitlementsResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  return { ok: true, overrides: doc.entitlementOverrides ?? [] };
}

export type ModifyEntitlementResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' };

export async function addIdentityEntitlement(
  adminIdentityId: string,
  idSegment: string | undefined,
  body: unknown,
): Promise<ModifyEntitlementResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = AddEntitlementSchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  await identityRepo.addEntitlementOverride(doc._id, parsed.data.entitlement);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_add_identity_entitlement',
    ipHash: 'admin',
    metadata: {
      identityId: doc._id.toHexString(),
      entitlement: parsed.data.entitlement,
      adminIdentityId,
    },
  });

  return { ok: true };
}

export async function removeIdentityEntitlement(
  adminIdentityId: string,
  idSegment: string | undefined,
  entitlementName: string | undefined,
): Promise<ModifyEntitlementResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }
  if (!entitlementName || entitlementName.length > 64) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  await identityRepo.removeEntitlementOverride(doc._id, entitlementName);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_remove_identity_entitlement',
    ipHash: 'admin',
    metadata: {
      identityId: doc._id.toHexString(),
      entitlement: entitlementName,
      adminIdentityId,
    },
  });

  return { ok: true };
}

export type SuspendResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'self_action' | 'protected_admin' };

export async function suspendIdentity(
  adminIdentityId: string,
  idSegment: string | undefined,
  body: unknown,
): Promise<SuspendResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = SuspendIdentitySchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  if (isSelfIdentityTarget(adminIdentityId, idSegment)) {
    return { ok: false, reason: 'self_action' };
  }
  if (identityHasPlatformAdminRole(doc)) {
    return { ok: false, reason: 'protected_admin' };
  }

  const suspendedUntil = parsed.data.durationMs
    ? new Date(Date.now() + parsed.data.durationMs)
    : new Date(Date.now() + BAN_TROLL_COUNTDOWN_MS);

  await identityRepo.suspendIdentity(doc._id, {
    suspendedUntil,
    reason: parsed.data.reason,
    moderatedBy: adminIdentityId,
    category: parsed.data.category,
  });

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForIdentity(doc._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_suspend_identity',
    ipHash: 'admin',
    metadata: {
      identityId: doc._id.toHexString(),
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
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'protected_admin' };

export async function unsuspendIdentity(
  adminIdentityId: string,
  idSegment: string | undefined,
): Promise<UnsuspendResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  if (identityHasPlatformAdminRole(doc)) {
    return { ok: false, reason: 'protected_admin' };
  }

  await identityRepo.unsuspendIdentity(doc._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_unsuspend_identity',
    ipHash: 'admin',
    metadata: { identityId: doc._id.toHexString(), adminIdentityId },
  });

  return { ok: true };
}

export type BanResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'self_action' | 'protected_admin' };

export async function banIdentity(
  adminIdentityId: string,
  idSegment: string | undefined,
  body: unknown,
): Promise<BanResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const parsed = BanIdentitySchema.safeParse(body);
  if (!parsed.success) return { ok: false, reason: 'validation_failed' };

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  if (isSelfIdentityTarget(adminIdentityId, idSegment)) {
    return { ok: false, reason: 'self_action' };
  }
  if (identityHasPlatformAdminRole(doc)) {
    return { ok: false, reason: 'protected_admin' };
  }

  await identityRepo.banIdentity(doc._id, {
    reason: parsed.data.reason,
    moderatedBy: adminIdentityId,
    category: parsed.data.category,
  });

  const sessionRepo = getSessionRepository();
  await sessionRepo.revokeAllForIdentity(doc._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_ban_identity',
    ipHash: 'admin',
    metadata: {
      identityId: doc._id.toHexString(),
      reason: parsed.data.reason,
      category: parsed.data.category,
      adminIdentityId,
    },
  });

  return { ok: true };
}

export type UnbanResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'validation_failed' | 'protected_admin' };

export async function unbanIdentity(
  adminIdentityId: string,
  idSegment: string | undefined,
): Promise<UnbanResult> {
  if (!idSegment || !ObjectId.isValid(idSegment)) {
    return { ok: false, reason: 'validation_failed' };
  }

  const identityRepo = getIdentityRepository();
  const doc = await identityRepo.findByIdentityId(new ObjectId(idSegment));
  if (!doc || isDeletedIdent(doc.ident)) return { ok: false, reason: 'not_found' };

  if (identityHasPlatformAdminRole(doc)) {
    return { ok: false, reason: 'protected_admin' };
  }

  await identityRepo.unbanIdentity(doc._id);

  const auditRepo = getAuditLogRepository();
  await auditRepo.create({
    action: 'admin_unban_identity',
    ipHash: 'admin',
    metadata: { identityId: doc._id.toHexString(), adminIdentityId },
  });

  return { ok: true };
}
