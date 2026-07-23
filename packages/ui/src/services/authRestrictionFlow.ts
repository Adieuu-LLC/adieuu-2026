import type { AccountModerationCategory } from '@adieuu/shared';

export interface AccountRestrictionInfo {
  type: 'banned' | 'suspended';
  reason?: string;
  category?: AccountModerationCategory;
  bannedPeerCount?: number;
  suspendedUntil?: string;
}

/**
 * Maps an API error code + details into structured account restriction info.
 * Returns undefined when the error code is not a known restriction.
 */
export function resolveAccountRestriction(
  errorCode?: string,
  details?: {
    moderationReason?: string;
    moderationCategory?: AccountModerationCategory;
    bannedPeerCount?: number;
    suspendedUntil?: string;
  },
): AccountRestrictionInfo | undefined {
  if (errorCode === 'ACCOUNT_BANNED') {
    return {
      type: 'banned',
      reason: details?.moderationReason,
      category: details?.moderationCategory,
      bannedPeerCount: details?.bannedPeerCount,
    };
  }
  if (errorCode === 'ACCOUNT_SUSPENDED') {
    return {
      type: 'suspended',
      reason: details?.moderationReason,
      suspendedUntil: details?.suspendedUntil,
    };
  }
  return undefined;
}

export function isOfacSanctionedBan(category?: AccountModerationCategory): boolean {
  return category === 'ofac_sanctioned';
}
