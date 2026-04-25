import {
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type {
  ChatConnectionState,
  ChatIncomingMessage,
  PublicGroupInvite,
  PublicIdentity,
} from '@adieuu/shared';
import type { TFunction } from 'i18next';
import { loadReactionNotificationsEnabled } from '../useReactionNotificationPreference';
import { handleConversationSocketMessage } from '../../services/conversationSocketHandlers';
import { sidebarActions } from '../../utils/sidebarActions';
import type { ConversationMessagesState, DecryptedConversation } from './types';

export interface ConversationsSocketEffectsParams {
  isLoggedIn: boolean;
  subscribe: (handler: (message: ChatIncomingMessage) => void) => () => void;
  onStateChange: (handler: (state: ChatConnectionState) => void) => () => void;
  setConversations: Dispatch<SetStateAction<DecryptedConversation[]>>;
  setMessagesState: Dispatch<SetStateAction<Record<string, ConversationMessagesState>>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  setInvites: Dispatch<SetStateAction<PublicGroupInvite[]>>;
  identityRef: MutableRefObject<PublicIdentity | null>;
  activeConversationIdRef: MutableRefObject<string | null>;
  isAtBottomRef: MutableRefObject<boolean>;
  messagesStateRef: MutableRefObject<Record<string, ConversationMessagesState>>;
  participantProfilesRef: MutableRefObject<Record<string, PublicIdentity>>;
  fetchConversationsRef: MutableRefObject<() => Promise<void>>;
  fetchMessagesRef: MutableRefObject<
    (
      conversationId: string,
      paginationCursor?: string,
      silent?: boolean,
      mergeLatest?: boolean,
      direction?: 'older' | 'newer'
    ) => Promise<void>
  >;
  /** Replace one message in buffer after a remote edit (E2E ciphertext update). */
  refreshMessageInConversationRef: MutableRefObject<
    (conversationId: string, messageId: string) => Promise<void>
  >;
  refreshRef: MutableRefObject<() => Promise<void>>;
  fireNotificationRef: MutableRefObject<
    (
      title: string,
      body: string,
      opts?: {
        isViewingConvo?: boolean;
        onClick?: () => void;
        expiresAt?: string;
        isMention?: boolean;
      }
    ) => void
  >;
  navigateRef: MutableRefObject<(path: string) => void>;
  resolveParticipantsRef: MutableRefObject<
    (participantIds: string[]) => Promise<Record<string, PublicIdentity>>
  >;
  refreshParticipantProfileRef: MutableRefObject<(identityId: string) => Promise<void>>;
  onPendingInvitesChangedRef: MutableRefObject<(conversationId: string) => void>;
  tRef: MutableRefObject<TFunction>;
  decryptGroupName: (encryptedName: string, nonce: string, conversationId: string) => string;
}

/**
 * WebSocket message handling, reconnect refresh, and visibility/focus message refresh.
 */
export function useConversationsSocketEffects(params: ConversationsSocketEffectsParams): void {
  const {
    isLoggedIn,
    subscribe,
    onStateChange,
    setConversations,
    setMessagesState,
    setActiveConversationId,
    setInvites,
    identityRef,
    activeConversationIdRef,
    isAtBottomRef,
    messagesStateRef,
    participantProfilesRef,
    fetchConversationsRef,
    fetchMessagesRef,
    refreshMessageInConversationRef,
    refreshRef,
    fireNotificationRef,
    navigateRef,
    resolveParticipantsRef,
    refreshParticipantProfileRef,
    onPendingInvitesChangedRef,
    tRef,
    decryptGroupName,
  } = params;

  const reactionNotifDedupeRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isLoggedIn) return;

    const runReactionNotifOnce = (reactionId: string, fn: () => void) => {
      if (reactionNotifDedupeRef.current.has(reactionId)) return;
      reactionNotifDedupeRef.current.add(reactionId);
      setTimeout(() => {
        reactionNotifDedupeRef.current.delete(reactionId);
      }, 60_000);
      fn();
    };

    const unsubMessage = subscribe((message: ChatIncomingMessage) => {
      handleConversationSocketMessage(message, {
        setConversations: (updater) =>
          setConversations((prev) => updater(prev as never) as never),
        setMessagesState: (updater) =>
          setMessagesState((prev) => updater(prev as never) as never),
        setActiveConversationId,
        setInvites,
        activeConversationId: activeConversationIdRef.current,
        isAtBottom: isAtBottomRef.current,
        hasFocus: document.hasFocus(),
        identityId: identityRef.current?.id,
        messagesState: messagesStateRef.current,
        participantProfiles: participantProfilesRef.current,
        decryptGroupName,
        fetchConversations: () => fetchConversationsRef.current(),
        fetchMessages: (conversationId, paginationCursor, silent, mergeLatest, direction) =>
          void fetchMessagesRef.current(
            conversationId,
            paginationCursor,
            silent,
            mergeLatest,
            direction
          ),
        refreshMessageInConversation: (conversationId, messageId) =>
          void refreshMessageInConversationRef.current(conversationId, messageId),
        fireNotification: (title, body, options) =>
          fireNotificationRef.current(title, body, options),
        navigate: (path) => navigateRef.current(path),
        resolveParticipants: (participantIds) =>
          resolveParticipantsRef.current(participantIds),
        t: (key, options) => String(tRef.current(key, options as never)),
        runReactionNotifOnce,
        loadReactionNotificationsEnabled,
        openInvites: () => sidebarActions.openInvites(),
        refreshParticipantProfile: (identityId) =>
          void refreshParticipantProfileRef.current(identityId),
        onPendingInvitesChanged: (cid) => onPendingInvitesChangedRef.current(cid),
      });
    });

    const unsubState = onStateChange((state) => {
      if (state === 'connected') {
        refreshRef.current();

        const activeId = activeConversationIdRef.current;
        if (activeId) {
          fetchMessagesRef.current(activeId, undefined, true);
        }
      }
    });

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState !== 'visible') return;
      const activeId = activeConversationIdRef.current;
      if (activeId) {
        fetchMessagesRef.current(activeId, undefined, true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      unsubMessage();
      unsubState();
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [isLoggedIn, subscribe, onStateChange]);
}
