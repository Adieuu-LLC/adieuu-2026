import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PublicGroupInvite } from '@adieuu/shared';
import { HoverCard } from '../../components/HoverCard';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { ConversationSidebarHoverMeta } from './ConversationSidebarHoverMeta';

function memberSortKey(
  pid: string,
  profiles: Record<string, { displayName?: string; username?: string }>,
): string {
  const p = profiles[pid];
  return (p?.displayName ?? p?.username ?? pid).toLowerCase();
}

/**
 * Group row in the conversations sidebar: hover layout aligned with group invite preview (members, invited).
 */
export function GroupConversationSidebarHoverCard({
  conversation,
  displayName,
  children,
}: {
  conversation: DecryptedConversation;
  displayName: string;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { participantProfiles, prefetchParticipantProfiles, listPendingGroupInvites, fetchConversationById } =
    useConversations();
  const [pendingInvites, setPendingInvites] = useState<PublicGroupInvite[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const invitesFetchedRef = useRef(false);

  const sortedParticipantIds = useMemo(() => {
    return [...conversation.participants].sort((a, b) =>
      memberSortKey(a, participantProfiles).localeCompare(
        memberSortKey(b, participantProfiles),
        undefined,
        { sensitivity: 'base' },
      ),
    );
  }, [conversation.participants, participantProfiles]);

  const handleOpen = useCallback(async () => {
    void prefetchParticipantProfiles(conversation.participants);
    void fetchConversationById(conversation.id);
    if (invitesFetchedRef.current) return;
    invitesFetchedRef.current = true;
    setInvitesLoading(true);
    try {
      const list = await listPendingGroupInvites(conversation.id);
      setPendingInvites(list);
      const invitedIds = list.map((inv) => inv.invitedIdentityId);
      if (invitedIds.length > 0) void prefetchParticipantProfiles(invitedIds);
    } catch {
      invitesFetchedRef.current = false;
    } finally {
      setInvitesLoading(false);
    }
  }, [
    conversation.id,
    conversation.participants,
    listPendingGroupInvites,
    prefetchParticipantProfiles,
    fetchConversationById,
  ]);

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right-start', gutter: 12 }}
      className="invite-group-hover-card"
      openDelay={300}
      closeDelay={200}
      onOpenChange={(details: { open: boolean }) => {
        if (details.open) void handleOpen();
      }}
    >
      <div className="invite-group-hover-card-header">
        <span className="invite-group-hover-card-name">{displayName}</span>
        <ConversationSidebarHoverMeta conversation={conversation} />
      </div>

      <div className="invite-group-hover-card-members">
        <span className="invite-group-hover-card-members-label">
          {t('conversations.invites.previewMembers', 'Members')}
        </span>
        <div className="invite-group-hover-card-members-list">
          {sortedParticipantIds.map((pid) => {
            const member = participantProfiles[pid];
            const isAdmin = conversation.admins.includes(pid);
            const label = member?.displayName ?? member?.username ?? pid.slice(0, 8);
            return (
              <Link
                key={pid}
                to={`/identity/${pid}`}
                className="invite-group-hover-card-member invite-group-hover-card-member--link"
              >
                <div className="invite-group-hover-card-member-avatar">
                  {member?.avatarUrl ? (
                    <img
                      src={member.avatarUrl}
                      alt=""
                      className="invite-group-hover-card-member-avatar-img"
                    />
                  ) : (
                    <span className="invite-group-hover-card-member-avatar-placeholder">
                      {label.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="invite-group-hover-card-member-name">
                  {label}
                  {isAdmin && (
                    <span className="conversation-member-admin-badge">
                      {t('conversations.admin', 'Admin')}
                    </span>
                  )}
                </span>
                {member?.username && (
                  <span className="invite-group-hover-card-member-username">@{member.username}</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {(invitesLoading || pendingInvites.length > 0) && (
        <div className="invite-group-hover-card-members">
          <span className="invite-group-hover-card-members-label">
            {t('conversations.invitedSection', 'Invited')}
          </span>
          {invitesLoading && pendingInvites.length === 0 && (
            <div className="invite-group-hover-card-loading">
              <span className="spinner spinner-sm" />
            </div>
          )}
          <div className="invite-group-hover-card-members-list">
            {pendingInvites.map((inv) => {
              const pid = inv.invitedIdentityId;
              const profile = participantProfiles[pid];
              const nameLabel = profile?.displayName ?? profile?.username ?? pid.slice(0, 8);
              return (
                <Link
                  key={inv.id}
                  to={`/identity/${pid}`}
                  className="invite-group-hover-card-member invite-group-hover-card-member--link"
                >
                  <div className="invite-group-hover-card-member-avatar">
                    {profile?.avatarUrl ? (
                      <img
                        src={profile.avatarUrl}
                        alt=""
                        className="invite-group-hover-card-member-avatar-img"
                      />
                    ) : (
                      <span className="invite-group-hover-card-member-avatar-placeholder">
                        {nameLabel.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="invite-group-hover-card-member-name">{nameLabel}</span>
                  {profile?.username && (
                    <span className="invite-group-hover-card-member-username">@{profile.username}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </HoverCard>
  );
}
