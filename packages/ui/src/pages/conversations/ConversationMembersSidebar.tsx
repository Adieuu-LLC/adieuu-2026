import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PublicGroupInvite, PublicIdentity } from '@adieuu/shared';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { resolveDisplayName } from './conversationUtils';
import { MemberEditPanel } from './MemberEditPanel';

export function ConversationMembersSidebar({
  participants,
  participantProfiles,
  memberSettings,
  admins,
  conversationType,
  isCurrentUserAdmin,
  canEditMemberSettings,
  selfId,
  editingMemberId,
  onEditMember,
  onCloseMemberEdit,
  onSaveMemberEdit,
  onPromoteToAdmin,
  onRemoveMember,
  onInviteMember,
  onAddMember,
  pendingInvites,
  pendingInvitesLoading,
  onRevokeInvite,
}: {
  participants: string[];
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  admins: string[];
  conversationType: 'dm' | 'group';
  isCurrentUserAdmin: boolean;
  canEditMemberSettings: boolean;
  selfId: string | undefined;
  editingMemberId: string | null;
  onEditMember: (id: string | null) => void;
  onCloseMemberEdit: () => void;
  onSaveMemberEdit: (memberId: string, nickname: string, color: string | undefined) => void;
  onPromoteToAdmin: (memberId: string) => void;
  onRemoveMember: (memberId: string) => void;
  onInviteMember: () => void;
  onAddMember: () => void;
  pendingInvites?: PublicGroupInvite[];
  pendingInvitesLoading?: boolean;
  onRevokeInvite?: (inviteId: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();

  return (
    <div className="conversation-members-sidebar">
      <div className="conversation-members-header">
        <h3>{t('conversations.members', 'Members')}</h3>
        <span className="conversation-members-count">
          {participants.length}
        </span>
      </div>
      {conversationType === 'dm' && (
        <div className="conversation-members-invite-row">
          <Button
            variant="ghost"
            size="sm"
            className="conversation-members-invite-btn"
            onClick={onAddMember}
          >
            <Icon name="plus" />
            {t('conversations.addMember', 'Add Member')}
          </Button>
        </div>
      )}
      {isCurrentUserAdmin && conversationType === 'group' && (
        <div className="conversation-members-invite-row">
          <Button
            variant="ghost"
            size="sm"
            className="conversation-members-invite-btn"
            onClick={onInviteMember}
          >
            <Icon name="plus" />
            {t('conversations.inviteMember.button', 'Invite Member')}
          </Button>
        </div>
      )}
      <div className="conversation-members-list">
        {participants.map((participantId) => {
          const profile = participantProfiles[participantId];
          const isSelf = participantId === selfId;
          const customisation = memberSettings[participantId];
          const displayedName = resolveDisplayName(participantId, participantProfiles, memberSettings, selfId, t);
          const realName = isSelf
            ? t('conversations.you', 'You')
            : (profile?.displayName ?? profile?.username ?? participantId);
          const initial = displayedName.charAt(0).toUpperCase();
          const isMemberAdmin = admins?.includes(participantId);
          const isEditing = editingMemberId === participantId;

          return (
            <div key={participantId} className="conversation-member-item">
              <Link to={`/identity/${participantId}`} className="conversation-member-item-link">
                <div className="conversation-member-avatar">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" className="conversation-member-avatar-img" />
                  ) : (
                    <span className="conversation-member-avatar-placeholder">{initial}</span>
                  )}
                </div>
                <div className="conversation-member-info">
                  <span className="conversation-member-name" style={customisation?.color ? { color: customisation.color } : undefined}>
                    {displayedName}
                    {isMemberAdmin && (
                      <span className="conversation-member-admin-badge">
                        {t('conversations.admin', 'Admin')}
                      </span>
                    )}
                    {conversationType === 'group' && (
                      <span className="conversation-member-role-badge">
                        {t('conversations.inviteMember.statusMember', 'Member')}
                      </span>
                    )}
                  </span>
                  {customisation?.nickname && !isSelf && (
                    <span className="conversation-member-username">{realName}</span>
                  )}
                  {!customisation?.nickname && profile?.username && !isSelf && (
                    <span className="conversation-member-username">@{profile.username}</span>
                  )}
                </div>
              </Link>
              <div className="conversation-member-actions">
                {canEditMemberSettings && (
                  <Tooltip content={t('conversations.editMember', 'Edit member')} position="top">
                    <button
                      type="button"
                      className="conversation-member-action-btn"
                      onClick={() => onEditMember(isEditing ? null : participantId)}
                    >
                      <Icon name="pen" className="conversation-member-action-icon" />
                    </button>
                  </Tooltip>
                )}
                {isCurrentUserAdmin && !isSelf && conversationType === 'group' && (
                  <>
                    {!isMemberAdmin && (
                      <Tooltip content={t('conversations.makeAdmin', 'Make Admin')} position="top">
                        <button
                          type="button"
                          className="conversation-member-action-btn"
                          onClick={() => void onPromoteToAdmin(participantId)}
                        >
                          <Icon name="shield" className="conversation-member-action-icon" />
                        </button>
                      </Tooltip>
                    )}
                    {!isMemberAdmin && (
                      <Tooltip content={t('conversations.removeMember', 'Remove')} position="top">
                        <button
                          type="button"
                          className="conversation-member-action-btn conversation-member-action-btn--danger"
                          onClick={() => void onRemoveMember(participantId)}
                        >
                          <Icon name="x" className="conversation-member-action-icon" />
                        </button>
                      </Tooltip>
                    )}
                  </>
                )}
              </div>
              {isEditing && (
                <MemberEditPanel
                  initialNickname={customisation?.nickname ?? ''}
                  initialColor={customisation?.color}
                  onSave={(nick, col) => void onSaveMemberEdit(participantId, nick, col)}
                  onCancel={onCloseMemberEdit}
                />
              )}
            </div>
          );
        })}
      </div>

      {conversationType === 'group' && (pendingInvitesLoading || (pendingInvites?.length ?? 0) > 0) && (
        <div className="conversation-members-invited">
          <div className="conversation-members-subheader">
            <h4 className="conversation-members-subheader-title">
              {t('conversations.invitedSection', 'Invited')}
            </h4>
            {pendingInvitesLoading && (
              <span className="conversation-members-invited-loading" aria-hidden>
                …
              </span>
            )}
          </div>
          <div className="conversation-members-list">
            {(pendingInvites ?? []).map((inv) => {
              const pid = inv.invitedIdentityId;
              const profile = participantProfiles[pid];
              const displayedName = profile?.displayName ?? profile?.username ?? pid.slice(0, 8);
              const initial = displayedName.charAt(0).toUpperCase();

              return (
                <div key={inv.id} className="conversation-member-item conversation-member-item--invited">
                  <Link to={`/identity/${pid}`} className="conversation-member-item-link">
                    <div className="conversation-member-avatar">
                      {profile?.avatarUrl ? (
                        <img src={profile.avatarUrl} alt="" className="conversation-member-avatar-img" />
                      ) : (
                        <span className="conversation-member-avatar-placeholder">{initial}</span>
                      )}
                    </div>
                    <div className="conversation-member-info">
                      <span className="conversation-member-name">
                        {displayedName}
                        <span className="conversation-member-role-badge conversation-member-role-badge--invited">
                          {t('conversations.inviteMember.statusInvited', 'Invited')}
                        </span>
                      </span>
                      {profile?.username && (
                        <span className="conversation-member-username">@{profile.username}</span>
                      )}
                    </div>
                  </Link>
                  {isCurrentUserAdmin && onRevokeInvite && (
                    <div className="conversation-member-actions">
                      <Tooltip content={t('conversations.revokeInvite', 'Revoke invite')} position="top">
                        <button
                          type="button"
                          className="conversation-member-action-btn conversation-member-action-btn--danger"
                          onClick={() => void onRevokeInvite(inv.id)}
                        >
                          <Icon name="x" className="conversation-member-action-icon" />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
