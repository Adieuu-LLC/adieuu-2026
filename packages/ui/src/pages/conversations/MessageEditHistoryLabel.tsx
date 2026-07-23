import { useCallback } from 'react';
import type { DisplayMessage } from '../../hooks/useConversations';
import { useConversations } from '../../hooks/useConversations';
import { EditHistoryLabel } from '../../components/messaging/EditHistoryLabel';

type Props = {
  message: DisplayMessage;
  className?: string;
  variant?: 'header' | 'footer';
};

/**
 * Conversation-specific wrapper around the shared {@link EditHistoryLabel}.
 * Loads edit history via the conversation API and E2E decryption pipeline.
 */
export function MessageEditHistoryLabel({ message, className, variant = 'header' }: Props) {
  const { loadMessageEditHistory } = useConversations();

  const loadHistory = useCallback(async () => {
    if (!message.conversationId) return null;
    return loadMessageEditHistory(message.conversationId, message);
  }, [loadMessageEditHistory, message]);

  return (
    <EditHistoryLabel
      lastEditedAt={message.lastEditedAt}
      loadHistory={loadHistory}
      className={className}
      variant={variant}
    />
  );
}
