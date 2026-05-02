import { useRef, useEffect, useCallback } from 'react';
import type { RecipientKeys } from '../../services/conversationCryptoService';
import type { ReactionCustomEmoji } from '../../services/reactionCryptoService';
import type { DisplayMessage } from '../useConversations';
import type { DecryptedConversation } from './types';

export function useConversationReactionHandlers(params: {
  conversationId: string | undefined;
  conversation: DecryptedConversation | undefined;
  activeMessages: DisplayMessage[];
  fetchReactions: (messageIds: string[]) => void | Promise<unknown>;
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
    fetchReactions,
    addReaction,
    removeReaction,
    fetchRecipientKeys,
    scrollToBottomIfPinned,
  } = params;

  const fetchedReactionsForRef = useRef<string | null>(null);
  const pendingReactionsRef = useRef<Set<string>>(new Set());
  const activeMessagesRef = useRef(activeMessages);
  activeMessagesRef.current = activeMessages;
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  useEffect(() => {
    if (!conversationId || activeMessages.length === 0) return;

    const key = `${conversationId}:${activeMessages.length}`;
    if (fetchedReactionsForRef.current === key) return;
    fetchedReactionsForRef.current = key;

    const messageIds = activeMessages.map((m) => m.id);
    void fetchReactions(messageIds);
  }, [conversationId, activeMessages, fetchReactions]);

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
    async (messageId: string, emoji: string, ownReactionId?: string) => {
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
        await handleReact(messageId, emoji);
      }
    },
    [removeReaction, handleReact, scrollToBottomIfPinned]
  );

  return {
    /** Cleared when switching active conversation (see ConversationView). */
    fetchedReactionsForRef,
    handleReact,
    handleToggleReaction,
  };
}
