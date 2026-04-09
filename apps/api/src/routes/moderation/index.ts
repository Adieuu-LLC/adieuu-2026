/**
 * Platform moderation routes — report list, detail, and actions.
 *
 * All endpoints require an authenticated user session with appropriate
 * platform permissions. Escalated reports additionally require the
 * `manage-escalated-reports` permission (admin-only in the default role map).
 */

import { ObjectId } from 'mongodb';
import { Router, type RouteContext } from '../../router';
import { success } from '../../utils/response';
import { requireIdentitySession } from '../../services/session.service';
import { getPlatformCapabilities } from '../../services/platform-capabilities.service';
import { getReportRepository } from '../../repositories/report.repository';
import { getReportEventRepository } from '../../repositories/report-event.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { executeEnforcement } from '../../services/moderation-enforcement.service';
import { PLATFORM_PERMISSIONS } from '../../constants/platform-permissions';
import { REPORT_CATEGORIES, REPORT_STATUSES, type ReportStatus } from '../../models/report';
import { z } from '@adieuu/shared/schemas';
import { isValidObjectId } from '../../utils/isValidObjectId';

const router = new Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ModeratorAuthResult =
  | { ok: false; error: Response }
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof requireIdentitySession>>>; caps: Awaited<ReturnType<typeof getPlatformCapabilities>> };

async function requireModeratorSession(request: Request, errors: RouteContext['errors']): Promise<ModeratorAuthResult> {
  const session = await requireIdentitySession(request);
  if (!session) return { ok: false, error: errors.unauthorized() };

  const caps = await getPlatformCapabilities(session.identityId);
  const canRead =
    caps.permissions.includes(PLATFORM_PERMISSIONS.READ_CONTENT_REPORTS) ||
    caps.permissions.includes(PLATFORM_PERMISSIONS.READ_ABUSE_REPORTS);

  if (!canRead) return { ok: false, error: errors.forbidden() };

  return { ok: true, session, caps };
}

function toPublicReport(doc: Record<string, unknown>) {
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
    targetUserId: doc.targetUserId,
    reporterIdentityId: doc.reporterIdentityId,
    reporterUserId: doc.reporterUserId,
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
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

function toPublicEvent(doc: Record<string, unknown>) {
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

// ---------------------------------------------------------------------------
// GET /moderation/reports — paginated list with filters
// ---------------------------------------------------------------------------

router.get('/moderation/reports', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const url = new URL(ctx.request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '25', 10) || 25));

  const statusParam = url.searchParams.get('status');
  const assignedParam = url.searchParams.get('assigned');
  const typeParam = url.searchParams.get('type');
  const categoryParam = url.searchParams.get('category');
  const targetIdentityParam = url.searchParams.get('targetIdentityId');
  const reporterIdentityParam = url.searchParams.get('reporterIdentityId');

  const filter: Record<string, unknown> = {};
  if (statusParam) {
    const statuses = statusParam.split(',').filter((s) => REPORT_STATUSES.includes(s as ReportStatus));
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = statuses;
  }
  if (assignedParam === 'unassigned') filter.assignedTo = null;
  else if (assignedParam === 'me') filter.assignedTo = auth.session.identityId;
  if (typeParam) filter.reportType = typeParam;
  if (categoryParam) filter.category = categoryParam;
  if (targetIdentityParam) filter.targetIdentityId = targetIdentityParam;
  if (reporterIdentityParam) filter.reporterIdentityId = reporterIdentityParam;

  const repo = getReportRepository();
  const result = await repo.list({ filter, page, limit });

  return success({
    reports: result.reports.map((r) => toPublicReport(r as unknown as Record<string, unknown>)),
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

// ---------------------------------------------------------------------------
// GET /moderation/reports/:id — report detail with timeline
// ---------------------------------------------------------------------------

router.get('/moderation/reports/:id', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  const events = await eventRepo.listByReportId(id, { includeInternal: true });

  // Collect all unique identity IDs referenced in this report
  const identityIds = new Set<string>();
  if (report.targetIdentityId) identityIds.add(report.targetIdentityId);
  if (report.reporterIdentityId) identityIds.add(report.reporterIdentityId);
  if (report.evidence?.messageEvidence) {
    for (const msg of report.evidence.messageEvidence) {
      identityIds.add(msg.fromIdentityId);
    }
  }

  // Collect moderator/actor identity IDs from events and resolution
  for (const ev of events) {
    const actorId = (ev as unknown as Record<string, unknown>).actorIdentityId as string | undefined;
    if (actorId) identityIds.add(actorId);
  }
  if (report.resolution?.resolvedByIdentityId) identityIds.add(report.resolution.resolvedByIdentityId);
  if (report.closedByIdentityId) identityIds.add(report.closedByIdentityId);
  if (report.escalatedByIdentityId) identityIds.add(report.escalatedByIdentityId);
  if (report.assignedTo) identityIds.add(report.assignedTo);

  // Resolve identity profiles (targets, reporters, and moderator actors)
  const identityRepo = getIdentityRepository();
  const identityProfiles: Record<string, { displayName: string; username: string; avatarUrl?: string }> = {};
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
      } catch { /* identity not found — skip */ }
    }),
  );

  return success({
    report: toPublicReport(report as unknown as Record<string, unknown>),
    events: events.map((e) => toPublicEvent(e as unknown as Record<string, unknown>)),
    identityProfiles,
  });
});

// ---------------------------------------------------------------------------
// GET /moderation/moderators — list all users with moderation permissions
// ---------------------------------------------------------------------------

router.get('/moderation/moderators', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const { getPlatformSettingsRepository } = await import('../../repositories/platform-settings.repository');
  const settingsRepo = getPlatformSettingsRepository();
  const identityRepo = getIdentityRepository();

  const idSet = new Set<string>();

  const adminDoc = await settingsRepo.findByKey('platform-admin-identity-list');
  if (adminDoc?.valueType === 'objectIdArray' && Array.isArray(adminDoc.value)) {
    for (const entry of adminDoc.value) {
      const hex = entry instanceof ObjectId ? entry.toHexString() : typeof entry === 'string' ? entry : null;
      if (hex && isValidObjectId(hex)) idSet.add(hex.toLowerCase());
    }
  }

  const modDoc = await settingsRepo.findByKey('platform-moderator-identity-list');
  if (modDoc?.valueType === 'objectIdArray' && Array.isArray(modDoc.value)) {
    for (const entry of modDoc.value) {
      const hex = entry instanceof ObjectId ? entry.toHexString() : typeof entry === 'string' ? entry : null;
      if (hex && isValidObjectId(hex)) idSet.add(hex.toLowerCase());
    }
  }

  const moderators: { identityId: string; displayName: string; username: string }[] = [];
  await Promise.all(
    [...idSet].map(async (iid) => {
      try {
        const identity = await identityRepo.findByIdentityId(iid);
        if (identity) {
          moderators.push({
            identityId: iid,
            displayName: identity.displayName ?? '',
            username: identity.username ?? '',
          });
        }
      } catch { /* skip */ }
    }),
  );

  moderators.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return success({ moderators });
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/reopen
// ---------------------------------------------------------------------------

const ReopenSchema = z.object({
  reason: z.string().min(1).max(4000).optional(),
});

router.post('/moderation/reports/:id/reopen', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const canUpdate =
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS) ||
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS);
  if (!canUpdate) return ctx.errors.forbidden();

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = ReopenSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  if (report.status !== 'resolved' && report.status !== 'closed') {
    return ctx.errors.badRequest();
  }

  const updated = await repo.reopen(id, auth.session.identityId);
  if (!updated) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: auth.session.identityId,
    body: body.data.reason
      ? `Report reopened for review: ${body.data.reason}`
      : 'Report reopened for review',
    metadata: { from: report.status, to: 'open' },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/assign
// ---------------------------------------------------------------------------

const AssignSchema = z.object({ identityId: z.string().min(1) });

router.post('/moderation/reports/:id/assign', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = AssignSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  const updated = await repo.assign(id, body.data.identityId);
  if (!updated) return ctx.errors.notFound();

  const previousAssignee = report.assignedTo ?? null;
  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorIdentityId: auth.session.identityId,
    body: previousAssignee
      ? `Reassigned from ${previousAssignee.slice(0, 8)}… to ${body.data.identityId.slice(0, 8)}…`
      : `Assigned to ${body.data.identityId.slice(0, 8)}…`,
    metadata: { from: previousAssignee, assignedTo: body.data.identityId },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/unassign
// ---------------------------------------------------------------------------

router.post('/moderation/reports/:id/unassign', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  const updated = await repo.unassign(id);
  if (!updated) return ctx.errors.notFound();

  const previousAssignee = report.assignedTo ?? null;
  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorIdentityId: auth.session.identityId,
    body: previousAssignee
      ? `Unassigned from ${previousAssignee.slice(0, 8)}…`
      : 'Unassigned',
    metadata: { from: previousAssignee, assignedTo: null },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/escalate
// ---------------------------------------------------------------------------

router.post('/moderation/reports/:id/escalate', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  if (!auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS) &&
      !auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS)) {
    return ctx.errors.forbidden();
  }

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const repo = getReportRepository();
  const updated = await repo.escalate(id, auth.session.identityId);
  if (!updated) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: auth.session.identityId,
    body: 'Report escalated for admin review',
    metadata: { from: 'open', to: 'escalated' },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/category
// ---------------------------------------------------------------------------

const CategorySchema = z.object({
  category: z.enum(REPORT_CATEGORIES as unknown as [string, ...string[]]),
});

router.post('/moderation/reports/:id/category', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = CategorySchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  const oldCategory = report.category;
  const updated = await repo.updateCategory(id, body.data.category);

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'category_change',
    actorIdentityId: auth.session.identityId,
    metadata: { from: oldCategory, to: body.data.category },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/comment
// ---------------------------------------------------------------------------

const CommentSchema = z.object({
  body: z.string().min(1).max(4000),
  visibility: z.enum(['internal', 'public']),
});

router.post('/moderation/reports/:id/comment', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = CommentSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  const event = await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: body.data.visibility === 'internal' ? 'comment_internal' : 'comment_public',
    actorIdentityId: auth.session.identityId,
    body: body.data.body,
  });

  return success(toPublicEvent(event as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/resolve
// ---------------------------------------------------------------------------

const ResolveSchema = z.object({
  reason: z.string().min(1).max(4000),
  removeContent: z.boolean().default(true),
  warnUser: z.boolean().default(true),
  suspendAliasMs: z.number().int().min(0).default(0),
  banAlias: z.boolean().default(false),
});

router.post('/moderation/reports/:id/resolve', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const canUpdate =
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS) ||
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS);
  if (!canUpdate) return ctx.errors.forbidden();

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = ResolveSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  if (report.status === 'escalated' &&
      !auth.caps.permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS)) {
    return ctx.errors.forbidden();
  }

  await executeEnforcement(
    {
      removeContent: body.data.removeContent,
      warnUser: body.data.warnUser,
      suspendAliasMs: body.data.suspendAliasMs,
      banAlias: body.data.banAlias,
    },
    {
      reportId: new ObjectId(id),
      targetIdentityId: report.targetIdentityId,
      targetRef: report.targetRef,
      actorIdentityId: auth.session.identityId,
      reason: body.data.reason,
    },
  );

  const updated = await repo.resolve(id, {
    contentRemoved: body.data.removeContent,
    userWarned: body.data.warnUser,
    aliasSuspendedMs: body.data.suspendAliasMs,
    aliasBanned: body.data.banAlias,
    reason: body.data.reason,
    resolvedByIdentityId: auth.session.identityId,
    resolvedAt: new Date(),
  });

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: auth.session.identityId,
    body: `Report resolved: ${body.data.reason}`,
    metadata: { from: report.status, to: 'resolved', actions: body.data },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/close
// ---------------------------------------------------------------------------

const CloseSchema = z.object({
  reason: z.string().min(1).max(4000),
});

router.post('/moderation/reports/:id/close', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const canUpdate =
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_CONTENT_REPORTS) ||
    auth.caps.permissions.includes(PLATFORM_PERMISSIONS.UPDATE_ABUSE_REPORTS);
  if (!canUpdate) return ctx.errors.forbidden();

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = CloseSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const report = await repo.findById(id);
  if (!report) return ctx.errors.notFound();

  if (report.status === 'escalated' &&
      !auth.caps.permissions.includes(PLATFORM_PERMISSIONS.MANAGE_ESCALATED_REPORTS)) {
    return ctx.errors.forbidden();
  }

  const updated = await repo.close(id, auth.session.identityId, body.data.reason);

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorIdentityId: auth.session.identityId,
    body: `Report closed (invalid): ${body.data.reason}`,
    metadata: { from: report.status, to: 'closed' },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

export const moderationRoutes = router;
