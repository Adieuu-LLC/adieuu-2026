/**
 * Helpers for Space ban lifecycle (active check + duration → expiry).
 *
 * @module services/space/ban-utils
 */

import type { SpaceBanDuration } from '@adieuu/shared';
import type { SpaceMemberDocument } from '../../models/space-member';

const BAN_DURATION_MS: Record<Exclude<SpaceBanDuration, 'permanent'>, number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

export function banExpiresAtForDuration(duration: SpaceBanDuration, from = new Date()): Date | null {
  if (duration === 'permanent') return null;
  return new Date(from.getTime() + BAN_DURATION_MS[duration]);
}

/** True when the membership is banned and the ban has not expired. */
export function isSpaceBanActive(member: SpaceMemberDocument, now = new Date()): boolean {
  if (member.status !== 'banned') return false;
  if (member.banExpiresAt == null) return true;
  return member.banExpiresAt.getTime() > now.getTime();
}
