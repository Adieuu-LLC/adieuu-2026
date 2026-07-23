import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
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
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = messageSearchSessionActive;

  const identityIdRef = useRef(identityId);
  identityIdRef.current = identityId;
  const adminDisallowRef = useRef(adminDisallowPersistentCache);
  adminDisallowRef.current = adminDisallowPersistentCache;

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
    const outgoingConversationId = conversationId;

    setMessageSearchSessionActive(false);
    setActivePane(null);

    return () => {
      const outgoingIdentityId = identityIdRef.current;
      if (sessionActiveRef.current && outgoingConversationId && outgoingIdentityId) {
        endMessageSearchSessionAndWipeCache({
          identityId: outgoingIdentityId,
          conversationId: outgoingConversationId,
          adminDisallowPersistentCache: adminDisallowRef.current,
        });
      }
    };
  }, [conversationId, setActivePane]);

  return {
    messageSearchSessionActive,
    handleToggleMessageSearch,
    handleMessageSearchEndSession,
  };
}
