/**
 * Account referral controller.
 */

import {
  createReferralCode,
  deleteReferralCode,
  getReferralStats,
  redeemReferralCode,
  updateReferralCode,
  type ReferralCreateReason,
  type ReferralDeleteReason,
  type ReferralRedeemReason,
  type ReferralStatsResult,
  type ReferralUpdateReason,
  type PublicReferralCode,
} from '../../../services/referral.service';

export type GetReferralStatsResult =
  | { ok: true; data: ReferralStatsResult }
  | { ok: false; reason: 'user_not_found' };

export async function getReferralStatsForUser(userId: string): Promise<GetReferralStatsResult> {
  const stats = await getReferralStats(userId);
  if (!stats) return { ok: false, reason: 'user_not_found' };
  return { ok: true, data: stats };
}

export async function createReferralCodeForUser(
  userId: string,
  body: { code?: unknown; customMessage?: unknown } | undefined,
): Promise<
  | { ok: true; data: PublicReferralCode }
  | { ok: false; reason: ReferralCreateReason }
> {
  const result = await createReferralCode(userId, body?.code, body?.customMessage);
  if (!result.ok) return result;
  return { ok: true, data: result.code };
}

export async function updateReferralCodeForUser(
  userId: string,
  codeId: string,
  body: { code?: unknown; customMessage?: unknown } | undefined,
): Promise<
  | { ok: true; data: PublicReferralCode }
  | { ok: false; reason: ReferralUpdateReason }
> {
  const result = await updateReferralCode(userId, codeId, {
    code: body?.code,
    customMessage: body?.customMessage,
  });
  if (!result.ok) return result;
  return { ok: true, data: result.code };
}

export async function deleteReferralCodeForUser(
  userId: string,
  codeId: string,
): Promise<{ ok: true } | { ok: false; reason: ReferralDeleteReason }> {
  return deleteReferralCode(userId, codeId);
}

export async function redeemReferralCodeForUser(
  userId: string,
  code: unknown,
): Promise<
  | { ok: true; data: { code: string; attributedAt: string } }
  | { ok: false; reason: ReferralRedeemReason }
> {
  const result = await redeemReferralCode(userId, code);
  if (!result.ok) return result;
  return {
    ok: true,
    data: { code: result.code, attributedAt: result.attributedAt },
  };
}
