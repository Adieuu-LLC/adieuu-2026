import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { PublicGroupInvite } from '@adieuu/shared';
import type { ConversationMessagesState, DecryptedConversation, DisplayMessage } from './types';

export interface ConversationsAuthLifecycleEffectsParams {
  isLoggedIn: boolean;
  setConversations: Dispatch<SetStateAction<DecryptedConversation[]>>;
  setMessagesState: Dispatch<SetStateAction<Record<string, ConversationMessagesState>>>;
  setReplyParentHydration: Dispatch<
    SetStateAction<Record<string, Record<string, DisplayMessage>>>
  >;
  setInvites: Dispatch<SetStateAction<PublicGroupInvite[]>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  refreshRef: MutableRefObject<() => Promise<void>>;
  activeConversationId: string | null;
  messagesState: Record<string, ConversationMessagesState>;
  fetchMessages: (
    conversationId: string,
    paginationCursor?: string,
    silent?: boolean,
    mergeLatest?: boolean,
    direction?: 'older' | 'newer'
  ) => Promise<void>;
}

/**
 * Logout state reset, initial refresh on login, and retry when active convo had no message state.
 */
export function useConversationsAuthLifecycleEffects(
  params: ConversationsAuthLifecycleEffectsParams
): void {
  const {
    isLoggedIn,
    setConversations,
    setMessagesState,
    setReplyParentHydration,
    setInvites,
    setActiveConversationId,
    refreshRef,
    activeConversationId,
    messagesState,
    fetchMessages,
  } = params;

  const wasLoggedInRef = useRef(isLoggedIn);
  useEffect(() => {
    if (!isLoggedIn && wasLoggedInRef.current) {
      setConversations([]);
      setMessagesState({});
      setReplyParentHydration({});
      setInvites([]);
      setActiveConversationId(null);
    }
    wasLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) {
      refreshRef.current();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn && activeConversationId && !messagesState[activeConversationId]) {
      fetchMessages(activeConversationId);
    }
  }, [isLoggedIn, activeConversationId, messagesState, fetchMessages]);
}
