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
import { getSessionFromRequest } from '../../services/session.service';
import { getPlatformCapabilities } from '../../services/platform-capabilities.service';
import { getReportRepository } from '../../repositories/report.repository';
import { getReportEventRepository } from '../../repositories/report-event.repository';
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
  | { ok: true; session: NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>; caps: Awaited<ReturnType<typeof getPlatformCapabilities>> };

async function requireModeratorSession(request: Request, errors: RouteContext['errors']): Promise<ModeratorAuthResult> {
  const session = await getSessionFromRequest(request);
  if (!session) return { ok: false, error: errors.unauthorized() };

  const caps = await getPlatformCapabilities(session.userId);
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
    resolution: doc.resolution,
    closureReason: doc.closureReason,
    closedBy: doc.closedBy,
    closedAt: doc.closedAt instanceof Date ? doc.closedAt.toISOString() : doc.closedAt,
    escalatedBy: doc.escalatedBy,
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
    actorUserId: doc.actorUserId,
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

  const filter: Record<string, unknown> = {};
  if (statusParam) {
    const statuses = statusParam.split(',').filter((s) => REPORT_STATUSES.includes(s as ReportStatus));
    if (statuses.length === 1) filter.status = statuses[0];
    else if (statuses.length > 1) filter.status = statuses;
  }
  if (assignedParam === 'unassigned') filter.assignedTo = null;
  else if (assignedParam === 'me') filter.assignedTo = auth.session.userId;
  if (typeParam) filter.reportType = typeParam;
  if (categoryParam) filter.category = categoryParam;

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

  return success({
    report: toPublicReport(report as unknown as Record<string, unknown>),
    events: events.map((e) => toPublicEvent(e as unknown as Record<string, unknown>)),
  });
});

// ---------------------------------------------------------------------------
// POST /moderation/reports/:id/assign
// ---------------------------------------------------------------------------

const AssignSchema = z.object({ userId: z.string().min(1) });

router.post('/moderation/reports/:id/assign', async (ctx): Promise<Response> => {
  const auth = await requireModeratorSession(ctx.request, ctx.errors);
  if (!auth.ok) return auth.error;

  const id = ctx.params.id;
  if (!id || !isValidObjectId(id)) return ctx.errors.badRequest();

  const body = AssignSchema.safeParse(ctx.body);
  if (!body.success) return ctx.errors.validationFailed();

  const repo = getReportRepository();
  const updated = await repo.assign(id, body.data.userId);
  if (!updated) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorUserId: auth.session.userId,
    metadata: { assignedTo: body.data.userId },
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
  const updated = await repo.unassign(id);
  if (!updated) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'assignment_change',
    actorUserId: auth.session.userId,
    metadata: { assignedTo: null },
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
  const updated = await repo.escalate(id, auth.session.userId);
  if (!updated) return ctx.errors.notFound();

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorUserId: auth.session.userId,
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
    actorUserId: auth.session.userId,
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
    actorUserId: auth.session.userId,
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
      actorUserId: auth.session.userId,
      reason: body.data.reason,
    },
  );

  const updated = await repo.resolve(id, {
    contentRemoved: body.data.removeContent,
    userWarned: body.data.warnUser,
    aliasSuspendedMs: body.data.suspendAliasMs,
    aliasBanned: body.data.banAlias,
    reason: body.data.reason,
    resolvedBy: auth.session.userId,
    resolvedAt: new Date(),
  });

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorUserId: auth.session.userId,
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

  const updated = await repo.close(id, auth.session.userId, body.data.reason);

  const eventRepo = getReportEventRepository();
  await eventRepo.createEvent({
    reportId: new ObjectId(id),
    eventType: 'status_change',
    actorUserId: auth.session.userId,
    body: `Report closed (invalid): ${body.data.reason}`,
    metadata: { from: report.status, to: 'closed' },
  });

  return success(toPublicReport(updated as unknown as Record<string, unknown>));
});

export const moderationRoutes = router;
