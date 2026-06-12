/**
 * Compliance route handlers.
 */

import { z } from '@adieuu/shared/schemas';
import type { UserDocument } from '../../models/user';
import { submitVpnAttestation } from '../../services/compliance/compliance-enforcement.service';

export const VpnAttestationSchema = z.object({
  step: z.enum(['sanctioned_membership', 'utah_residency']),
  answer: z.enum(['yes', 'no']),
});

export type VpnAttestationHandlerResult =
  | { ok: true; next?: 'utah_notice' | 'continue' }
  | { ok: false; reason: 'unauthorized' | 'validation_failed' | 'no_pending' | 'invalid_step' | 'ip_mismatch' }
  | { ok: false; banned: true; silent: true };

export async function postVpnAttestationHandler(
  ip: string,
  user: UserDocument,
  body: unknown,
): Promise<VpnAttestationHandlerResult> {
  const parsed = VpnAttestationSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, reason: 'validation_failed' };
  }

  const result = await submitVpnAttestation(
    user,
    ip,
    parsed.data.step,
    parsed.data.answer,
  );

  if ('banned' in result && result.banned) {
    return { ok: false, banned: true, silent: true };
  }

  if (!result.ok && 'reason' in result) {
    return { ok: false, reason: result.reason };
  }

  if (result.ok) {
    return { ok: true, next: result.next };
  }

  return { ok: false, banned: true, silent: true };
}
