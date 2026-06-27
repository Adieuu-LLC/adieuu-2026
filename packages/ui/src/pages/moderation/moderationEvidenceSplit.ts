/**
 * Split message report evidence into primary context vs extra history for moderator UI.
 *
 * @module pages/moderation/moderationEvidenceSplit
 */

import type { PublicMessageEvidence } from '@adieuu/shared';

/** Inner strip: 3 before/after when reporter chose 3; 5 before/after when they chose 5+. */
export function primaryContextRadius(contextMessageCount: number | undefined): number {
  const c = contextMessageCount ?? 3;
  return c <= 3 ? 3 : 5;
}

export interface SplitMessageEvidenceResult {
  olderContext: PublicMessageEvidence[];
  primaryBefore: PublicMessageEvidence[];
  target: PublicMessageEvidence | undefined;
  primaryAfter: PublicMessageEvidence[];
  newerContext: PublicMessageEvidence[];
  /** When true, render a flat list (no target marker found). */
  fallbackFlat: boolean;
}

export function splitMessageEvidenceForModeration(
  messageEvidence: PublicMessageEvidence[],
  contextMessageCount: number | undefined,
): SplitMessageEvidenceResult {
  const targetIdx = messageEvidence.findIndex((m) => m.isTargetMessage);
  if (targetIdx < 0) {
    return {
      olderContext: [],
      primaryBefore: [],
      target: undefined,
      primaryAfter: [],
      newerContext: [],
      fallbackFlat: true,
    };
  }

  const primaryRadius = primaryContextRadius(contextMessageCount);
  const target = messageEvidence[targetIdx];
  const before = messageEvidence.slice(0, targetIdx);
  const after = messageEvidence.slice(targetIdx + 1);

  const primaryBefore = before.slice(Math.max(0, before.length - primaryRadius));
  const olderContext = before.slice(0, Math.max(0, before.length - primaryRadius));

  const primaryAfter = after.slice(0, Math.min(primaryRadius, after.length));
  const newerContext = after.slice(primaryAfter.length);

  return {
    olderContext,
    primaryBefore,
    target,
    primaryAfter,
    newerContext,
    fallbackFlat: false,
  };
}
