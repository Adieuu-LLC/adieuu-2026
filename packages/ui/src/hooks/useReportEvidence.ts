/**
 * Hook for gathering cryptographic evidence for message reports.
 *
 * Identifies the evidence window (target message + up to 3 before/after)
 * and retrieves the per-message session keys required for server-side
 * verification and decryption.
 *
 * @module hooks/useReportEvidence
 */

import { useCallback } from 'react';
import { useConversations, type DisplayMessage } from './useConversations';

const CONTEXT_COUNT = 3;

export interface ReportEvidenceResult {
  evidenceMessageIds: string[];
  sessionKeys: Record<string, string>;
  missingKeys: string[];
}

/**
 * Returns a callback that, given a target message ID, computes the evidence
 * window from the currently loaded conversation messages and gathers the
 * session keys for each message.
 */
export function useReportEvidence() {
  const { activeMessages, getSessionKeysForMessages } = useConversations();

  const gatherEvidence = useCallback(
    async (targetMessageId: string): Promise<ReportEvidenceResult> => {
      const targetIdx = activeMessages.findIndex((m) => m.id === targetMessageId);
      if (targetIdx === -1) {
        return { evidenceMessageIds: [], sessionKeys: {}, missingKeys: [] };
      }

      const start = Math.max(0, targetIdx - CONTEXT_COUNT);
      const end = Math.min(activeMessages.length, targetIdx + CONTEXT_COUNT + 1);
      const window: DisplayMessage[] = activeMessages
        .slice(start, end)
        .filter((m) => !m.deleted && m.messageType !== 'system');

      const messageIds = window.map((m) => m.id);
      const sessionKeys = await getSessionKeysForMessages(messageIds);

      const missingKeys = messageIds.filter((id) => !(id in sessionKeys));

      return { evidenceMessageIds: messageIds, sessionKeys, missingKeys };
    },
    [activeMessages, getSessionKeysForMessages],
  );

  return { gatherEvidence };
}
