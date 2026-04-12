import { useState, useCallback, useRef, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { HoverCard } from '../../components/HoverCard';
import { useIdentity } from '../../hooks/useIdentity';
import { useConversations } from '../../hooks/useConversations';
import { useSidebarPanelDismiss } from './useSidebarPanelDismiss';
import type { PublicGroupInvite, GroupInvitePreview, GroupInvitePreviewMember } from '@adieuu/shared';

export function ChatInvitationsSidebarButton({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const { invites } = useConversations();

  const isIdentityLoggedIn = identityStatus === 'logged_in';
  const hasInvites = invites.length > 0;
  if (!isIdentityLoggedIn || !hasInvites) return null;

  const buttonLabel = t('nav.chatInvitations', { count: invites.length });

  return (
    <SidebarItem
      icon={<Icon name="message" />}
      label={buttonLabel}
      onClick={onToggle}
      isActive={isOpen || hasInvites}
    />
  );
}

function InviteGroupHoverCard({
  invite,
  children,
}: {
  invite: PublicGroupInvite;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { getInvitePreview } = useConversations();
  const [preview, setPreview] = useState<GroupInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const handleOpen = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    const data = await getInvitePreview(invite.id);
    setPreview(data);
    setLoading(false);
  }, [getInvitePreview, invite.id]);

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right', gutter: 8 }}
      className="invite-group-hover-card"
      openDelay={300}
      closeDelay={200}
      onOpenChange={(details: { open: boolean }) => {
        if (details.open) void handleOpen();
      }}
    >
      {loading && (
        <div className="invite-group-hover-card-loading">
          <span className="spinner spinner-sm" />
        </div>
      )}
      {!loading && preview && (
        <>
          <div className="invite-group-hover-card-header">
            <span className="invite-group-hover-card-name">
              {preview.hasGroupName
                ? t('conversations.invites.groupNameHidden', 'Conversation topic hidden')
                : t('conversations.invites.group', 'Group')}
            </span>
            <span className="invite-group-hover-card-count">
              {t('conversations.invites.previewMemberCount', {
                count: preview.memberCount,
                defaultValue: '{{count}} members',
              })}
            </span>
          </div>
          <div className="invite-group-hover-card-inviter">
            <span className="invite-group-hover-card-inviter-label">
              {t('conversations.invites.invitedByLabel', 'Invited by')}
            </span>
            <span className="invite-group-hover-card-inviter-name">
              {preview.invitedBy.displayName}
              {preview.invitedBy.isAdmin && (
                <span className="conversation-member-admin-badge">
                  {t('conversations.admin', 'Admin')}
                </span>
              )}
            </span>
          </div>
          <div className="invite-group-hover-card-members">
            <span className="invite-group-hover-card-members-label">
              {t('conversations.invites.previewMembers', 'Members')}
            </span>
            <div className="invite-group-hover-card-members-list">
              {preview.members.map((member: GroupInvitePreviewMember) => (
                <div key={member.id} className="invite-group-hover-card-member">
                  <div className="invite-group-hover-card-member-avatar">
                    {member.avatarUrl ? (
                      <img src={member.avatarUrl} alt="" className="invite-group-hover-card-member-avatar-img" />
                    ) : (
                      <span className="invite-group-hover-card-member-avatar-placeholder">
                        {member.displayName.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="invite-group-hover-card-member-name">
                    {member.displayName}
                    {member.isAdmin && (
                      <span className="conversation-member-admin-badge">
                        {t('conversations.admin', 'Admin')}
                      </span>
                    )}
                  </span>
                  <span className="invite-group-hover-card-member-username">
                    @{member.username}
                  </span>
                </div>
              ))}
            </div>
          </div>
          {preview.invitedMembers.length > 0 && (
            <div className="invite-group-hover-card-members">
              <span className="invite-group-hover-card-members-label">
                {t('conversations.invites.alsoInvited', 'Also Invited')}
              </span>
              <div className="invite-group-hover-card-members-list">
                {preview.invitedMembers.slice(0, 5).map((member: GroupInvitePreviewMember) => (
                  <div key={member.id} className="invite-group-hover-card-member">
                    <div className="invite-group-hover-card-member-avatar">
                      {member.avatarUrl ? (
                        <img src={member.avatarUrl} alt="" className="invite-group-hover-card-member-avatar-img" />
                      ) : (
                        <span className="invite-group-hover-card-member-avatar-placeholder">
                          {member.displayName.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="invite-group-hover-card-member-name">
                      {member.displayName}
                    </span>
                    <span className="invite-group-hover-card-member-username">
                      @{member.username}
                    </span>
                  </div>
                ))}
                {preview.invitedMembers.length > 5 && (
                  <div className="invite-group-hover-card-overflow">
                    {t('conversations.invites.othersInvited', {
                      count: preview.invitedMembers.length - 5,
                      defaultValue: `+${preview.invitedMembers.length - 5} others invited`,
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {!loading && !preview && (
        <div className="invite-group-hover-card-error">
          {t('conversations.invites.previewUnavailable', 'Preview unavailable')}
        </div>
      )}
    </HoverCard>
  );
}

export function ChatInvitationsPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { invites, acceptInvite, declineInvite, participantProfiles, setActiveConversation } = useConversations();
  const navigate = useNavigate();
  const { closeMobile } = useSidebar();
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const handleAccept = useCallback(
    async (inviteId: string, conversationId: string, event: ReactMouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      setProcessingInvite(inviteId);
      const accepted = await acceptInvite(inviteId);
      setProcessingInvite(null);
      if (accepted) {
        setActiveConversation(conversationId);
        navigate(`/conversations/${conversationId}`);
        onClose();
        closeMobile();
      }
    },
    [acceptInvite, setActiveConversation, navigate, onClose, closeMobile]
  );

  const handleDecline = useCallback(
    async (inviteId: string, event: ReactMouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      setProcessingInvite(inviteId);
      await declineInvite(inviteId);
      setProcessingInvite(null);
    },
    [declineInvite]
  );

  useSidebarPanelDismiss({
    isOpen,
    onClose,
    panelRef,
  });

  if (!isOpen) return null;

  return (
    <div className="sidebar-invitations-panel" ref={panelRef}>
      <div className="sidebar-invitations-panel-header">
        <span className="sidebar-invitations-panel-title">
          {t('conversations.invites.panelTitle', 'Chat Invitations')}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-invitations-panel-close"
          onClick={onClose}
          aria-label={t('common.close')}
        >
          <Icon name="x" />
        </Button>
      </div>

      <div className="sidebar-invitations-panel-list">
        {invites.map((invite) => {
          const inviterProfile = participantProfiles[invite.invitedByIdentityId];
          const inviterName = inviterProfile?.displayName ?? inviterProfile?.username;
          const isProcessing = processingInvite === invite.id;

          const othersCount = invite.memberCount - 1;
          const displayName = invite.hasGroupName
            ? t('conversations.invites.groupNameHidden', 'Conversation topic hidden')
            : inviterName
              ? (othersCount > 0
                ? t('conversations.invites.inviterAndOthers', {
                    name: inviterName,
                    count: othersCount,
                    defaultValue: `${inviterName} + ${othersCount} others`,
                  })
                : t('conversations.invites.inviterGroup', {
                    name: inviterName,
                    defaultValue: `${inviterName}'s Group`,
                  }))
              : t('conversations.invites.group', 'Group');

          return (
            <InviteGroupHoverCard key={invite.id} invite={invite}>
              <div className="sidebar-invitations-panel-item">
                <div className="sidebar-invitations-panel-item-info">
                  <span className="sidebar-invitations-panel-item-name">
                    {displayName}
                  </span>
                  <span className="sidebar-invitations-panel-item-meta">
                    {inviterName
                      ? t('conversations.invites.invitedBy', { name: inviterName, defaultValue: `From ${inviterName}` })
                      : t('conversations.invites.memberCount', { count: invite.memberCount, defaultValue: `${invite.memberCount} members` })}
                  </span>
                  <span className="sidebar-invitations-panel-item-members">
                    {t('conversations.invites.memberCount', { count: invite.memberCount, defaultValue: `${invite.memberCount} members` })}
                  </span>
                </div>
                <div className="sidebar-invitations-panel-item-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sidebar-invite-action-btn sidebar-invite-action-accept"
                    onClick={(event) => void handleAccept(invite.id, invite.conversationId, event)}
                    disabled={isProcessing}
                    title={t('conversations.invites.accept', 'Accept')}
                  >
                    {isProcessing ? <span className="spinner spinner-sm" /> : <Icon name="check" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="sidebar-invite-action-btn sidebar-invite-action-decline"
                    onClick={(event) => void handleDecline(invite.id, event)}
                    disabled={isProcessing}
                    title={t('conversations.invites.decline', 'Decline')}
                  >
                    <Icon name="x" />
                  </Button>
                </div>
              </div>
            </InviteGroupHoverCard>
          );
        })}

        {invites.length === 0 && (
          <div className="sidebar-invitations-panel-empty">
            {t('conversations.invites.noInvites', 'No pending invitations')}
          </div>
        )}
      </div>
    </div>
  );
}
