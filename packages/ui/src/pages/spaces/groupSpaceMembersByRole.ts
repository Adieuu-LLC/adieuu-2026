/**
 * Discord-style member-list grouping: hoisted roles (`displaySeparately`) first
 * by hierarchy (lower `position` = higher), then a leftover Members bucket.
 */

import type { PublicIdentity, PublicSpaceMember, PublicSpaceRole } from '@adieuu/shared';
import { findEveryoneRole } from './channelRoleHierarchy';

export interface SpaceMemberGroup {
  /** Role id for hoisted groups; `null` for the leftover Members section. */
  roleId: string | null;
  title: string;
  /** Role colour for section accent (hoisted only). */
  color?: string;
  members: PublicSpaceMember[];
}

export function resolveMemberDisplaySortKey(
  member: PublicSpaceMember,
  profiles: Record<string, PublicIdentity>,
): string {
  const nick = member.nickname?.trim();
  if (nick) return nick.toLowerCase();
  const p = profiles[member.identityId];
  return (p?.displayName ?? p?.username ?? member.identityId).toLowerCase();
}

/** Highest (lowest position) hoisted role among held roles, or null. */
export function memberHoistedRole(
  member: PublicSpaceMember,
  hoistedByPosition: readonly PublicSpaceRole[],
): PublicSpaceRole | null {
  const held = new Set(member.roleIds);
  for (const role of hoistedByPosition) {
    if (held.has(role.id)) return role;
  }
  return null;
}

/**
 * Groups members under `displaySeparately` roles (sorted by position ascending),
 * then a final Members section. Empty hoisted groups are omitted.
 */
export function groupSpaceMembersByRole(
  members: readonly PublicSpaceMember[],
  roles: readonly PublicSpaceRole[],
  profiles: Record<string, PublicIdentity>,
  membersFallbackTitle = 'Members',
): SpaceMemberGroup[] {
  const hoisted = roles
    .filter((r) => r.displaySeparately)
    .slice()
    .sort((a, b) => a.position - b.position);

  const buckets = new Map<string, PublicSpaceMember[]>();
  for (const role of hoisted) buckets.set(role.id, []);
  const leftovers: PublicSpaceMember[] = [];

  for (const member of members) {
    const hoist = memberHoistedRole(member, hoisted);
    if (hoist) {
      buckets.get(hoist.id)!.push(member);
    } else {
      leftovers.push(member);
    }
  }

  const sortMembers = (list: PublicSpaceMember[]) =>
    list
      .slice()
      .sort((a, b) =>
        resolveMemberDisplaySortKey(a, profiles).localeCompare(
          resolveMemberDisplaySortKey(b, profiles),
        ),
      );

  const groups: SpaceMemberGroup[] = [];
  for (const role of hoisted) {
    const list = buckets.get(role.id) ?? [];
    if (list.length === 0) continue;
    groups.push({
      roleId: role.id,
      title: role.name || membersFallbackTitle,
      color: role.color,
      members: sortMembers(list),
    });
  }

  if (leftovers.length > 0) {
    const everyone = findEveryoneRole(roles);
    groups.push({
      roleId: null,
      title: everyone?.name || membersFallbackTitle,
      members: sortMembers(leftovers),
    });
  }

  return groups;
}

/** Custom member colour, else highest held role with a colour. */
export function resolveSpaceMemberColor(
  member: PublicSpaceMember,
  roles: readonly PublicSpaceRole[],
): string | undefined {
  if (member.color) return member.color;
  const held = new Set(member.roleIds);
  let best: PublicSpaceRole | null = null;
  for (const role of roles) {
    if (!held.has(role.id) || !role.color) continue;
    if (!best || role.position < best.position) best = role;
  }
  return best?.color;
}

/** Build a conversation-compatible MemberSettingsMap from Space members. */
export function spaceMembersToSettingsMap(
  members: readonly PublicSpaceMember[],
  roles: readonly PublicSpaceRole[],
): Record<string, { nickname?: string; color?: string }> {
  const map: Record<string, { nickname?: string; color?: string }> = {};
  for (const member of members) {
    const nickname = member.nickname?.trim() || undefined;
    const color = resolveSpaceMemberColor(member, roles);
    if (nickname || color) {
      map[member.identityId] = {
        ...(nickname ? { nickname } : {}),
        ...(color ? { color } : {}),
      };
    }
  }
  return map;
}

export interface MemberRoleBadge {
  id: string;
  name: string;
  color: string;
}

/**
 * Roles held by a member, sorted by hierarchy (lowest position first).
 * When there are more than 3 roles, show the first two and treat the rest as overflow (+X).
 */
export function getMemberRoleBadges(
  member: PublicSpaceMember,
  roles: readonly PublicSpaceRole[],
  resolveName: (role: PublicSpaceRole) => string,
): { visible: MemberRoleBadge[]; overflow: MemberRoleBadge[] } {
  const held = new Set(member.roleIds);
  const sorted = roles
    .filter((r) => held.has(r.id))
    .slice()
    .sort((a, b) => a.position - b.position);

  const badges: MemberRoleBadge[] = sorted.map((r) => ({
    id: r.id,
    name: resolveName(r),
    color: r.color,
  }));

  if (badges.length <= 3) {
    return { visible: badges, overflow: [] };
  }
  return {
    visible: badges.slice(0, 2),
    overflow: badges.slice(2),
  };
}
