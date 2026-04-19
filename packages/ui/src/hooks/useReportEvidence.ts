/**
 * Hook for gathering cryptographic evidence for message reports.
 *
 * Loads a server-aligned window around the target (same bounds as the report API),
 * then collects per-message session keys for server-side verification.
 *
 * @module hooks/useReportEvidence
 */

import { useCallback } from 'react';
import type { ReportContextMessageCount } from '@adieuu/shared';
import { useConversations } from './useConversations';

export interface ReportEvidenceResult {
  evidenceMessageIds: string[];
  sessionKeys: Record<string, string>;
  missingKeys: string[];
}

export function useReportEvidence() {
  const { getSessionKeysForMessages, fetchMessagesAround } = useConversations();

  const gatherEvidence = useCallback(
    async (
      targetMessageId: string,
      conversationId: string,
      contextMessageCount: ReportContextMessageCount,
    ): Promise<ReportEvidenceResult> => {
      const msgs = await fetchMessagesAround(conversationId, targetMessageId, {
        before: contextMessageCount,
        after: contextMessageCount,
        skipStateUpdate: true,
        silent: true,
      });

      if (msgs == null) {
        return { evidenceMessageIds: [], sessionKeys: {}, missingKeys: [targetMessageId] };
      }

      const window = msgs.filter((m) => !m.deleted && m.messageType !== 'system');

      if (!window.some((m) => m.id === targetMessageId)) {
        return { evidenceMessageIds: [], sessionKeys: {}, missingKeys: [targetMessageId] };
      }

      const messageIds = window.map((m) => m.id);
      const sessionKeys = await getSessionKeysForMessages(messageIds);
      const missingKeys = messageIds.filter((id) => !(id in sessionKeys));

      return { evidenceMessageIds: messageIds, sessionKeys, missingKeys };
    },
    [fetchMessagesAround, getSessionKeysForMessages],
  );

  return { gatherEvidence };
}
