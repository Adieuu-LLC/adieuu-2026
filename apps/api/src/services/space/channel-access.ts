/**
 * Space channel visibility helpers (role ACL + manageChannels bypass).
 *
 * @module services/space/channel-access
 */

import type { ObjectId } from 'mongodb';
import { isSpaceAdminRole, isSpaceEveryoneRole, normalizeSpacePermissions } from '@adieuu/shared';
import type { SpaceChannelDocument } from '../../models/space-channel';
import type { SpaceRoleDocument } from '../../models/space-role';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import {
  memberHasPermission,
  resolveMemberPermissions,
  type SpaceMemberPermissions,
} from './permissions';
import type { SpaceErrorCode } from './types';

/**
 * Whether a channel is open to all members / public readers.
 * Legacy docs with missing/empty `allowedRoleIds` count as open.
 * Channels that include the Everyone (default member) role are also open.
 */
export function channelIsEveryoneOpen(
  channel: Pick<SpaceChannelDocument, 'allowedRoleIds'>,
  everyoneRoleId: ObjectId | null,
): boolean {
  const allowed = channel.allowedRoleIds ?? [];
  if (allowed.length === 0) return true;
  if (!everyoneRoleId) return false;
  return allowed.some((id) => id.equals(everyoneRoleId));
}

/**
 * Whether the requester may see a channel.
 * - `manageChannels` → all channels
 * - Everyone-open / legacy empty ACL → any space reader (member or public browse)
 * - Otherwise → member whose roleIds intersect allowedRoleIds
 */
export function canViewSpaceChannel(
  channel: Pick<SpaceChannelDocument, 'allowedRoleIds'>,
  perms: SpaceMemberPermissions,
  everyoneRoleId: ObjectId | null,
): boolean {
  if (perms.isMember && memberHasPermission(perms, 'manageChannels')) {
    return true;
  }
  if (channelIsEveryoneOpen(channel, everyoneRoleId)) {
    return true;
  }
  if (!perms.isMember) return false;
  const allowed = channel.allowedRoleIds ?? [];
  const held = new Set(perms.roleIds.map((id) => id.toHexString()));
  return allowed.some((id) => held.has(id.toHexString()));
}

/** Lowest position among held roles (Admin seeds at 0 = top of hierarchy). */
export function actorTopRolePosition(
  heldRoleIds: readonly ObjectId[],
  roles: readonly SpaceRoleDocument[],
): number | null {
  const byId = new Map(roles.map((r) => [r._id.toHexString(), r]));
  let top: number | null = null;
  for (const id of heldRoleIds) {
    const role = byId.get(id.toHexString());
    if (!role) continue;
    const pos = role.position ?? 0;
    if (top === null || pos < top) top = pos;
  }
  return top;
}

/** Roles at or below the actor's top (position >= top). */
export function rolesAtOrBelowHierarchy(
  roles: readonly SpaceRoleDocument[],
  topPosition: number,
): SpaceRoleDocument[] {
  return roles.filter((r) => (r.position ?? 0) >= topPosition);
}

export function findEveryoneRole(
  roles: readonly SpaceRoleDocument[],
): SpaceRoleDocument | undefined {
  return roles.find((r) => r.isDefaultMember || isSpaceEveryoneRole(r));
}

/**
 * Resolves the audience for a restricted-channel realtime event.
 *
 * Returns `null` when the channel is open to everyone (legacy/empty ACL or
 * includes the Everyone role) — callers should broadcast space-wide. Otherwise
 * returns the hex identity ids of active members who may view the channel:
 * members whose roles intersect `allowedRoleIds`, plus members holding a role
 * that grants `manageChannels` (which bypasses channel ACLs, e.g. Admin).
 */
export async function resolveChannelAudience(
  spaceId: ObjectId,
  channel: Pick<SpaceChannelDocument, 'allowedRoleIds'>,
): Promise<string[] | null> {
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (channelIsEveryoneOpen(channel, everyone?._id ?? null)) {
    return null;
  }

  const audienceRoleIds = new Map<string, ObjectId>();
  for (const id of channel.allowedRoleIds ?? []) {
    audienceRoleIds.set(id.toHexString(), id);
  }
  // manageChannels (and the Admin system role, which holds all permissions)
  // can always view any channel, so their holders must remain in the audience.
  for (const role of roles) {
    const grantsManage =
      isSpaceAdminRole(role) ||
      normalizeSpacePermissions(role.permissions).includes('manageChannels');
    if (grantsManage) audienceRoleIds.set(role._id.toHexString(), role._id);
  }

  const members = await getSpaceMemberRepository().listByAnyRole(
    spaceId,
    [...audienceRoleIds.values()],
  );
  return members.map((m) => m.identityId.toHexString());
}

/** Resolve perms + roles and enforce channel view ACL (hides as not found). */
export async function requireChannelView(
  spaceId: ObjectId,
  channel: Pick<SpaceChannelDocument, 'allowedRoleIds'>,
  requesterId: ObjectId,
): Promise<{ ok: true } | { ok: false; error: string; errorCode: SpaceErrorCode }> {
  const [perms, roles] = await Promise.all([
    resolveMemberPermissions(spaceId, requesterId),
    getSpaceRoleRepository().findBySpace(spaceId),
  ]);
  const everyone = findEveryoneRole(roles);
  if (!canViewSpaceChannel(channel, perms, everyone?._id ?? null)) {
    return { ok: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }
  return { ok: true };
}
