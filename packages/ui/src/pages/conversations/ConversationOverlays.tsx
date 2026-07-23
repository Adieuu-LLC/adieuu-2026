/**
 * Portal-rendered conversation overlays: the member-security modal and the
 * group/member/report/link dialogs. Presentational wrapper around the security,
 * dialog, and message-action state coordinated in {@link ConversationView}.
 */

import type { ReactNode } from 'react';
import type { createApiClient, PublicGroupInvite, PublicIdentity } from '@adieuu/shared';
import type { useConversationSecurityState } from '../../hooks/conversations/useConversationSecurityState';
import type { useConversationDialogState } from '../../hooks/conversations/useConversationDialogState';
import type { useConversationMessageActions } from '../../hooks/conversations/useConversationMessageActions';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import { MemberSecurityModal } from './MemberSecurityModal';
import { ConversationDialogs } from './ConversationDialogs';

type IdentityApi = ReturnType<typeof createApiClient>['identity'];

export interface ConversationOverlaysProps {
  conversation: DecryptedConversation;
  identityId: string | undefined;
  identityApi: IdentityApi;
  participantProfiles: Record<string, PublicIdentity>;
  otherParticipants: string[];
  isCurrentUserAdmin: boolean;
  isSoleMember: boolean;

  security: ReturnType<typeof useConversationSecurityState>;
  dialogs: ReturnType<typeof useConversationDialogState>;
  messageActions: ReturnType<typeof useConversationMessageActions>;

  pendingInvites: PublicGroupInvite[];
  onInviteMemberSuccess: () => void;
  onCreateNewConversation: () => void;
}

export function ConversationOverlays(props: ConversationOverlaysProps): ReactNode {
  const {
    conversation,
    identityId,
    identityApi,
    participantProfiles,
    otherParticipants,
    isCurrentUserAdmin,
    isSoleMember,
    security,
    dialogs,
    messageActions,
    pendingInvites,
    onInviteMemberSuccess,
    onCreateNewConversation,
  } = props;

  return (
    <>
      <MemberSecurityModal
        open={security.memberSecurityModal != null}
        onOpenChange={(open) => {
          if (!open) security.setMemberSecurityModal(null);
        }}
        identityId={security.memberSecurityModal?.id ?? null}
        subjectLabel={security.memberSecurityModal?.label ?? ''}
        isSelfSubject={
          security.memberSecurityModal != null && security.memberSecurityModal.id === identityId
        }
        identityApi={identityApi}
        onVerificationChange={security.bumpVerificationRevision}
      />

      <ConversationDialogs
        conversationId={conversation.id}
        conversationType={conversation.type}
        isAdmin={isCurrentUserAdmin}
        isSoleMember={isSoleMember}
        participants={conversation.participants}
        otherParticipants={otherParticipants}
        participantProfiles={participantProfiles}
        selfId={identityId}
        leaveConfirmOpen={dialogs.leaveConfirmOpen}
        setLeaveConfirmOpen={dialogs.setLeaveConfirmOpen}
        leaving={dialogs.leaving}
        onLeaveConfirm={dialogs.handleLeaveConfirm}
        adminTransferOpen={dialogs.adminTransferOpen}
        setAdminTransferOpen={dialogs.setAdminTransferOpen}
        onAdminTransferLeave={dialogs.handleAdminTransferLeave}
        deleteGroupOpen={dialogs.deleteGroupOpen}
        setDeleteGroupOpen={dialogs.setDeleteGroupOpen}
        deletingGroup={dialogs.deletingGroup}
        onDeleteGroup={dialogs.handleDeleteGroup}
        inviteMemberOpen={dialogs.inviteMemberOpen}
        setInviteMemberOpen={dialogs.setInviteMemberOpen}
        onCreateNewConversation={onCreateNewConversation}
        pendingInvites={conversation.type === 'group' ? pendingInvites : []}
        onInviteMemberSuccess={onInviteMemberSuccess}
        reportModalOpen={messageActions.reportModalOpen}
        setReportModalOpen={messageActions.setReportModalOpen}
        reportTargetMessageId={messageActions.reportTargetMessageId}
        pendingLinkHref={dialogs.pendingLinkHref}
        onCloseLinkModal={() => dialogs.setPendingLinkHref(null)}
      />
    </>
  );
}
