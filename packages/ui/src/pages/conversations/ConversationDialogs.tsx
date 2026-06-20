import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AdminTransferDialog } from '../../components/AdminTransferDialog';
import { ReportModal } from '../../components/ReportModal';
import { ExternalLinkModal } from '../../components/ExternalLinkModal';
import { InviteMemberModal } from './InviteMemberModal';
import type { PublicGroupInvite, PublicIdentity } from '@adieuu/shared';

export function ConversationDialogs({
  conversationId,
  conversationType,
  isAdmin,
  isSoleMember,
  participants,
  otherParticipants,
  participantProfiles,
  selfId,
  leaveConfirmOpen,
  setLeaveConfirmOpen,
  leaving,
  onLeaveConfirm,
  adminTransferOpen,
  setAdminTransferOpen,
  onAdminTransferLeave,
  deleteGroupOpen,
  setDeleteGroupOpen,
  deletingGroup,
  onDeleteGroup,
  inviteMemberOpen,
  setInviteMemberOpen,
  onCreateNewConversation,
  pendingInvites,
  onInviteMemberSuccess,
  reportModalOpen,
  setReportModalOpen,
  reportTargetMessageId,
  pendingLinkHref,
  onCloseLinkModal,
}: {
  conversationId: string;
  conversationType: 'dm' | 'group';
  isAdmin: boolean;
  isSoleMember: boolean;
  participants: string[];
  otherParticipants: string[];
  participantProfiles: Record<string, PublicIdentity>;
  selfId: string | undefined;
  leaveConfirmOpen: boolean;
  setLeaveConfirmOpen: (open: boolean) => void;
  leaving: boolean;
  onLeaveConfirm: () => void;
  adminTransferOpen: boolean;
  setAdminTransferOpen: (open: boolean) => void;
  onAdminTransferLeave: (options: { transferAdminTo?: string; transferStrategy?: 'oldest' | 'most_active' }) => void;
  deleteGroupOpen: boolean;
  setDeleteGroupOpen: (open: boolean) => void;
  deletingGroup: boolean;
  onDeleteGroup: () => void;
  inviteMemberOpen: boolean;
  setInviteMemberOpen: (open: boolean) => void;
  onCreateNewConversation: () => void;
  pendingInvites: PublicGroupInvite[];
  onInviteMemberSuccess?: () => void;
  reportModalOpen: boolean;
  setReportModalOpen: (open: boolean) => void;
  reportTargetMessageId: string | undefined;
  pendingLinkHref: string | null;
  onCloseLinkModal: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <ConfirmDialog
        open={leaveConfirmOpen}
        onOpenChange={setLeaveConfirmOpen}
        title={t('conversations.leaveGroup.title', 'Leave group?')}
        description={
          isSoleMember
            ? t('conversations.leaveGroup.lastMember', 'You are the last member. The group and all messages will be permanently deleted.')
            : t('conversations.leaveGroup.confirm', "You won't be able to rejoin without a new invite.")
        }
        confirmLabel={t('conversations.leaveGroup.confirmBtn', 'Leave')}
        variant={isSoleMember ? 'danger' : 'warning'}
        loading={leaving}
        onConfirm={onLeaveConfirm}
      />

      {conversationType === 'group' && (
        <AdminTransferDialog
          open={adminTransferOpen}
          onOpenChange={setAdminTransferOpen}
          members={participants
            .filter((p) => p !== selfId)
            .map((p) => ({
              id: p,
              displayName: participantProfiles[p]?.displayName,
              username: participantProfiles[p]?.username,
            }))}
          loading={leaving}
          onConfirm={onAdminTransferLeave}
          onSkip={() => void onAdminTransferLeave({ transferStrategy: 'oldest' })}
        />
      )}

      <ConfirmDialog
        open={deleteGroupOpen}
        onOpenChange={setDeleteGroupOpen}
        title={t('conversations.deleteConversationDialog.title', 'Delete conversation?')}
        description={t(
          'conversations.deleteConversationDialog.confirm',
          'This will permanently delete the conversation and all messages for everyone.'
        )}
        confirmLabel={t('conversations.deleteConversationDialog.confirmBtn', 'Delete')}
        variant="danger"
        loading={deletingGroup}
        onConfirm={onDeleteGroup}
      />

      {conversationType === 'group' && isAdmin && (
        <InviteMemberModal
          open={inviteMemberOpen}
          onOpenChange={setInviteMemberOpen}
          conversationId={conversationId}
          currentParticipants={participants}
          pendingInvites={pendingInvites}
          participantProfiles={participantProfiles}
          onCreateNewConversation={onCreateNewConversation}
          onInviteSuccess={onInviteMemberSuccess}
        />
      )}

      <ReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        mode="message"
        targetMessageId={reportTargetMessageId}
        conversationId={conversationId}
      />

      {pendingLinkHref && (
        <ExternalLinkModal
          href={pendingLinkHref}
          onClose={onCloseLinkModal}
          identityId={selfId}
        />
      )}
    </>
  );
}
