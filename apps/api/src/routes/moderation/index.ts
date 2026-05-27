/**
 * Platform moderation routes — report list, detail, and actions.
 *
 * All endpoints require an authenticated user session with appropriate
 * platform permissions. Escalated reports additionally require the
 * `manage-escalated-reports` permission (admin-only in the default role map).
 */

import { Router, type RouteContext } from '../../router';
import { error, success } from '../../utils/response';
import { requireIdentitySession } from '../../services/session.service';
import {
  gateModeratorSession,
  listReportsResult,
  getReportScanEvidenceResult,
  getReportDetailResult,
  listModeratorsResult,
  reopenReportResult,
  assignReportResult,
  unassignReportResult,
  escalateReportResult,
  setReportCategoryResult,
  addReportCommentResult,
  resolveReportResult,
  closeReportResult,
  type ModerationResult,
} from './controller';
import {
  gateSupportStaffSession,
  listTicketsResult,
  getTicketDetailResult,
  listSupportStaffResult,
  assignTicketResult,
  unassignTicketResult,
  addTicketCommentResult,
  escalateTicketResult,
  resolveTicketResult,
  closeTicketResult,
  reopenTicketResult,
  type TicketModerationResult,
} from './tickets-controller';

const router = new Router();

async function requireSupportStaffRouteContext(ctx: RouteContext) {
  const session = await requireIdentitySession(ctx.request);
  const gate = await gateSupportStaffSession(session);
  if (!gate.ok) {
    return {
      ok: false as const,
      response:
        gate.reason === 'unauthorized' ? ctx.errors.unauthorized() : ctx.errors.forbidden(),
    };
  }
  return { ok: true as const, session: gate.session, caps: gate.caps };
}

function mapTicketModerationFailure(
  ctx: RouteContext,
  result: Extract<TicketModerationResult, { ok: false }>,
): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'forbidden':
      return ctx.errors.forbidden();
    case 'not_found':
      return result.message ? error('NOT_FOUND', result.message, 404) : ctx.errors.notFound();
    case 'bad_request':
      return result.message ? error('BAD_REQUEST', result.message, 400) : ctx.errors.badRequest();
    default:
      return ctx.errors.badRequest();
  }
}

async function requireModeratorRouteContext(ctx: RouteContext) {
  const session = await requireIdentitySession(ctx.request);
  const gate = await gateModeratorSession(session);
  if (!gate.ok) {
    return {
      ok: false as const,
      response:
        gate.reason === 'unauthorized' ? ctx.errors.unauthorized() : ctx.errors.forbidden(),
    };
  }
  return { ok: true as const, session: gate.session, caps: gate.caps };
}

function mapModerationFailure(ctx: RouteContext, result: Extract<ModerationResult, { ok: false }>): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'forbidden':
      return ctx.errors.forbidden();
    case 'not_found':
      return result.message ? error('NOT_FOUND', result.message, 404) : ctx.errors.notFound();
    case 'bad_request':
      return result.message ? error('BAD_REQUEST', result.message, 400) : ctx.errors.badRequest();
    default:
      return ctx.errors.badRequest();
  }
}

/**
 * GET /moderation/reports — paginated list with filters
 *
 * @route GET /api/moderation/reports
 */
router.get('/moderation/reports', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await listReportsResult(
    auth.session.identityId,
    new URL(ctx.request.url).searchParams,
  );
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
});

/**
 * GET /moderation/reports/:id/scan-evidence — presigned URLs for Rekognition scan copies
 *
 * @route GET /api/moderation/reports/:id/scan-evidence
 */
router.get('/moderation/reports/:id/scan-evidence', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await getReportScanEvidenceResult(ctx.params.id);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * GET /moderation/reports/:id — report detail with timeline
 *
 * @route GET /api/moderation/reports/:id
 */
router.get('/moderation/reports/:id', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await getReportDetailResult(ctx.params.id);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * GET /moderation/moderators — list all users with moderation permissions
 *
 * @route GET /api/moderation/moderators
 */
router.get('/moderation/moderators', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await listModeratorsResult();
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
});

/**
 * POST /moderation/reports/:id/reopen
 *
 * @route POST /api/moderation/reports/:id/reopen
 */
router.post('/moderation/reports/:id/reopen', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await reopenReportResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/assign
 *
 * @route POST /api/moderation/reports/:id/assign
 */
router.post('/moderation/reports/:id/assign', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await assignReportResult(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/unassign
 *
 * @route POST /api/moderation/reports/:id/unassign
 */
router.post('/moderation/reports/:id/unassign', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await unassignReportResult(auth.session.identityId, ctx.params.id);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/escalate
 *
 * @route POST /api/moderation/reports/:id/escalate
 */
router.post('/moderation/reports/:id/escalate', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await escalateReportResult(auth.session.identityId, ctx.params.id, auth.caps);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/category
 *
 * @route POST /api/moderation/reports/:id/category
 */
router.post('/moderation/reports/:id/category', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await setReportCategoryResult(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/comment
 *
 * @route POST /api/moderation/reports/:id/comment
 */
router.post('/moderation/reports/:id/comment', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await addReportCommentResult(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/resolve
 *
 * @route POST /api/moderation/reports/:id/resolve
 */
router.post('/moderation/reports/:id/resolve', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await resolveReportResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

/**
 * POST /moderation/reports/:id/close
 *
 * @route POST /api/moderation/reports/:id/close
 */
router.post('/moderation/reports/:id/close', async (ctx): Promise<Response> => {
  const auth = await requireModeratorRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await closeReportResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapModerationFailure(ctx, result);

  return success(result.data);
});

router.get('/moderation/tickets', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await listTicketsResult(
    auth.session.identityId,
    new URL(ctx.request.url).searchParams,
  );
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
});

router.get('/moderation/tickets/:id', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await getTicketDetailResult(ctx.params.id);
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.get('/moderation/support-staff', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await listSupportStaffResult();
  if (!result.ok) return ctx.errors.internal();
  return success(result.data);
});

router.post('/moderation/tickets/:id/assign', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await assignTicketResult(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/unassign', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await unassignTicketResult(auth.session.identityId, ctx.params.id);
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/comment', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await addTicketCommentResult(auth.session.identityId, ctx.params.id, ctx.body);
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/escalate', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await escalateTicketResult(auth.session.identityId, ctx.params.id, auth.caps);
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/resolve', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await resolveTicketResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/close', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await closeTicketResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

router.post('/moderation/tickets/:id/reopen', async (ctx): Promise<Response> => {
  const auth = await requireSupportStaffRouteContext(ctx);
  if (!auth.ok) return auth.response;

  const result = await reopenTicketResult(
    auth.session.identityId,
    ctx.params.id,
    ctx.body,
    auth.caps,
  );
  if (!result.ok) return mapTicketModerationFailure(ctx, result);
  return success(result.data);
});

export const moderationRoutes = router;
