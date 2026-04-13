import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicGroupInvite } from '@adieuu/shared';
import { useToast } from '../../components/Toast';

export function useConversationPendingInvites(params: {
  conversationId: string | undefined;
  conversationType: 'dm' | 'group' | undefined;
  showMembers: boolean;
  listPendingGroupInvites: (id: string) => Promise<PublicGroupInvite[]>;
  revokeGroupInvite: (convId: string, inviteId: string) => Promise<boolean>;
  prefetchParticipantProfiles: (ids: string[]) => Promise<unknown>;
  pendingInvitesRefreshSignal: { conversationId: string } | null | undefined;
}) {
  const {
    conversationId,
    conversationType,
    showMembers,
    listPendingGroupInvites,
    revokeGroupInvite,
    prefetchParticipantProfiles,
    pendingInvitesRefreshSignal,
  } = params;

  const { t } = useTranslation();
  const toast = useToast();

  const [pendingInvites, setPendingInvites] = useState<PublicGroupInvite[]>([]);
  const [pendingInvitesLoading, setPendingInvitesLoading] = useState(false);

  const refreshPendingInvites = useCallback(async () => {
    if (!conversationId || conversationType !== 'group') return;
    setPendingInvitesLoading(true);
    try {
      const list = await listPendingGroupInvites(conversationId);
      setPendingInvites(list);
    } finally {
      setPendingInvitesLoading(false);
    }
  }, [conversationId, conversationType, listPendingGroupInvites]);

  useEffect(() => {
    if (!showMembers || conversationType !== 'group' || !conversationId) return;
    void refreshPendingInvites();
  }, [showMembers, conversationType, conversationId, refreshPendingInvites]);

  useEffect(() => {
    if (
      !pendingInvitesRefreshSignal ||
      pendingInvitesRefreshSignal.conversationId !== conversationId ||
      !showMembers ||
      conversationType !== 'group'
    ) {
      return;
    }
    void refreshPendingInvites();
  }, [
    pendingInvitesRefreshSignal,
    conversationId,
    showMembers,
    conversationType,
    refreshPendingInvites,
  ]);

  useEffect(() => {
    if (pendingInvites.length === 0) return;
    void prefetchParticipantProfiles(pendingInvites.map((i) => i.invitedIdentityId));
  }, [pendingInvites, prefetchParticipantProfiles]);

  const handleRevokeInvite = useCallback(
    async (inviteId: string) => {
      if (!conversationId) return;
      const ok = await revokeGroupInvite(conversationId, inviteId);
      if (!ok) {
        toast.error(
          t('conversations.revokeInviteFailed', 'Could not revoke the invite.')
        );
      }
    },
    [conversationId, revokeGroupInvite, toast, t]
  );

  return {
    pendingInvites,
    pendingInvitesLoading,
    refreshPendingInvites,
    handleRevokeInvite,
  };
}
