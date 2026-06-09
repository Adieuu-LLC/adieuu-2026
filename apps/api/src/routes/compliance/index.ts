/**
 * Compliance routes (account session only).
 */

import { Router } from '../../router';
import { success, error as errorResponse } from '../../utils/response';
import { requireAccountSession } from '../../services/session.service';
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
    return errorResponse('ACCOUNT_BANNED', 'Access denied.', 403, {
      moderationCategory: 'ofac_self_attestation',
    });
  }

  if (!result.ok) {
    if (result.reason === 'no_pending' || result.reason === 'ip_mismatch') {
      return errorResponse('COMPLIANCE_ATTESTATION_INVALID', 'No attestation is pending for this session.', 400);
    }
    if (result.reason === 'invalid_step') {
      return errorResponse('COMPLIANCE_ATTESTATION_INVALID', 'Invalid attestation step.', 400);
    }
    return errorResponse('VALIDATION_FAILED', 'Invalid request.', 400);
  }

  return success({ next: result.next ?? 'continue' });
});

export const complianceRoutes = router;
