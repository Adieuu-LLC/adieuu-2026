/**
 * Builds a message-author wrapper that opens Kick/Ban/Roles on right-click.
 */

import type {
  PublicSpaceMember,
  PublicSpaceRole,
  SpaceBanDuration,
  SpacePermission,
} from '@adieuu/shared';
import { type ReactElement, useCallback } from 'react';
import { SpaceMemberModerationMenu } from './SpaceMemberModerationMenu';

export function useSpaceSenderModeration(params: {
  spaceId: string;
  selfId: string | undefined;
  ownerIdentityId: string | undefined;
  actorPermissions: readonly SpacePermission[];
  memberRoles: PublicSpaceRole[];
  spaceMembersById: Record<string, PublicSpaceMember>;
  canKick: boolean;
  canBan: boolean;
  canManageMemberRoles: boolean;
  canManageRoles: boolean;
  actorIsAdmin: boolean;
  resolveRoleName: (role: PublicSpaceRole) => string;
  removeMember: (
    identityId: string,
  ) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  banMember: (
    identityId: string,
    body: { reason: string; duration: SpaceBanDuration },
  ) => Promise<{ success: boolean; error?: string | { message?: string } }>;
  setMemberRoles: (
    identityId: string,
    roleIds: string[],
  ) => Promise<{
    success: boolean;
    data?: { member: PublicSpaceMember };
    error?: string | { message?: string };
  }>;
  onMemberUpdated: (member: PublicSpaceMember) => void;
  onMemberRemoved: (identityId: string) => void;
}): (identityId: string, node: ReactElement) => ReactElement {
  const {
    spaceId,
    selfId,
    ownerIdentityId,
    actorPermissions,
    memberRoles,
    spaceMembersById,
    canKick,
    canBan,
    canManageMemberRoles,
    canManageRoles,
    actorIsAdmin,
    resolveRoleName,
    removeMember,
    banMember,
    setMemberRoles,
    onMemberUpdated,
    onMemberRemoved,
  } = params;

  return useCallback(
    (identityId: string, node: ReactElement) => {
      const canAssignRoles = canManageMemberRoles || canManageRoles;
      if (!spaceId || (!canKick && !canBan && !canAssignRoles)) {
        return node;
      }
      const member = spaceMembersById[identityId];
      if (!member) return node;
      // Self: still wrap when role management is available (kick/ban stay gated in the menu).
      if (identityId === selfId && !canAssignRoles) {
        return node;
      }
      return (
        <SpaceMemberModerationMenu
          member={member}
          roles={memberRoles}
          spaceMembers={Object.values(spaceMembersById)}
          actorPermissions={actorPermissions}
          ownerIdentityId={ownerIdentityId}
          selfId={selfId}
          canKick={canKick}
          canBan={canBan}
          canManageMemberRoles={canManageMemberRoles}
          canManageRoles={canManageRoles}
          actorIsAdmin={actorIsAdmin}
          resolveRoleName={resolveRoleName}
          removeMember={removeMember}
          banMember={banMember}
          setMemberRoles={setMemberRoles}
          onMemberUpdated={onMemberUpdated}
          onMemberRemoved={onMemberRemoved}
          className="space-member-moderation-trigger--inline"
        >
          {node}
        </SpaceMemberModerationMenu>
      );
    },
    [
      spaceId,
      selfId,
      ownerIdentityId,
      actorPermissions,
      memberRoles,
      spaceMembersById,
      canKick,
      canBan,
      canManageMemberRoles,
      canManageRoles,
      actorIsAdmin,
      resolveRoleName,
      removeMember,
      banMember,
      setMemberRoles,
      onMemberUpdated,
      onMemberRemoved,
    ],
  );
}
