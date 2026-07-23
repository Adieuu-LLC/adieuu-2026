/**
 * Visibility-scoped broadcasting for `space_channel_layout_updated`.
 *
 * The layout event carries the full channel/category lists, so a naive
 * space-wide broadcast would leak restricted-channel metadata (names, ACLs)
 * to members without the channel role. Instead:
 *
 * - Members with only the baseline (Everyone) view get the event filtered to
 *   everyone-open entries, via a broadcast that excludes privileged members.
 * - Members whose roles unlock restricted entries (or who hold
 *   `manageChannels`) are grouped by their visible-entry signature and each
 *   group receives an audience-scoped event with exactly their view.
 *
 * @module services/space/layout-broadcast
 */

import type { ObjectId } from 'mongodb';
import { isSpaceAdminRole, normalizeSpacePermissions } from '@adieuu/shared';
import { toPublicSpaceChannel, type SpaceChannelDocument } from '../../models/space-channel';
import {
  toPublicSpaceChannelCategory,
  type SpaceChannelCategoryDocument,
} from '../../models/space-channel-category';
import type { SpaceRoleDocument } from '../../models/space-role';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { channelIsEveryoneOpen, findEveryoneRole } from './channel-access';
import { publishSpaceEvent } from './redis-events';

interface AclEntry {
  allowedRoleIds?: ObjectId[];
}

function roleGrantsManageChannels(role: SpaceRoleDocument): boolean {
  return (
    isSpaceAdminRole(role) ||
    normalizeSpacePermissions(role.permissions).includes('manageChannels')
  );
}

function entryVisibleToRoles(entry: AclEntry, heldRoleIds: ReadonlySet<string>): boolean {
  const allowed = entry.allowedRoleIds ?? [];
  return allowed.some((id) => heldRoleIds.has(id.toHexString()));
}

/**
 * Publishes `space_channel_layout_updated` such that each member only receives
 * the channels/categories they are allowed to view.
 */
export async function publishLayoutUpdated(
  spaceId: ObjectId,
  categories: readonly SpaceChannelCategoryDocument[],
  channels: readonly SpaceChannelDocument[],
): Promise<void> {
  const spaceIdHex = spaceId.toHexString();
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyoneId = findEveryoneRole(roles)?._id ?? null;

  const isOpen = (entry: AclEntry): boolean => channelIsEveryoneOpen(entry, everyoneId);

  const openCategories = categories.filter(isOpen);
  const openChannels = channels.filter(isOpen);
  const restrictedCategories = categories.filter((c) => !isOpen(c));
  const restrictedChannels = channels.filter((c) => !isOpen(c));

  const buildEvent = (
    cats: readonly SpaceChannelCategoryDocument[],
    chans: readonly SpaceChannelDocument[],
  ) => ({
    type: 'space_channel_layout_updated',
    data: {
      spaceId: spaceIdHex,
      categories: cats.map(toPublicSpaceChannelCategory),
      channels: chans.map(toPublicSpaceChannel),
    },
  });

  if (restrictedCategories.length === 0 && restrictedChannels.length === 0) {
    await publishSpaceEvent(spaceIdHex, buildEvent(categories, channels));
    return;
  }

  // Roles that unlock at least one restricted entry, plus manageChannels
  // holders (who bypass channel ACLs entirely).
  const privilegedRoleIds = new Map<string, ObjectId>();
  for (const entry of [...restrictedCategories, ...restrictedChannels]) {
    for (const id of entry.allowedRoleIds ?? []) {
      privilegedRoleIds.set(id.toHexString(), id);
    }
  }
  for (const role of roles) {
    if (roleGrantsManageChannels(role)) {
      privilegedRoleIds.set(role._id.toHexString(), role._id);
    }
  }

  const privilegedMembers = await getSpaceMemberRepository().listByAnyRole(spaceId, [
    ...privilegedRoleIds.values(),
  ]);

  const manageRoleIds = new Set(
    roles.filter(roleGrantsManageChannels).map((r) => r._id.toHexString()),
  );

  // Group privileged members by which restricted entries they can see, so each
  // distinct view is published once with an audience list.
  const groups = new Map<string, { identityIds: string[]; catIdx: number[]; chanIdx: number[] }>();
  for (const member of privilegedMembers) {
    const held = new Set((member.roleIds ?? []).map((id) => id.toHexString()));
    const canManage = [...held].some((id) => manageRoleIds.has(id));
    const catIdx = restrictedCategories
      .map((c, i) => (canManage || entryVisibleToRoles(c, held) ? i : -1))
      .filter((i) => i >= 0);
    const chanIdx = restrictedChannels
      .map((c, i) => (canManage || entryVisibleToRoles(c, held) ? i : -1))
      .filter((i) => i >= 0);
    const signature = `c:${catIdx.join(',')}|h:${chanIdx.join(',')}`;
    const group = groups.get(signature);
    if (group) {
      group.identityIds.push(member.identityId.toHexString());
    } else {
      groups.set(signature, {
        identityIds: [member.identityId.toHexString()],
        catIdx,
        chanIdx,
      });
    }
  }

  const privilegedIdentityIds = privilegedMembers.map((m) => m.identityId.toHexString());

  // Baseline view for everyone else.
  await publishSpaceEvent(spaceIdHex, buildEvent(openCategories, openChannels), {
    excludeIdentityIds: privilegedIdentityIds,
  });

  const byPosition = <T extends { position: number; _id: ObjectId }>(a: T, b: T) =>
    a.position - b.position || a._id.toHexString().localeCompare(b._id.toHexString());

  for (const group of groups.values()) {
    const cats = [...openCategories, ...group.catIdx.map((i) => restrictedCategories[i]!)].sort(
      byPosition,
    );
    const chans = [...openChannels, ...group.chanIdx.map((i) => restrictedChannels[i]!)].sort(
      byPosition,
    );
    await publishSpaceEvent(spaceIdHex, buildEvent(cats, chans), {
      audienceIdentityIds: group.identityIds,
    });
  }
}
