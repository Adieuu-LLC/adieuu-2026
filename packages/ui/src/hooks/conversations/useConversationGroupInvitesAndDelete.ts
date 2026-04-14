import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import {
  createApiClient,
  type PublicConversation,
  type PublicGroupInvite,
  type GroupInvitePreview,
  type FormerMember,
} from '@adieuu/shared';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import {
  addMemberAction,
  listPendingGroupInvitesAction,
  revokeGroupInviteAction,
  leaveGroupAction,
  promoteToAdminAction,
  removeMemberAction,
  renameGroupAction,
  terminateGroupAction,
  updateMemberSettingsAction,
} from '../../services/conversationGroupActions';
import type { ConversationMessagesState, DecryptedConversation } from './types';

type ApiClient = ReturnType<typeof createApiClient>;

export interface ConversationGroupInvitesAndDeleteParams {
  api: ApiClient;
  fetchConversations: () => Promise<void>;
  fetchMessagesRef: MutableRefObject<
    (
      conversationId: string,
      paginationCursor?: string,
      silent?: boolean,
      mergeLatest?: boolean,
      direction?: 'older' | 'newer'
    ) => Promise<void>
  >;
  activeConversationIdRef: MutableRefObject<string | null>;
  setConversations: Dispatch<SetStateAction<DecryptedConversation[]>>;
  setActiveConversationId: Dispatch<SetStateAction<string | null>>;
  activeConversationId: string | null;
  setPendingInvitesRefreshSignal: Dispatch<
    SetStateAction<{ conversationId: string; nonce: number } | null>
  >;
  setInvites: Dispatch<SetStateAction<PublicGroupInvite[]>>;
  setMessagesState: Dispatch<SetStateAction<Record<string, ConversationMessagesState>>>;
  toDecrypted: (conv: PublicConversation) => DecryptedConversation;
}

/**
 * Group membership, invites, GIF policy, message deletion, and former-member listing.
 */
export function useConversationGroupInvitesAndDelete(
  params: ConversationGroupInvitesAndDeleteParams
) {
  const {
    api,
    fetchConversations,
    fetchMessagesRef,
    activeConversationIdRef,
    setConversations,
    setActiveConversationId,
    activeConversationId,
    setPendingInvitesRefreshSignal,
    setInvites,
    setMessagesState,
    toDecrypted,
  } = params;

  const invitePreviewCache = useRef<Record<string, GroupInvitePreview>>({});

  const addMember = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await addMemberAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const removeMember = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await removeMemberAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const leaveGroup = useCallback(
    async (
      conversationId: string,
      options?: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }
    ): Promise<boolean> => {
      const ok = await leaveGroupAction(api, conversationId, options);
      if (!ok) return false;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      return true;
    },
    [api, activeConversationId]
  );

  const promoteToAdmin = useCallback(
    async (conversationId: string, identityId: string): Promise<boolean> => {
      const ok = await promoteToAdminAction(api, conversationId, identityId);
      if (!ok) return false;
      await fetchConversations();
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api, fetchConversations]
  );

  const onPendingInvitesChanged = useCallback((conversationId: string) => {
    setPendingInvitesRefreshSignal({ conversationId, nonce: Date.now() });
  }, []);

  const listPendingGroupInvites = useCallback(
    async (conversationId: string) => listPendingGroupInvitesAction(api, conversationId),
    [api]
  );

  const revokeGroupInvite = useCallback(
    async (conversationId: string, inviteId: string): Promise<boolean> => {
      const ok = await revokeGroupInviteAction(api, conversationId, inviteId);
      if (ok) {
        setPendingInvitesRefreshSignal({ conversationId, nonce: Date.now() });
      }
      return ok;
    },
    [api]
  );

  const terminateGroup = useCallback(
    async (conversationId: string): Promise<boolean> => {
      const ok = await terminateGroupAction(api, conversationId);
      if (!ok) return false;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
      }
      return true;
    },
    [api, activeConversationId]
  );

  const renameGroup = useCallback(
    async (conversationId: string, newName: string): Promise<boolean> => {
      const result = await renameGroupAction(api, conversationId, newName);
      if (!result.ok) return false;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                encryptedName: result.encryptedName,
                nameNonce: result.nameNonce,
                decryptedName: newName,
              }
            : c
        )
      );
      if (conversationId === activeConversationIdRef.current) {
        fetchMessagesRef.current(conversationId, undefined, true);
      }
      return true;
    },
    [api]
  );

  const updateConversationMemberSettings = useCallback(
    async (conversationId: string, settings: MemberSettingsMap): Promise<boolean> => {
      const result = await updateMemberSettingsAction(api, conversationId, settings);
      if (!result.ok) return false;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                encryptedMemberSettings: result.encryptedMemberSettings,
                memberSettingsNonce: result.memberSettingsNonce,
                decryptedMemberSettings: settings,
              }
            : c
        )
      );
      return true;
    },
    [api]
  );

  const updateGifsDisabled = useCallback(
    async (conversationId: string, gifsDisabled: boolean): Promise<boolean> => {
      const resp = await api.conversations.updateGifsDisabled(conversationId, gifsDisabled);
      if (!resp.success || !resp.data) return false;
      const updated = toDecrypted(resp.data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...updated, unreadCount: c.unreadCount } : c
        )
      );
      return true;
    },
    [api, toDecrypted]
  );

  const pinMessage = useCallback(
    async (conversationId: string, messageId: string): Promise<boolean> => {
      const resp = await api.conversations.pinMessage(conversationId, messageId);
      if (!resp.success || !resp.data) return false;
      const updated = toDecrypted(resp.data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...updated, unreadCount: c.unreadCount } : c
        )
      );
      return true;
    },
    [api, toDecrypted]
  );

  const unpinMessage = useCallback(
    async (conversationId: string, messageId: string): Promise<boolean> => {
      const resp = await api.conversations.unpinMessage(conversationId, messageId);
      if (!resp.success || !resp.data) return false;
      const updated = toDecrypted(resp.data);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...updated, unreadCount: c.unreadCount } : c
        )
      );
      return true;
    },
    [api, toDecrypted]
  );

  const deleteMessage = useCallback(
    async (conversationId: string, messageId: string, forEveryone: boolean): Promise<boolean> => {
      try {
        const resp = forEveryone
          ? await api.conversations.deleteMessageForEveryone(conversationId, messageId)
          : await api.conversations.deleteMessageForSelf(conversationId, messageId);

        if (resp.success) {
          setMessagesState((prev) => {
            const state = prev[conversationId];
            if (!state) return prev;
            return {
              ...prev,
              [conversationId]: {
                ...state,
                messages: state.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, deleted: true, decryptedContent: undefined, ciphertext: undefined }
                    : m
                ),
              },
            };
          });
          if (forEveryone) {
            setConversations((prev) =>
              prev.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      pinnedMessageIds: (c.pinnedMessageIds ?? []).filter((pid) => pid !== messageId),
                    }
                  : c
              )
            );
          }
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api, setConversations]
  );

  const acceptInvite = useCallback(
    async (inviteId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.acceptInvite(inviteId);
        if (resp.success) {
          setInvites((prev) => prev.filter((i) => i.id !== inviteId));
          await fetchConversations();
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api, fetchConversations]
  );

  const declineInvite = useCallback(
    async (inviteId: string): Promise<boolean> => {
      try {
        const resp = await api.conversations.declineInvite(inviteId);
        if (resp.success) {
          setInvites((prev) => prev.filter((i) => i.id !== inviteId));
          return true;
        }
      } catch {
        // Error
      }
      return false;
    },
    [api]
  );

  const getInvitePreview = useCallback(
    async (inviteId: string): Promise<GroupInvitePreview | null> => {
      if (invitePreviewCache.current[inviteId]) {
        return invitePreviewCache.current[inviteId];
      }
      try {
        const resp = await api.conversations.getInvitePreview(inviteId);
        if (resp.data) {
          invitePreviewCache.current[inviteId] = resp.data;
          return resp.data;
        }
      } catch {
        // Error
      }
      return null;
    },
    [api]
  );

  const getFormerMembers = useCallback(
    async (conversationId: string): Promise<FormerMember[]> => {
      try {
        const resp = await api.conversations.getFormerMembers(conversationId);
        if (resp.data) {
          return resp.data;
        }
      } catch {
        // Error
      }
      return [];
    },
    [api]
  );

  return {
    addMember,
    removeMember,
    leaveGroup,
    promoteToAdmin,
    onPendingInvitesChanged,
    listPendingGroupInvites,
    revokeGroupInvite,
    terminateGroup,
    renameGroup,
    updateConversationMemberSettings,
    updateGifsDisabled,
    pinMessage,
    unpinMessage,
    deleteMessage,
    acceptInvite,
    declineInvite,
    getInvitePreview,
    getFormerMembers,
  };
}
