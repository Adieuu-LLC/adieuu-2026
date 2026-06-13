/**
 * Platform moderation controller — validation, auth gates, and report orchestration.
 *
 * @module routes/moderation/controller
 */

import { ObjectId } from 'mongodb';
import { z } from '@adieuu/shared/schemas';
import { PLATFORM_PERMISSIONS, PLATFORM_ROLES } from '../../constants/platform-permissions';
import {
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  type ReportDocument,
  type ReportStatus,
} from '../../models/report';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getReportEventRepository } from '../../repositories/report-event.repository';
import { getReportRepository } from '../../repositories/report.repository';
import { purgeConvScanEvidenceForTerminalReport } from '../../services/conv-scan-moderation-cleanup.service';
import { executeEnforcement } from '../../services/moderation-enforcement.service';
import {
  getModerationScanEvidenceForReport,
  type ModerationScanEvidenceResult,
} from '../../services/moderation-scan-evidence.service';
import {
  getPlatformCapabilities,
  type PlatformCapabilities,
} from '../../services/platform-capabilities.service';
import type { IdentitySessionData } from '../../services/session.service';
import { isValidObjectId } from '../../utils/isValidObjectId';
import { sanitizeString } from '../../utils/sanitize';
import elog from '../../utils/adieuuLogger';

export type ModerationFailureKind =
  | 'validation_failed'
  | 'bad_request'
  | 'not_found'
  | 'forbidden';

export type ModerationResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; kind: ModerationFailureKind; message?: string };

export type ModeratorGateFailureReason = 'unauthorized' | 'forbidden';

export type PublicReport = ReturnType<typeof toPublicReport>;
export type PublicEvent = ReturnType<typeof toPublicEvent>;

export function canReadReports(caps: PlatformCapabilities): boolean {
  return (
    caps.permissions.includes(PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS) ||
    caps.permissions.includes(PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS)
  );
}

export function canUpdateReports(caps: PlatformCapabilities): boolean {
  return (
    caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS) ||
    caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS)
  );
}

export function canManageEscalated(caps: PlatformCapabilities): boolean {
  return caps.permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS);
}

export async function gateModeratorSession(
  session: IdentitySessionData | null,
): Promise<
  | { ok: true; session: IdentitySessionData; caps: PlatformCapabilities }
  | { ok: false; reason: ModeratorGateFailureReason }
> {
  if (!session) return { ok: false, reason: 'unauthorized' };

  const caps = await getPlatformCapabilities(session.identityId);
  if (!canReadReports(caps)) return { ok: false, reason: 'forbidden' };

  return { ok: true, session, caps };
}

export function toPublicReport(doc: Record<string, unknown>) {
  const id = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
  return {
    id,
    reportType: doc.reportType,
    source: doc.source,
    status: doc.status,
    category: doc.category,
    scopeType: doc.scopeType,
    scopeId: doc.scopeId,
    targetRef: doc.targetRef,
    targetIdentityId: doc.targetIdentityId,
    reporterIdentityId: doc.reporterIdentityId,
    assignedTo: doc.assignedTo,
    detectionMetadata: doc.detectionMetadata,
    evidence: doc.evidence,
    reporterReason: doc.reporterReason,
    resolution: doc.resolution,
    closureReason: doc.closureReason,
    closedByIdentityId: doc.closedByIdentityId,
    closedAt: doc.closedAt instanceof Date ? doc.closedAt.toISOString() : doc.closedAt,
    escalatedByIdentityId: doc.escalatedByIdentityId,
    escalatedAt: doc.escalatedAt instanceof Date ? doc.escalatedAt.toISOString() : doc.escalatedAt,
    leReportFiled: doc.leReportFiled,
    leReportFiledAt: doc.leReportFiledAt instanceof Date ? doc.leReportFiledAt.toISOString() : doc.leReportFiledAt,
    leReportFiledBy: doc.leReportFiledBy,
    ncmecReportId: doc.ncmecReportId,
    ncmecStatus: doc.ncmecStatus,
    ncmecError: doc.ncmecError,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

export function toPublicEvent(doc: Record<string, unknown>) {
  const id = doc._id instanceof ObjectId ? doc._id.toHexString() : String(doc._id);
  return {
    id,
    reportId: doc.reportId instanceof ObjectId ? doc.reportId.toHexString() : String(doc.reportId),
    eventType: doc.eventType,
    actorIdentityId: doc.actorIdentityId,
    body: doc.body,
    metadata: doc.metadata,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
  };
}

export const ReopenSchema = z.object({
  reason: z.string().min(1).max(4000).optional(),
});

export const AssignSchema = z.object({ identityId: z.string().min(1) });

export const CategorySchema = z.object({
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
});

export const CommentSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(['internal', 'public']),
});

export const ResolveSchema = z.object({
  reason: z.string().min(1).max(4000),
  removeContent: z.boolean().default(true),
  warnUser: z.boolean().default(true),
  suspendAliasMs: z.number().int().min(0).default(0),
  banAlias: z.boolean().default(false),
});

export const CloseSchema = z.object({
  reason: z.string().min(1).max(4000),
});

function parseReportId(rawId: string | undefined): string | null {
  if (!rawId || !isValidObjectId(rawId)) return null;
  return rawId;
}

export type ListReportsData = {
  reports: PublicReport[];
  total: number;
  page: number;
  limit: number;
};

export async function listReportsResult(
  moderatorId: string,
  searchParams: URLSearchParams,
): Promise<ModerationResult<ListReportsData>> {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25));

  const statusParam = searchParams.get('status');
  const assignedParam = searchParams.get('assigned');
  const typeParam = searchParams.get('type');
  const categoryParam = searchParams.get('category');
  const targetIdentityParam = searchParams.get('targetIdentityId');
  const reporterIdentityParam = searchParams.get('reporterIdentityId');

  const filter: Record<string, unknown> = {};
  if (statusParam) {
    const statuses = statusParam.split(',').filter((s) => REPORT_STATUSES.includes(s as ReportStatus));
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = statuses;
  }
  if (assignedParam === 'unassigned') filter.assignedTo = null;
  else if (assignedParam === 'me') filter.assignedTo = moderatorId;
  if (typeParam) filter.reportType = typeParam;
  if (categoryParam) filter.category = categoryParam;
  if (targetIdentityParam) filter.targetIdentityId = targetIdentityParam;
  if (reporterIdentityParam) filter.reporterIdentityId = reporterIdentityParam;

  const repo = getReportRepository();
  const result = await repo.list({ filter, page, limit });

  return {
    ok: true,
    data: {
      reports: result.reports.map((r) => toPublicReport(r as unknown as Record<string, unknown>)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  };
}

export async function getReportScanEvidenceResult(
  reportId: string | undefined,
): Promise<ModerationResult<ModerationScanEvidenceResult>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const result = await getModerationScanEvidenceForReport(id);
  if (!result.ok) {
    if (result.errorCode === 'NOT_FOUND') {
      return { ok: false, kind: 'not_found', message: result.message };
    }
    return { ok: false, kind: 'bad_request', message: result.message };
  }

  return { ok: true, data: result.data };
}

export type ReportDetailData = {
  report: PublicReport;
  events: PublicEvent[];
  identityProfiles: Record<string, { displayName: string; username: string; avatarUrl?: string }>;
};

export async function getReportDetailResult(
  reportId: string | undefined,
): Promise<ModerationResult<ReportDetailData>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  const eventRepo = getReportEventRepository();
  const events = await eventRepo.listByReportId(id, { includeInternal: true });

  const identityIds = new Set<string>();
  if (report.targetIdentityId) identityIds.add(report.targetIdentityId);
  if (report.reporterIdentityId) identityIds.add(report.reporterIdentityId);
  if (report.evidence?.messageEvidence) {
    for (const msg of report.evidence.messageEvidence) {
      identityIds.add(msg.fromIdentityId);
    }
  }

  for (const ev of events) {
    const actorId = (ev as unknown as Record<string, unknown>).actorIdentityId as string | undefined;
    if (actorId) identityIds.add(actorId);
  }
  if (report.resolution?.resolvedByIdentityId) identityIds.add(report.resolution.resolvedByIdentityId);
  if (report.closedByIdentityId) identityIds.add(report.closedByIdentityId);
  if (report.escalatedByIdentityId) identityIds.add(report.escalatedByIdentityId);
  if (report.assignedTo) identityIds.add(report.assignedTo);

  const identityRepo = getIdentityRepository();
  const identityProfiles: ReportDetailData['identityProfiles'] = {};
  await Promise.all(
    [...identityIds].map(async (iid) => {
      try {
        const identity = await identityRepo.findByIdentityId(iid);
        if (identity) {
          identityProfiles[iid] = {
            displayName: identity.displayName ?? '',
            username: identity.username ?? '',
            avatarUrl: identity.avatarUrl,
          };
        }
      } catch {
        /* identity not found — skip */
      }
    }),
  );

  return {
    ok: true,
    data: {
      report: toPublicReport(report as unknown as Record<string, unknown>),
      events: events.map((e) => toPublicEvent(e as unknown as Record<string, unknown>)),
      identityProfiles,
    },
  };
}

export type ModeratorRow = {
  identityId: string;
  displayName: string;
  username: string;
};

export async function listModeratorsResult(): Promise<ModerationResult<{ moderators: ModeratorRow[] }>> {
  const identityRepo = getIdentityRepository();
  const identities = await identityRepo.findByAnyPlatformRole([
    PLATFORM_ROLES.ADMIN,
    PLATFORM_ROLES.MODERATOR,
  ]);

  const moderators: ModeratorRow[] = identities.map((identity) => ({
    identityId: identity._id instanceof ObjectId ? identity._id.toHexString() : String(identity._id),
    displayName: identity.displayName ?? '',
    username: identity.username ?? '',
  }));

  moderators.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return { ok: true, data: { moderators } };
}

export async function reopenReportResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<ModerationResult<PublicReport>> {
  if (!canUpdateReports(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = ReopenSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  if (report.status !== 'resolved' && report.status !== 'closed') {
    return { ok: false, kind: 'bad_request' };
  }

  const updated = await repo.reopen(id, actorId);
  if (!updated) return { ok: false, kind: 'not_found' };

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: actorId,
    body: parsed.data.reason
      ? `Report reopened for review: ${parsed.data.reason}`
      : 'Report reopened for review',
    metadata: { from: report.status, to: 'open' },
  });

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function assignReportResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
): Promise<ModerationResult<PublicReport>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = AssignSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  const updated = await repo.assign(id, parsed.data.identityId);
  if (!updated) return { ok: false, kind: 'not_found' };

  const previousAssignee = report.assignedTo ?? null;
  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorIdentityId: actorId,
    body: previousAssignee
      ? `Reassigned from ${previousAssignee.slice(0, 8)}… to ${parsed.data.identityId.slice(0, 8)}…`
      : `Assigned to ${parsed.data.identityId.slice(0, 8)}…`,
    metadata: { from: previousAssignee, assignedTo: parsed.data.identityId },
  });

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function unassignReportResult(
  actorId: string,
  reportId: string | undefined,
): Promise<ModerationResult<PublicReport>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  const updated = await repo.unassign(id);
  if (!updated) return { ok: false, kind: 'not_found' };

  const previousAssignee = report.assignedTo ?? null;
  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorIdentityId: actorId,
    body: previousAssignee
      ? `Unassigned from ${previousAssignee.slice(0, 8)}…`
      : 'Unassigned',
    metadata: { from: previousAssignee, assignedTo: null },
  });

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function escalateReportResult(
  actorId: string,
  reportId: string | undefined,
  caps: PlatformCapabilities,
): Promise<ModerationResult<PublicReport>> {
  if (!canUpdateReports(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const repo = getReportRepository();
  const updated = await repo.escalate(id, actorId);
  if (!updated) return { ok: false, kind: 'not_found' };

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: actorId,
    body: 'Report escalated for admin review',
    metadata: { from: 'open', to: 'escalated' },
  });

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function setReportCategoryResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
): Promise<ModerationResult<PublicReport>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = CategorySchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  const oldCategory = report.category;
  const updated = await repo.updateCategory(id, parsed.data.category);

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'category_change',
    actorIdentityId: actorId,
    metadata: { from: oldCategory, to: parsed.data.category },
  });

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function addReportCommentResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
): Promise<ModerationResult<PublicEvent>> {
  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  const eventRepo = getReportEventRepository();
  const event = await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: parsed.data.visibility === 'internal' ? 'comment_internal' : 'comment_public',
    actorIdentityId: actorId,
    body: parsed.data.body,
  });

  return { ok: true, data: toPublicEvent(event as unknown as Record<string, unknown>) };
}

export async function resolveReportResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<ModerationResult<PublicReport>> {
  if (!canUpdateReports(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = ResolveSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  if (report.status === 'escalated' && !canManageEscalated(caps)) {
    return { ok: false, kind: 'forbidden' };
  }

  await executeEnforcement(
    {
      removeContent: parsed.data.removeContent,
      warnUser: parsed.data.warnUser,
      suspendAliasMs: parsed.data.suspendAliasMs,
      banAlias: parsed.data.banAlias,
    },
    {
      reportId: new ObjectId(id),
      targetIdentityId: report.targetIdentityId,
      targetRef: report.targetRef,
      actorIdentityId: actorId,
      reason: parsed.data.reason,
    },
  );

  const updated = await repo.resolve(id, {
    contentRemoved: parsed.data.removeContent,
    userWarned: parsed.data.warnUser,
    aliasSuspendedMs: parsed.data.suspendAliasMs,
    aliasBanned: parsed.data.banAlias,
    reason: parsed.data.reason,
    resolvedByIdentityId: actorId,
    resolvedAt: new Date(),
  });

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: actorId,
    body: `Report resolved: ${parsed.data.reason}`,
    metadata: { from: report.status, to: 'resolved', actions: parsed.data },
  });

  if (updated) {
    await purgeConvScanEvidenceForTerminalReport(updated as ReportDocument);
  }

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

export async function closeReportResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<ModerationResult<PublicReport>> {
  if (!canUpdateReports(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = CloseSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return { ok: false, kind: 'not_found' };

  if (report.status === 'escalated' && !canManageEscalated(caps)) {
    return { ok: false, kind: 'forbidden' };
  }

  const updated = await repo.close(id, actorId, parsed.data.reason);

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: actorId,
    body: `Report closed (invalid): ${parsed.data.reason}`,
    metadata: { from: report.status, to: 'closed' },
  });

  if (updated) {
    await purgeConvScanEvidenceForTerminalReport(updated as ReportDocument);
  }

  return { ok: true, data: toPublicReport(updated as unknown as Record<string, unknown>) };
}

const LE_REPORT_CATEGORIES = ['csam'] as const;
const LE_REPORT_NOTES_MAX_LENGTH = 1000;
const NCMEC_PUBLIC_ERROR = 'NCMEC service error';

const LeReportSchema = z.object({
  category: z.enum(LE_REPORT_CATEGORIES),
  notes: z.string().max(LE_REPORT_NOTES_MAX_LENGTH).optional(),
});

function sanitizeLeReportNotes(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const clipped = sanitizeString(raw, 'general').value.slice(0, LE_REPORT_NOTES_MAX_LENGTH).trim();
  return clipped === '' ? undefined : clipped;
}

function logAndSanitizeNcmecError(reportId: string, err: unknown): string {
  elog.error('NCMEC CyberTipline submission failed', { reportId, error: err });
  return NCMEC_PUBLIC_ERROR;
}

function ncmecClaimFailure(
  report: ReportDocument | null,
): ModerationResult<PublicReport> {
  if (!report) {
    return { ok: false, kind: 'not_found' };
  }
  if (report.status === 'closed') {
    return { ok: false, kind: 'bad_request', message: 'Cannot file LE report on a closed report' };
  }
  if (report.ncmecStatus === 'submitted') {
    return { ok: false, kind: 'bad_request', message: 'LE report has already been filed for this report' };
  }
  if (report.ncmecStatus === 'claiming') {
    return { ok: false, kind: 'bad_request', message: 'NCMEC submission already in progress' };
  }
  return { ok: false, kind: 'bad_request', message: 'Cannot file LE report for this report' };
}

export async function fileLeReportResult(
  actorId: string,
  reportId: string | undefined,
  body: unknown,
  caps: PlatformCapabilities,
): Promise<ModerationResult<PublicReport>> {
  if (!canManageEscalated(caps)) return { ok: false, kind: 'forbidden' };

  const id = parseReportId(reportId);
  if (!id) return { ok: false, kind: 'bad_request' };

  const parsed = LeReportSchema.safeParse(body);
  if (!parsed.success) return { ok: false, kind: 'validation_failed' };

  const notes = sanitizeLeReportNotes(parsed.data.notes);

  const repo = getReportRepository();
  const claimed = await repo.claimNcmecSubmission(id, actorId);
  if (!claimed) {
    const existing = await repo.findById(id);
    return ncmecClaimFailure(existing);
  }

  const now = new Date();
  let ncmecReportId: string | undefined;
  let ncmecStatus: 'submitted' | 'failed' = 'failed';
  let ncmecError: string | undefined;

  try {
    const { buildCyberTiplineReport } = await import('../../services/cybertipline-report-builder.service');
    const { createCyberTiplineClient, assertCyberTiplineEnvironment } = await import('../../services/cybertipline.service');

    const bundle = await buildCyberTiplineReport(claimed as ReportDocument, notes);
    const client = await createCyberTiplineClient();
    assertCyberTiplineEnvironment(client.getBaseUrl());
    const result = await client.submitFullReport(bundle.report, bundle.evidenceFile);
    ncmecReportId = result.ncmecReportId;
    ncmecStatus = 'submitted';
  } catch (err) {
    ncmecError = logAndSanitizeNcmecError(id, err);
  }

  const finalizeResult =
    ncmecStatus === 'submitted' && ncmecReportId
      ? await repo.finalizeNcmecSubmission(id, {
          ok: true,
          ncmecReportId,
          actorId,
          filedAt: now,
        })
      : await repo.finalizeNcmecSubmission(id, {
          ok: false,
          ncmecError: ncmecError ?? NCMEC_PUBLIC_ERROR,
        });

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'le_report_filed',
    actorIdentityId: actorId,
    body: notes || `Law enforcement report filed (${parsed.data.category})`,
    metadata: {
      leCategory: parsed.data.category,
      notes,
      detectionMetadata: claimed.detectionMetadata,
      targetIdentityId: claimed.targetIdentityId,
      filedAt: now.toISOString(),
      ncmecReportId,
      ncmecStatus,
      ncmecError,
    },
  });

  if (!finalizeResult) {
    return { ok: false, kind: 'bad_request', message: 'NCMEC submission could not be finalized' };
  }

  return {
    ok: true,
    data: toPublicReport(finalizeResult as unknown as Record<string, unknown>),
  };
}
