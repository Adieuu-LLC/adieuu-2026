/**
 * Role Manage Members tab: list holders with avatar + profile card,
 * other roles, and remove-from-role.
 */

import {
  createApiClient,
  isSpaceEveryoneRole,
  type PublicIdentity,
  type PublicSpaceMember,
  type PublicSpaceRole,
} from '@adieuu/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { Spinner } from '../../components/Spinner';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import { resolveDisplayName } from '../conversations/conversationUtils';
import { resolveRoleDisplayName } from './spaceMetadataCipher';
import { useSpaceCipher } from './useSpaceCipher';

interface SpaceRoleMembersTabProps {
  role: PublicSpaceRole;
  allRoles: PublicSpaceRole[];
}

export function SpaceRoleMembersTab({ role, allRoles }: SpaceRoleMembersTabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const {
    activeSpace,
    resolveProfiles,
    participantProfiles,
    hasActiveSpacePermission,
    isActiveSpaceAdmin,
  } = useSpaces();
  const { identity } = useIdentity();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);
  const canAssignRoles =
    hasActiveSpacePermission('manageMemberRoles') || hasActiveSpacePermission('manageRoles');
  /** Non-admins cannot newly attach the system Admin role. */
  const canAddToThisRole = canAssignRoles && (role.systemKey !== 'admin' || isActiveSpaceAdmin);

  const [members, setMembers] = useState<PublicSpaceMember[]>([]);
  const [allMembers, setAllMembers] = useState<PublicSpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addIdentityId, setAddIdentityId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const roleById = useMemo(
    () => new Map(allRoles.map((r) => [r.id, r])),
    [allRoles],
  );

  const load = useCallback(async () => {
    if (!activeSpace) return;
    setLoading(true);
    const [roleRes, allRes] = await Promise.all([
      api.spaces.listRoleMembers(activeSpace.id, role.id),
      api.spaces.listMembers(activeSpace.id, { limit: 100 }),
    ]);
    if (roleRes.success && roleRes.data) {
      setMembers(roleRes.data.members);
      resolveProfiles(roleRes.data.members.map((m) => m.identityId));
    }
    if (allRes.success && allRes.data) {
      setAllMembers(allRes.data.members);
      resolveProfiles(allRes.data.members.map((m) => m.identityId));
    }
    setLoading(false);
  }, [activeSpace, api, resolveProfiles, role.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileName = (identityId: string) =>
    resolveDisplayName(identityId, participantProfiles, {});

  const roleLabel = (r: PublicSpaceRole) =>
    resolveRoleDisplayName(r, spaceCipher, {
      encryptedRole: t('spaces.encryptedRolePlaceholder'),
    });

  const candidates = allMembers.filter(
    (m) => !members.some((h) => h.identityId === m.identityId),
  );

  /** Default Member role cannot be removed via the API (always re-applied). */
  const canRemoveFromRole = !role.isDefaultMember;
  /** Sole Admin cannot be removed until policy/voting can succeed them. */
  const isLastAdminRole = role.systemKey === 'admin' && members.length <= 1;

  const setRolesFor = async (identityId: string, roleIds: string[]) => {
    if (!activeSpace || !canAssignRoles) return;
    setBusyId(identityId);
    const res = await api.spaces.setMemberRoles(activeSpace.id, identityId, roleIds);
    setBusyId(null);
    if (res.success) {
      void load();
    } else {
      toast.error(
        res.error?.code === 'LAST_ADMIN'
          ? t('spaces.manage.roles.members.lastAdminError')
          : t('spaces.manage.roles.members.membersUpdateError'),
      );
    }
  };

  const handleRemove = (member: PublicSpaceMember) => {
    const next = member.roleIds.filter((id) => id !== role.id);
    void setRolesFor(member.identityId, next);
  };

  const handleAdd = () => {
    if (!addIdentityId) return;
    const target = allMembers.find((m) => m.identityId === addIdentityId);
    if (!target) return;
    const next = target.roleIds.includes(role.id)
      ? target.roleIds
      : [...target.roleIds, role.id];
    void setRolesFor(addIdentityId, next).then(() => setAddIdentityId(''));
  };

  const renderMemberRow = (member: PublicSpaceMember) => {
    const profile: PublicIdentity | undefined = participantProfiles[member.identityId];
    const displayName = profileName(member.identityId);
    const isSelf = member.identityId === identity?.id;
    const otherRoles = member.roleIds
      .map((id) => roleById.get(id))
      .filter((r): r is PublicSpaceRole => !!r && !isSpaceEveryoneRole(r));

    const identityBlock = (
      <div className="space-role-member-identity">
        <div className="conversation-member-avatar">
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              className="conversation-member-avatar-img"
            />
          ) : (
            <span className="conversation-member-avatar-placeholder">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="space-role-member-info">
          <span className="conversation-member-name">
            {displayName}
            {isSelf && (
              <span className="conversation-member-you">
                {t('conversations.memberYou', '(you)')}
              </span>
            )}
          </span>
          <div
            className="space-role-member-roles"
            role="group"
            aria-label={t('spaces.manage.roles.members.rolesLabel')}
          >
            {otherRoles.map((r) => (
              <span
                key={r.id}
                className={`space-role-member-role-chip${r.id === role.id ? ' space-role-member-role-chip--current' : ''}`}
                style={{ ['--role-color' as string]: r.color }}
              >
                {roleLabel(r)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );

    return (
      <li key={member.id} className="space-role-member-item">
        <div className="space-role-member-row">
          {profile ? (
            <IdentityHoverCard identity={profile}>{identityBlock}</IdentityHoverCard>
          ) : (
            identityBlock
          )}
          {canAssignRoles && canRemoveFromRole && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busyId === member.identityId || isLastAdminRole}
              title={
                isLastAdminRole
                  ? t('spaces.manage.roles.members.lastAdminError')
                  : undefined
              }
              onClick={() => handleRemove(member)}
            >
              {t('spaces.manage.roles.members.remove')}
            </Button>
          )}
        </div>
      </li>
    );
  };

  if (loading) {
    return (
      <div className="admin-loading" role="status" aria-label={t('common.loading')}>
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Card className="admin-card space-role-tab-card">
      {canAddToThisRole ? (
        <div className="space-role-members-add">
          <label className="admin-field-label">
            {t('spaces.manage.roles.members.addLabel')}
            <select
              className="admin-select"
              value={addIdentityId}
              onChange={(e) => setAddIdentityId(e.target.value)}
            >
              <option value="">{t('spaces.manage.roles.members.addPlaceholder')}</option>
              {candidates.map((m) => (
                <option key={m.identityId} value={m.identityId}>
                  {profileName(m.identityId)}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            size="sm"
            disabled={!addIdentityId || busyId === addIdentityId}
            onClick={handleAdd}
          >
            {t('spaces.manage.roles.members.add')}
          </Button>
        </div>
      ) : canAssignRoles && role.systemKey === 'admin' && !isActiveSpaceAdmin ? (
        <p className="admin-hint">{t('spaces.members.adminRoleAssignLocked')}</p>
      ) : !canAssignRoles ? (
        <p className="admin-hint">{t('spaces.members.needsManageMemberRoles')}</p>
      ) : null}

      {role.isDefaultMember && (
        <p className="admin-hint">{t('spaces.manage.roles.members.defaultRoleHint')}</p>
      )}

      {members.length === 0 ? (
        <p className="space-manage-empty">{t('spaces.manage.roles.members.empty')}</p>
      ) : (
        <ul className="space-role-member-list">{members.map(renderMemberRow)}</ul>
      )}
    </Card>
  );
}
