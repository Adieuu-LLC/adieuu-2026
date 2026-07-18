import { useRef, useCallback } from 'react';
import type { RecipientKeys } from '../../services/conversationCryptoService';
import type { ReactionCustomEmoji } from '../../services/reactionCryptoService';
import type { DisplayMessage } from '../useConversations';
import type { DecryptedConversation } from './types';

export function useConversationReactionHandlers(params: {
  conversationId: string | undefined;
  conversation: DecryptedConversation | undefined;
  activeMessages: DisplayMessage[];
  addReaction: (messageId: string, emoji: string, recipients: RecipientKeys[], customEmoji?: ReactionCustomEmoji) => Promise<unknown>;
  removeReaction: (ownReactionId: string, messageId: string) => Promise<unknown>;
  fetchRecipientKeys: (
    participantIds: string[],
    useForwardSecrecy?: boolean,
    signal?: AbortSignal
  ) => Promise<RecipientKeys[]>;
  scrollToBottomIfPinned: () => void;
}) {
  const {
    conversationId,
    conversation,
    activeMessages,
    addReaction,
    removeReaction,
    fetchRecipientKeys,
    scrollToBottomIfPinned,
  } = params;

  // Reactions are prefetched viewport-scoped via useViewportReactionFetch (see
  // ConversationView); once fetched, realtime add/remove is handled by
  // useReactions' own WebSocket subscription.
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const handleReact = useCallback(
    async (messageId: string, emoji: string, customEmoji?: ReactionCustomEmoji) => {
      if (!conversationId || !conversationRef.current) return;
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      pendingReactionsRef.current.add(key);
      try {
        const targetMsg = activeMessagesRef.current.find((m) => m.id === messageId);
        const useForwardSecrecy = targetMsg?.forwardSecrecy ?? false;
        const recipients = await fetchRecipientKeys(conversationRef.current.participants, useForwardSecrecy);
        if (recipients.length === 0) return;
        await addReaction(messageId, emoji, recipients, customEmoji);
        scrollToBottomIfPinned();
      } finally {
        pendingReactionsRef.current.delete(key);
      }
    },
    [conversationId, addReaction, fetchRecipientKeys, scrollToBottomIfPinned]
  );

  const handleToggleReaction = useCallback(
    async (
      messageId: string,
      emoji: string,
      ownReactionId?: string,
      customEmoji?: ReactionCustomEmoji,
    ) => {
      const key = `${messageId}:${emoji}`;
      if (pendingReactionsRef.current.has(key)) return;
      if (ownReactionId) {
        pendingReactionsRef.current.add(key);
        try {
          await removeReaction(ownReactionId, messageId);
          scrollToBottomIfPinned();
        } finally {
          pendingReactionsRef.current.delete(key);
        }
      } else {
        await handleReact(messageId, emoji, customEmoji);
      }
    },
    [removeReaction, handleReact, scrollToBottomIfPinned]
  );

  return {
    handleReact,
    handleToggleReaction,
  };
}
