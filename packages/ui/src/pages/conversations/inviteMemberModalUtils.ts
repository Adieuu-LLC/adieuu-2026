import type { FriendInfo, PublicGroupInvite, PublicIdentity } from '@adieuu/shared';

export type InviteMemberRowState = 'member' | 'invited' | 'inviteable';

export function mergeFriendInfosById(lists: FriendInfo[][]): FriendInfo[] {
  const map = new Map<string, FriendInfo>();
  for (const list of lists) {
    for (const f of list) {
      if (!map.has(f.identity.id)) map.set(f.identity.id, f);
    }
  }
  return Array.from(map.values());
}

export function minimalPublicIdentity(id: string): PublicIdentity {
  const short = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  const epoch = new Date(0).toISOString();
  return {
    id,
    username: short,
    displayName: short,
    createdAt: epoch,
    lastActiveAt: epoch,
    isDeleted: false,
  };
}

export function friendInfoFromPendingInvite(
  invite: PublicGroupInvite,
  profile: PublicIdentity | undefined
): FriendInfo {
  return {
    identity: profile ?? minimalPublicIdentity(invite.invitedIdentityId),
    friendsSince: invite.createdAt,
  };
}

export function inviteMemberRowState(
  identityId: string,
  participantSet: Set<string>,
  pendingInviteSet: Set<string>
): InviteMemberRowState {
  if (participantSet.has(identityId)) return 'member';
  if (pendingInviteSet.has(identityId)) return 'invited';
  return 'inviteable';
}

const STATE_ORDER: Record<InviteMemberRowState, number> = {
  invited: 0,
  member: 1,
  inviteable: 2,
};

export function compareInviteMemberRows(
  a: { identityId: string; state: InviteMemberRowState; displayName: string },
  b: { identityId: string; state: InviteMemberRowState; displayName: string }
): number {
  const sd = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (sd !== 0) return sd;
  return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
}
