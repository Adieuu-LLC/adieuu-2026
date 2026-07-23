import { useCallback, useState } from 'react';
import { extractDomain } from '../../utils/urlParsing';
import { isDomainTrusted } from '../useExternalLinkPreferences';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { DecryptedConversation } from './types';

type LeaveOptions = { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' };

/**
 * Dialog/confirmation state and the group- and member-management handlers that
 * drive them (leave, admin transfer, delete, promote, remove, member edit,
 * rename) plus link-confirmation state.
 */
export function useConversationDialogState(params: {
  conversationId: string | undefined;
  conversation: DecryptedConversation | undefined;
  identityId: string | undefined;
  navigate: (to: string) => void;
  memberSettings: MemberSettingsMap;
  leaveGroup: (id: string, options?: LeaveOptions) => Promise<boolean>;
  terminateGroup: (id: string) => Promise<boolean>;
  promoteToAdmin: (id: string, memberId: string) => Promise<boolean>;
  removeMember: (id: string, memberId: string) => Promise<boolean>;
  renameGroup: (id: string, newName: string) => Promise<boolean>;
  updateMemberSettings: (id: string, settings: MemberSettingsMap) => Promise<boolean>;
}) {
  const {
    conversationId,
    conversation,
    identityId,
    navigate,
    memberSettings,
    leaveGroup,
    terminateGroup,
    promoteToAdmin,
    removeMember,
    renameGroup,
    updateMemberSettings,
  } = params;

  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [adminTransferOpen, setAdminTransferOpen] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [pendingLinkHref, setPendingLinkHref] = useState<string | null>(null);

  const handleLinkClick = useCallback((href: string) => {
    const domain = extractDomain(href);
    if (domain && isDomainTrusted(domain)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      setPendingLinkHref(href);
    }
  }, []);

  const handleRename = useCallback(async () => {
    if (!conversationId || !renameValue.trim() || renaming) return;
    setRenaming(true);
    await renameGroup(conversationId, renameValue.trim());
    setRenameValue('');
    setRenaming(false);
  }, [conversationId, renameValue, renaming, renameGroup]);

  const handleLeaveClick = useCallback(() => {
    if (!conversation) return;
    const isAdmin = identityId && conversation.admins.includes(identityId);
    const otherAdmins = conversation.admins.filter((a) => a !== identityId);
    const isSoleMember = conversation.participants.length <= 1;

    if (isAdmin && otherAdmins.length === 0 && !isSoleMember) {
      setAdminTransferOpen(true);
    } else {
      setLeaveConfirmOpen(true);
    }
  }, [conversation, identityId]);

  const handleLeaveConfirm = useCallback(async () => {
    if (!conversationId) return;
    setLeaving(true);
    const left = await leaveGroup(conversationId);
    setLeaving(false);
    setLeaveConfirmOpen(false);
    if (left) navigate('/');
  }, [conversationId, leaveGroup, navigate]);

  const handleAdminTransferLeave = useCallback(
    async (options: LeaveOptions) => {
      if (!conversationId) return;
      setLeaving(true);
      const left = await leaveGroup(conversationId, options);
      setLeaving(false);
      setAdminTransferOpen(false);
      if (left) navigate('/');
    },
    [conversationId, leaveGroup, navigate],
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!conversationId) return;
    setDeletingGroup(true);
    const deleted = await terminateGroup(conversationId);
    setDeletingGroup(false);
    setDeleteGroupOpen(false);
    if (deleted) navigate('/');
  }, [conversationId, terminateGroup, navigate]);

  const handlePromoteToAdmin = useCallback(
    async (memberId: string) => {
      if (!conversationId) return;
      await promoteToAdmin(conversationId, memberId);
    },
    [conversationId, promoteToAdmin],
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      if (!conversationId) return;
      await removeMember(conversationId, memberId);
    },
    [conversationId, removeMember],
  );

  const closeMemberEdit = useCallback(() => {
    setEditingMemberId(null);
  }, []);

  const saveMemberEdit = useCallback(
    async (memberId: string, nickname: string, color: string | undefined) => {
      if (!conversationId) return;
      const updated: MemberSettingsMap = { ...memberSettings };
      const trimmed = nickname.trim();
      if (trimmed || color) {
        updated[memberId] = {
          ...(trimmed ? { nickname: trimmed } : {}),
          ...(color ? { color } : {}),
        };
      } else {
        delete updated[memberId];
      }
      await updateMemberSettings(conversationId, updated);
      closeMemberEdit();
    },
    [conversationId, memberSettings, updateMemberSettings, closeMemberEdit],
  );

  return {
    leaveConfirmOpen,
    setLeaveConfirmOpen,
    adminTransferOpen,
    setAdminTransferOpen,
    deleteGroupOpen,
    setDeleteGroupOpen,
    inviteMemberOpen,
    setInviteMemberOpen,
    leaving,
    deletingGroup,
    renameValue,
    setRenameValue,
    renaming,
    editingMemberId,
    setEditingMemberId,
    pendingLinkHref,
    setPendingLinkHref,
    handleLinkClick,
    handleRename,
    handleLeaveClick,
    handleLeaveConfirm,
    handleAdminTransferLeave,
    handleDeleteGroup,
    handlePromoteToAdmin,
    handleRemoveMember,
    closeMemberEdit,
    saveMemberEdit,
  };
}
