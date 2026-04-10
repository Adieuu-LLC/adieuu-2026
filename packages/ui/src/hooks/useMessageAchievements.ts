/**
 * Client-side achievement detection for message content.
 *
 * Since messages are E2E encrypted, the server never sees plaintext.
 * Detection runs locally after a successful send; claims are
 * fire-and-forget via the existing claim endpoint.
 */

import { useCallback } from 'react';
import { useClaimAchievement } from './useClaimAchievement';
import { useIdentity } from './useIdentity';
import { containsProfanity } from '../utils/profanityCheck';

const CONTAINS_42_RE = /\b42\b/;
const CONTAINS_420_RE = /\b420\b/;
const SAILOR_THRESHOLD = 25;

function getCurseCount(identityId: string): number {
  try {
    return parseInt(localStorage.getItem(`ach_curse_${identityId}`) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function setCurseCount(identityId: string, count: number): void {
  try {
    localStorage.setItem(`ach_curse_${identityId}`, String(count));
  } catch { /* quota exceeded or unavailable */ }
}

export function useMessageAchievements() {
  const claim = useClaimAchievement();
  const { identity } = useIdentity();

  return useCallback(
    (plaintext: string) => {
      if (!identity) return;

      if (CONTAINS_42_RE.test(plaintext)) {
        claim('message_contains_42');
      }

      if (CONTAINS_420_RE.test(plaintext)) {
        claim('message_contains_420');
      }

      if (containsProfanity(plaintext)) {
        claim('curse_word_message_sent');

        const next = getCurseCount(identity.id) + 1;
        setCurseCount(identity.id, next);
        if (next >= SAILOR_THRESHOLD) {
          claim('curse_word_messages_25');
        }
      }
    },
    [claim, identity],
  );
}
