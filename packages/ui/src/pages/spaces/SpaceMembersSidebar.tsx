import type {
  PublicIdentity,
  PublicSpaceMember,
  PublicSpaceRole,
  SpaceBanDuration,
  SpacePermission,
} from '@adieuu/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { HoverCard } from '../../components/HoverCard';
import { IdentityHoverCardContent } from '../../components/IdentityHoverCard';
import { MemberColorDisplayControl } from '../../components/MemberColorDisplayControl';
import { Spinner } from '../../components/Spinner';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { onSpaceMemberUpdated } from '../../services/spacesMembershipEvents';
import { resolveDisplayName } from '../conversations/conversationUtils';
import { MemberEditPanel } from '../conversations/MemberEditPanel';
import { actorTopRolePosition } from './channelRoleHierarchy';
import {
  getMemberRoleBadges,
  groupSpaceMembersByRole,
  resolveSpaceMemberColor,
  spaceMembersToSettingsMap,
} from './groupSpaceMembersByRole';
import { SpaceMemberModerationMenu } from './SpaceMemberModerationMenu';

interface SpaceMembersSidebarProps {
  spaceId: string;
  roles: PublicSpaceRole[];
  selfId: string | undefined;
  actorRoleIds: readonly string[];
  actorPermissions: readonly SpacePermission[];
  ownerIdentityId: string | undefined;
  canChangeNickname: boolean;
  canManageNicknames: boolean;
  canKick: boolean;
  canBan: boolean;
  canManageMemberRoles: boolean;
  canManageRoles: boolean;
  actorIsAdmin: boolean;
  listMembers: (
    spaceId: string,
    options?: { limit?: number; cursor?: string },
  ) => Promise<{ success: boolean; data?: { members: PublicSpaceMember[]; cursor: string | null } }>;
  updateMemberProfile: (
    spaceId: string,
    identityId: string,
    body: { nickname?: string | null; color?: string | null },
  ) => Promise<{
    success: boolean;
    data?: { member: PublicSpaceMember };
    error?: string | { message?: string };
  }>;
  removeMember: (
    spaceId: string,
    identityId: string,
  ) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  banMember: (
    spaceId: string,
    identityId: string,
    body: { reason: string; duration: SpaceBanDuration },
  ) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  setMemberRoles: (
    spaceId: string,
    identityId: string,
    roleIds: string[],
  ) => Promise<{
    success: boolean;
    data?: { member: PublicSpaceMember };
    error?: string | { message?: string };
  }>;
  resolveProfile: (identityId: string) => PublicIdentity | undefined;
  resolveRoleName: (role: PublicSpaceRole) => string;
  onMembersChange: (members: readonly PublicSpaceMember[]) => void;
  onClose: () => void;
}

const PAGE_SIZE = 30;

export function SpaceMembersSidebar({
  spaceId,
  roles,
  selfId,
  actorRoleIds,
  actorPermissions,
  ownerIdentityId,
  canChangeNickname,
  canManageNicknames,
  canKick,
  canBan,
  canManageMemberRoles,
  canManageRoles,
  actorIsAdmin,
  listMembers,
  updateMemberProfile,
  removeMember,
  banMember,
  setMemberRoles,
  resolveProfile,
  resolveRoleName,
  onMembersChange,
  onClose,
}: SpaceMembersSidebarProps) {
  const { t } = useTranslation();
  const [members, setMembers] = useState<PublicSpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  /** Profile popover opened by left-click (not hover). */
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const generationRef = useRef(0);

  const profiles = useMemo(() => {
    const map: Record<string, PublicIdentity> = {};
    for (const m of members) {
      const p = resolveProfile(m.identityId);
      if (p) map[m.identityId] = p;
    }
    return map;
  }, [members, resolveProfile]);

  const memberSettings = useMemo(
    () => spaceMembersToSettingsMap(members, roles),
    [members, roles],
  );

  useEffect(() => {
    onMembersChange(members);
  }, [members, onMembersChange]);

  useEffect(() => {
    generationRef.current++;
    setMembers([]);
    setCursor(null);
    setLoading(true);
    setEditingMemberId(null);
    setSaveError(null);
    loadingRef.current = false;
  }, [spaceId]);

  const loadPage = useCallback(
    async (c?: string | null) => {
      if (loadingRef.current) return;
      const gen = c ? generationRef.current : ++generationRef.current;
      loadingRef.current = true;
      setLoading(true);
      try {
        const res = await listMembers(spaceId, { limit: PAGE_SIZE, cursor: c ?? undefined });
        if (gen !== generationRef.current) return;
        if (res.success && res.data) {
          const page = res.data.members;
          setMembers((prev) => (c ? [...prev, ...page] : page));
          setCursor(res.data.cursor);
        }
      } catch {
        // consumed -- void call sites cannot handle rejections
      } finally {
        if (gen === generationRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    },
    [listMembers, spaceId],
  );

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    return onSpaceMemberUpdated((sid, member) => {
      if (sid !== spaceId) return;
      setMembers((prev) => {
        const idx = prev.findIndex((m) => m.identityId === member.identityId);
        if (idx < 0) return prev;
        const next = prev.slice();
        next[idx] = member;
        return next;
      });
    });
  }, [spaceId]);

  const groups = useMemo(
    () =>
      groupSpaceMembersByRole(
        members,
        roles,
        profiles,
        t('conversations.inviteMember.statusMember', 'Members'),
      ),
    [members, roles, profiles, t],
  );

  const actorTop = useMemo(
    () => actorTopRolePosition(actorRoleIds, roles),
    [actorRoleIds, roles],
  );

  const canEditMember = useCallback(
    (member: PublicSpaceMember): boolean => {
      const isSelf = member.identityId === selfId;
      if (isSelf) return canChangeNickname;
      if (!canManageNicknames) return false;
      if (actorTop === null) return true;
      const targetTop = actorTopRolePosition(member.roleIds, roles);
      if (targetTop === null) return true;
      return targetTop >= actorTop;
    },
    [selfId, canChangeNickname, canManageNicknames, actorTop, roles],
  );

  const handleSaveMemberEdit = useCallback(
    async (memberId: string, nickname: string, color: string | undefined) => {
      setSaveError(null);
      const res = await updateMemberProfile(spaceId, memberId, {
        nickname: nickname.trim() ? nickname.trim() : null,
        color: color ?? null,
      });
      const updated = res.data?.member;
      if (!res.success || !updated) {
        const errMsg =
          typeof res.error === 'string'
            ? res.error
            : res.error?.message;
        setSaveError(errMsg ?? t('spaces.members.profileSaveFailed', 'Could not save member settings.'));
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.identityId === memberId ? updated : m)),
      );
      setEditingMemberId(null);
    },
    [spaceId, updateMemberProfile, t],
  );

  const handleMemberUpdated = useCallback((updated: PublicSpaceMember) => {
    setMembers((prev) =>
      prev.map((m) => (m.identityId === updated.identityId ? updated : m)),
    );
  }, []);

  const handleMemberRemoved = useCallback((identityId: string) => {
    setMembers((prev) => prev.filter((m) => m.identityId !== identityId));
  }, []);

  return (
    <div className="conversation-members-sidebar">
      <div className="conversation-members-header">
        <h3>{t('conversations.members', 'Members')}</h3>
        <span className="conversation-members-count">{members.length}</span>
        <Button
          variant="ghost"
          size="sm"
          className="conversation-members-close-btn"
          onClick={onClose}
          aria-label={t('common.close', 'Close')}
        >
          <Icon name="x" size="sm" />
        </Button>
      </div>

      <MemberColorDisplayControl />

      <div className="conversation-members-list">
        {groups.map((group) => (
          <div key={group.roleId ?? '__members'} className="conversation-members-group">
            <div className="conversation-members-subheader">
              <h4
                className="conversation-members-subheader-title"
                style={group.color ? { color: group.color } : undefined}
              >
                {group.title}
                <span className="conversation-members-count">{group.members.length}</span>
              </h4>
            </div>
            {group.members.map((member) => {
              const profile = profiles[member.identityId];
              const isSelf = member.identityId === selfId;
              const customisation = memberSettings[member.identityId];
              const displayColor = resolveSpaceMemberColor(member, roles);
              const roleBadges = getMemberRoleBadges(member, roles, resolveRoleName);
              const displayedName = resolveDisplayName(
                member.identityId,
                profiles,
                memberSettings,
                selfId,
                t,
              );
              const realName = isSelf
                ? t('conversations.you', 'You')
                : (profile?.displayName ?? profile?.username ?? member.identityId);
              const initial = displayedName.charAt(0).toUpperCase();
              const isEditing = editingMemberId === member.identityId;
              const showEdit = canEditMember(member);

              const profileOpen = profileMemberId === member.identityId;

              const rowInner = (
                <>
                  <button
                    type="button"
                    className="conversation-member-item-link"
                    onClick={() => {
                      setProfileMemberId((cur) =>
                        cur === member.identityId ? null : member.identityId,
                      );
                    }}
                  >
                    <div className="conversation-member-avatar">
                      {profile?.avatarUrl ? (
                        <img
                          src={profile.avatarUrl}
                          alt=""
                          className="conversation-member-avatar-img"
                        />
                      ) : (
                        <span className="conversation-member-avatar-placeholder">{initial}</span>
                      )}
                    </div>
                    <div className="conversation-member-info">
                      <span
                        className="conversation-member-name"
                        style={displayColor ? { color: displayColor } : undefined}
                      >
                        {displayedName}
                        {isSelf && (
                          <span className="conversation-member-you">
                            {t('conversations.memberYou', '(you)')}
                          </span>
                        )}
                        {roleBadges.visible.map((badge) => (
                          <span
                            key={badge.id}
                            className="conversation-member-role-badge"
                            style={
                              badge.color
                                ? {
                                    color: badge.color,
                                    background: `color-mix(in srgb, ${badge.color} 14%, transparent)`,
                                  }
                                : undefined
                            }
                          >
                            {badge.name}
                          </span>
                        ))}
                        {roleBadges.overflow.length > 0 && (
                          <Tooltip
                            content={roleBadges.overflow.map((b) => b.name).join(', ')}
                            position="top"
                          >
                            <span className="conversation-member-role-badge conversation-member-role-badge--more">
                              +{roleBadges.overflow.length}
                            </span>
                          </Tooltip>
                        )}
                      </span>
                      {customisation?.nickname && !isSelf && (
                        <span className="conversation-member-username">{realName}</span>
                      )}
                      {!customisation?.nickname && profile?.username && !isSelf && (
                        <span className="conversation-member-username">@{profile.username}</span>
                      )}
                    </div>
                  </button>
                  {showEdit && (
                    <div className="conversation-member-actions">
                      <Tooltip content={t('conversations.editMember', 'Edit member')} position="top">
                        <button
                          type="button"
                          className="conversation-member-action-btn"
                          onClick={() =>
                            setEditingMemberId(isEditing ? null : member.identityId)
                          }
                        >
                          <Icon name="pen" className="conversation-member-action-icon" />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                </>
              );

              const rowEl = (
                <div className="conversation-member-item">{rowInner}</div>
              );

              // Controlled click-to-open profile card (hover-driven opens are ignored).
              const profileWrapped = profile ? (
                <HoverCard
                  className="identity-hover-card"
                  positioning={{ placement: 'left-start', gutter: 10 }}
                  open={profileOpen}
                  openDelay={10_000}
                  closeDelay={200}
                  onOpenChange={(d) => {
                    // Only honor closes (outside click / leave); opens come from the row button.
                    if (!d.open) {
                      setProfileMemberId((cur) =>
                        cur === member.identityId ? null : cur,
                      );
                    }
                  }}
                  trigger={rowEl}
                >
                  <IdentityHoverCardContent identity={profile} />
                </HoverCard>
              ) : (
                rowEl
              );

              return (
                <div key={member.id} className="conversation-member-item-wrap">
                  <SpaceMemberModerationMenu
                    member={member}
                    roles={roles}
                    spaceMembers={members}
                    actorPermissions={actorPermissions}
                    ownerIdentityId={ownerIdentityId}
                    selfId={selfId}
                    canKick={canKick}
                    canBan={canBan}
                    canManageMemberRoles={canManageMemberRoles}
                    canManageRoles={canManageRoles}
                    actorIsAdmin={actorIsAdmin}
                    resolveRoleName={resolveRoleName}
                    removeMember={(identityId) => removeMember(spaceId, identityId)}
                    banMember={(identityId, body) => banMember(spaceId, identityId, body)}
                    setMemberRoles={(identityId, roleIds) =>
                      setMemberRoles(spaceId, identityId, roleIds)
                    }
                    onMemberUpdated={handleMemberUpdated}
                    onMemberRemoved={handleMemberRemoved}
                    onMenuOpen={() => setProfileMemberId(null)}
                    onEditNicknameColor={
                      showEdit
                        ? () => setEditingMemberId(member.identityId)
                        : undefined
                    }
                  >
                    {profileWrapped}
                  </SpaceMemberModerationMenu>
                  {isEditing && (
                    <MemberEditPanel
                      initialNickname={member.nickname ?? ''}
                      initialColor={member.color}
                      onSave={(nick, col) => void handleSaveMemberEdit(member.identityId, nick, col)}
                      onCancel={() => {
                        setEditingMemberId(null);
                        setSaveError(null);
                      }}
                    />
                  )}
                  {isEditing && saveError && (
                    <p className="conversation-member-edit-error" role="alert">
                      {saveError}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {loading && (
          <div className="conversation-members-loading">
            <Spinner size="sm" />
          </div>
        )}

        {!loading && cursor && (
          <Button
            variant="ghost"
            size="sm"
            className="conversation-members-load-more"
            onClick={() => void loadPage(cursor)}
          >
            {t('common.loadMore', 'Load more')}
          </Button>
        )}
      </div>
    </div>
  );
}
