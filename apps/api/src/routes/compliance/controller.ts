/**
 * Compliance route handlers.
 */

import type { UserDocument, VpnAttestationStep } from '../../models/user';
import {
  submitVpnAttestation,
  type VpnAttestationAnswer,
} from '../../services/compliance/compliance-enforcement.service';

export type VpnAttestationHandlerResult =
  | { ok: true; next?: 'utah_notice' | 'continue' }
  | { ok: false; reason: 'unauthorized' | 'validation_failed' | 'no_pending' | 'invalid_step' | 'ip_mismatch' }
  | { ok: false; banned: true; silent: true };

export async function postVpnAttestationHandler(
  ip: string,
  user: UserDocument,
  body: unknown,
): Promise<VpnAttestationHandlerResult> {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'validation_failed' };
  }

  const { step, answer } = body as { step?: unknown; answer?: unknown };
  if (step !== 'sanctioned_membership' && step !== 'utah_residency') {
    return { ok: false, reason: 'validation_failed' };
  }
  if (answer !== 'yes' && answer !== 'no') {
    return { ok: false, reason: 'validation_failed' };
  }

  const result = await submitVpnAttestation(
    user,
    ip,
    step as VpnAttestationStep,
    answer as VpnAttestationAnswer,
  );

  if ('banned' in result && result.banned) {
    return { ok: false, banned: true, silent: true };
  }

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  return { ok: true, next: result.next };
}
