import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { endMessageSearchSessionAndWipeCache } from '../../services/messageSearch/messageSearchSessionEnd';

export type ConversationPane = 'settings' | 'members' | 'search' | null;

/**
 * Message-search session lifecycle: toggling the search pane on/off and
 * wiping the search cache when the session ends. The active pane itself stays
 * owned by the parent so it can coordinate with settings/members panes.
 */
export function useConversationMessageSearchSession(params: {
  conversationId: string | undefined;
  identityId: string | undefined;
  adminDisallowPersistentCache: boolean;
  activePane: ConversationPane;
  setActivePane: Dispatch<SetStateAction<ConversationPane>>;
}) {
  const { conversationId, identityId, adminDisallowPersistentCache, activePane, setActivePane } = params;
  const [messageSearchSessionActive, setMessageSearchSessionActive] = useState(false);

  const handleMessageSearchEndSession = useCallback(() => {
    setMessageSearchSessionActive(false);
    setActivePane((prev) => (prev === 'search' ? null : prev));
  }, [setActivePane]);

  const handleToggleMessageSearch = useCallback(() => {
    if (!messageSearchSessionActive) {
      setMessageSearchSessionActive(true);
      setActivePane('search');
      return;
    }
    if (activePane !== 'search') {
      setActivePane('search');
      return;
    }
    if (conversationId && identityId) {
      endMessageSearchSessionAndWipeCache({
        identityId,
        conversationId,
        adminDisallowPersistentCache,
      });
    }
    handleMessageSearchEndSession();
  }, [
    messageSearchSessionActive,
    activePane,
    conversationId,
    identityId,
    adminDisallowPersistentCache,
    handleMessageSearchEndSession,
    setActivePane,
  ]);

  useEffect(() => {
    setMessageSearchSessionActive(false);
    setActivePane(null);
  }, [conversationId, setActivePane]);

  return {
    messageSearchSessionActive,
    handleToggleMessageSearch,
    handleMessageSearchEndSession,
  };
}
