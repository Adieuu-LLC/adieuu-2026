/**
 * Compliance routes (account session only).
 */

import { ACCOUNT_MODERATION_PRESETS } from '@adieuu/shared';
import { Router } from '../../router';
import { success, error as errorResponse } from '../../utils/response';
import { appendAuthClearCookies, requireAccountSession } from '../../services/session.service';
import { getUserRepository } from '../../repositories/user.repository';
import { postVpnAttestationHandler } from './controller';
import { getClientIp } from '../auth/controller';

const router = new Router();

router.post('/compliance/vpn-attestation', async (ctx) => {
  const session = await requireAccountSession(ctx.request);
  if (!session) return ctx.errors.unauthorized();

  const userRepo = getUserRepository();
  const user = await userRepo.findById(session.userId);
  if (!user) return ctx.errors.unauthorized();

  const ip = getClientIp(ctx.request);
  const result = await postVpnAttestationHandler(ip, user, ctx.body);

  if ('banned' in result && result.banned) {
    const moderationReason = ACCOUNT_MODERATION_PRESETS.ofac_self_attestation;
    const response = errorResponse('ACCOUNT_BANNED', moderationReason, 403, {
      moderationReason,
      moderationCategory: 'ofac_self_attestation',
    });
    const headers = new Headers(response.headers);
    appendAuthClearCookies(headers);
    return new Response(response.body, { status: response.status, headers });
  }

  if (!result.ok) {
    if ('reason' in result) {
      if (result.reason === 'no_pending' || result.reason === 'ip_mismatch') {
        return errorResponse('COMPLIANCE_ATTESTATION_INVALID', 'No attestation is pending for this session.', 400);
      }
      if (result.reason === 'invalid_step') {
        return errorResponse('COMPLIANCE_ATTESTATION_INVALID', 'Invalid attestation step.', 400);
      }
    }
    return errorResponse('VALIDATION_FAILED', 'Invalid request.', 400);
  }

  return success({ next: result.next ?? 'continue' });
});

export const complianceRoutes = router;
