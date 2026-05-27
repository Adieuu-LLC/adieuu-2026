/**
 * User-facing support ticket routes.
 */

import { Router, type RouteContext } from '../../router';
import { success, error } from '../../utils/response';
import {
  resolveSubmitterContext,
  createTicketResult,
  listOwnTicketsResult,
  getOwnTicketResult,
  addOwnCommentResult,
  resolveOwnTicketResult,
  type SupportResult,
} from './controller';

const router = new Router();

function mapSupportFailure(ctx: RouteContext, result: Extract<SupportResult, { ok: false }>): Response {
  switch (result.kind) {
    case 'validation_failed':
      return ctx.errors.validationFailed();
    case 'unauthorized':
      return ctx.errors.unauthorized();
    case 'forbidden':
      return ctx.errors.forbidden();
    case 'not_found':
      return result.message ? error('NOT_FOUND', result.message, 404) : ctx.errors.notFound();
    case 'rate_limited':
      return ctx.errors.rateLimited();
    case 'bad_request':
      return result.message ? error('BAD_REQUEST', result.message, 400) : ctx.errors.badRequest();
    default:
      return ctx.errors.badRequest();
  }
}

async function requireSubmitter(ctx: RouteContext) {
  const submitter = await resolveSubmitterContext(ctx.request);
  if (!submitter) {
    return { ok: false as const, response: ctx.errors.unauthorized() };
  }
  return { ok: true as const, submitter };
}

router.post('/support/tickets', async (ctx) => {
  const auth = await requireSubmitter(ctx);
  if (!auth.ok) return auth.response;

  const result = await createTicketResult(auth.submitter, ctx.body);
  if (!result.ok) return mapSupportFailure(ctx, result);
  return success(result.data);
});

router.get('/support/tickets', async (ctx) => {
  const auth = await requireSubmitter(ctx);
  if (!auth.ok) return auth.response;

  const result = await listOwnTicketsResult(
    auth.submitter,
    new URL(ctx.request.url).searchParams,
  );
  if (!result.ok) return mapSupportFailure(ctx, result);
  return success(result.data);
});

router.get('/support/tickets/:ticketId', async (ctx) => {
  const auth = await requireSubmitter(ctx);
  if (!auth.ok) return auth.response;

  const result = await getOwnTicketResult(auth.submitter, ctx.params.ticketId ?? '');
  if (!result.ok) return mapSupportFailure(ctx, result);
  return success(result.data);
});

router.post('/support/tickets/:ticketId/comments', async (ctx) => {
  const auth = await requireSubmitter(ctx);
  if (!auth.ok) return auth.response;

  const result = await addOwnCommentResult(auth.submitter, ctx.params.ticketId ?? '', ctx.body);
  if (!result.ok) return mapSupportFailure(ctx, result);
  return success(result.data);
});

router.post('/support/tickets/:ticketId/resolve', async (ctx) => {
  const auth = await requireSubmitter(ctx);
  if (!auth.ok) return auth.response;

  const result = await resolveOwnTicketResult(auth.submitter, ctx.params.ticketId ?? '', ctx.body);
  if (!result.ok) return mapSupportFailure(ctx, result);
  return success(result.data);
});

export const supportRoutes = router;
