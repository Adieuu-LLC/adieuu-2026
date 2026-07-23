/**
 * Space membership: join, leave, remove, and list members/roles.
 *
 * Join gating is delegated to the shared, pure `evaluateSpaceJoin` rule so the
 * client and server agree:
 * - `public`/`listed`: open-join requires a paid tier unless the Space enables
 *   `allowFreeMembers`.
 * - `hidden`: never open-joinable (invite-only; handled in the invites phase).
 *
 * Reading a Space's members/roles follows visibility: `public` is readable by
 * anyone; `listed`/`hidden` require membership (and `hidden` is never revealed
 * to non-members).
 *
 * @module services/space/members
 */

import { ObjectId } from 'mongodb';
import type { SpaceBanDuration, SubscriptionTierId } from '@adieuu/shared';
import { evaluateSpaceJoin } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { hasPaidAccess } from '../billing/resolve-access';
import { isValidObjectId } from '../../utils';
import { toModerationSpaceMember, toPublicSpaceMember } from '../../models/space-member';
import type { SpaceMemberDocument } from '../../models/space-member';
import { toPublicSpaceRole } from '../../models/space-role';
import { banExpiresAtForDuration, isSpaceBanActive } from './ban-utils';
import { actorOutranksMember, topRolePosition } from './role-hierarchy';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { canReadSpace } from './access';
import { assertNotLastAdmin } from './last-admin';
import { publishSpaceEvent } from './redis-events';
import { recordSpaceAudit } from './audit';
import type {
  SpaceActionResult,
  SpaceBillingContext,
  SpaceMemberResult,
  SpaceMembersListResult,
  SpaceRolesResult,
} from './types';

export { banExpiresAtForDuration, isSpaceBanActive } from './ban-utils';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Resolves the highest effective tier for join gating. A lifetime purchase or
 * `gifted` entitlement counts as paid (`access`) even without a paid tier in
 * the subscription list, keeping this consistent with `hasPaidAccess`.
 */
export function resolveEffectiveTier(billing: SpaceBillingContext): SubscriptionTierId {
  let tier: SubscriptionTierId = 'free';
  for (const t of billing.subscriptions) {
    if (t === 'insider') return 'insider';
    if (t === 'access') tier = 'access';
  }
  if (tier === 'free' && hasPaidAccess(billing)) tier = 'access';
  return tier;
}

/**
 * Adds a membership (default Member role) idempotently and bumps `memberCount`.
 * Returns the existing active membership unchanged. Reactivates an expired ban.
 * Throws/`MEMBER_BANNED` is handled by callers via {@link resolveJoinableMembership}.
 * Shared by open-join and invite-accept; callers own any tier/visibility gating.
 */
export async function addSpaceMembership(
  spaceId: ObjectId,
  identityId: ObjectId,
): Promise<SpaceMemberDocument> {
  const memberRepo = getSpaceMemberRepository();

  const existing = await memberRepo.findMember(spaceId, identityId);
  if (existing?.status === 'active') return existing;
  if (existing && isSpaceBanActive(existing)) {
    // Callers should reject before reaching here; keep a safe hard stop.
    return existing;
  }

  const defaultRole = await getSpaceRoleRepository().findDefaultMember(spaceId);
  const roleIds = defaultRole ? [defaultRole._id] : [];

  if (existing?.status === 'banned') {
    const reactivated = await memberRepo.clearBanAndActivate(spaceId, identityId, roleIds);
    if (reactivated) {
      await getSpaceRepository().incrementMemberCount(spaceId, 1);
      await publishSpaceEvent(spaceId.toHexString(), {
        type: 'space_member_joined',
        data: { spaceId: spaceId.toHexString(), member: toPublicSpaceMember(reactivated) },
      });
      return reactivated;
    }
  }

  let member: SpaceMemberDocument;
  try {
    member = await memberRepo.createMember({ spaceId, identityId, roleIds });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const now = await memberRepo.findMember(spaceId, identityId);
      if (now?.status === 'active') return now;
      if (now && isSpaceBanActive(now)) return now;
      if (now?.status === 'banned') {
        const reactivated = await memberRepo.clearBanAndActivate(spaceId, identityId, roleIds);
        if (reactivated) {
          await getSpaceRepository().incrementMemberCount(spaceId, 1);
          await publishSpaceEvent(spaceId.toHexString(), {
            type: 'space_member_joined',
            data: { spaceId: spaceId.toHexString(), member: toPublicSpaceMember(reactivated) },
          });
          return reactivated;
        }
      }
    }
    throw err;
  }

  await getSpaceRepository().incrementMemberCount(spaceId, 1);

  // Fan out to active members (covers both open-join and invite-accept).
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_joined',
    data: { spaceId: spaceId.toHexString(), member: toPublicSpaceMember(member) },
  });

  return member;
}

async function rejectIfActivelyBanned(
  spaceId: ObjectId,
  identityId: ObjectId,
): Promise<SpaceMemberResult | null> {
  const existing = await getSpaceMemberRepository().findMember(spaceId, identityId);
  if (existing && isSpaceBanActive(existing)) {
    return {
      success: false,
      error: 'You are banned from this Space.',
      errorCode: 'MEMBER_BANNED',
      member: toPublicSpaceMember(existing),
    };
  }
  return null;
}

/**
 * Open-join a Space. Idempotent: an existing active membership is returned as success.
 * Active bans are rejected; expired bans are cleared and the member rejoins.
 * Invite-authorized joins are handled separately in the invites phase.
 */
export async function joinSpace(
  spaceIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
  billing: SpaceBillingContext,
): Promise<SpaceMemberResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const banned = await rejectIfActivelyBanned(spaceId, identityId);
  if (banned) return banned;

  const memberRepo = getSpaceMemberRepository();
  const existing = await memberRepo.findMember(spaceId, identityId);
  if (existing?.status === 'active') {
    return { success: true, member: toPublicSpaceMember(existing) };
  }

  const decision = evaluateSpaceJoin({
    visibility: space.visibility,
    allowFreeMembers: space.allowFreeMembers,
    viaInvite: false,
    tier: resolveEffectiveTier(billing),
  });
  if (!decision.allowed) {
    if (decision.reason === 'invite_required') {
      return { success: false, error: 'This Space is invite-only.', errorCode: 'INVITE_REQUIRED' };
    }
    return {
      success: false,
      error: 'A paid plan is required to join this Space.',
      errorCode: 'TIER_REQUIRED',
    };
  }

  const member = await addSpaceMembership(spaceId, identityId);
  if (isSpaceBanActive(member)) {
    return {
      success: false,
      error: 'You are banned from this Space.',
      errorCode: 'MEMBER_BANNED',
      member: toPublicSpaceMember(member),
    };
  }
  return { success: true, member: toPublicSpaceMember(member) };
}

/**
 * Leave a Space. The owner cannot leave their own Space (ownership transfer /
 * deletion is a later feature).
 */
export async function leaveSpace(
  spaceIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceActionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  if (space.ownerIdentityId.equals(identityId)) {
    return {
      success: false,
      error: 'The owner cannot leave their own Space.',
      errorCode: 'OWNER_CANNOT_LEAVE',
    };
  }

  const lastAdmin = await assertNotLastAdmin(spaceId, identityId);
  if (lastAdmin) return lastAdmin;

  const removed = await getSpaceMemberRepository().removeMember(spaceId, identityId);
  if (!removed) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, -1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_left',
    data: {
      spaceId: spaceId.toHexString(),
      identityId: identityId.toHexString(),
      reason: 'left',
    },
  });
  return { success: true };
}

/**
 * Remove another member. Requires `kickMembers`. The Space owner can never be removed.
 */
export async function removeSpaceMember(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  targetIdentityIdRaw: string | ObjectId,
): Promise<SpaceActionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  const targetId = parseObjId(targetIdentityIdRaw);
  if (!spaceId || !actingId || !targetId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'kickMembers')) {
    return {
      success: false,
      error: 'You do not have permission to remove members.',
      errorCode: 'FORBIDDEN',
    };
  }

  if (space.ownerIdentityId.equals(targetId)) {
    return {
      success: false,
      error: 'The Space owner cannot be removed.',
      errorCode: 'CANNOT_REMOVE_OWNER',
    };
  }

  const memberRepo = getSpaceMemberRepository();
  const target = await memberRepo.findMember(spaceId, targetId);
  if (!target) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  const rankBlock = await assertActorOutranksTarget(spaceId, perms, target);
  if (rankBlock) return rankBlock;

  const lastAdmin = await assertNotLastAdmin(spaceId, targetId);
  if (lastAdmin) return lastAdmin;

  const removed = await memberRepo.removeMember(spaceId, targetId);
  if (!removed) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, -1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_left',
    data: {
      spaceId: spaceId.toHexString(),
      identityId: targetId.toHexString(),
      reason: 'kicked',
    },
  });
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'member_kick',
    targetIdentityId: targetId,
  });
  return { success: true };
}

/**
 * Ban another member. Requires `banMembers`. Keeps the membership row so join/discover
 * can detect the ban. The Space owner can never be banned.
 */
export async function banSpaceMember(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  targetIdentityIdRaw: string | ObjectId,
  params: { reason: string; duration: SpaceBanDuration },
): Promise<SpaceMemberResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  const targetId = parseObjId(targetIdentityIdRaw);
  if (!spaceId || !actingId || !targetId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const reason = params.reason.trim();
  if (!reason) {
    return { success: false, error: 'A ban reason is required.', errorCode: 'INVALID_CONTENT' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'banMembers')) {
    return {
      success: false,
      error: 'You do not have permission to ban members.',
      errorCode: 'FORBIDDEN',
    };
  }

  if (space.ownerIdentityId.equals(targetId)) {
    return {
      success: false,
      error: 'The Space owner cannot be banned.',
      errorCode: 'CANNOT_REMOVE_OWNER',
    };
  }

  if (actingId.equals(targetId)) {
    return {
      success: false,
      error: 'You cannot ban yourself.',
      errorCode: 'FORBIDDEN',
    };
  }

  const memberRepo = getSpaceMemberRepository();
  const target = await memberRepo.findMember(spaceId, targetId);
  if (!target) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  const rankBlock = await assertActorOutranksTarget(spaceId, perms, target);
  if (rankBlock) return rankBlock;

  const lastAdmin = await assertNotLastAdmin(spaceId, targetId);
  if (lastAdmin) return lastAdmin;

  const bannedAt = new Date();
  const banExpiresAt = banExpiresAtForDuration(params.duration, bannedAt);
  const banned = await memberRepo.banMember(spaceId, targetId, {
    banReason: reason,
    bannedAt,
    banExpiresAt,
  });
  if (!banned) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, -1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_left',
    data: {
      spaceId: spaceId.toHexString(),
      identityId: targetId.toHexString(),
      reason: 'banned',
    },
  });
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'member_ban',
    targetIdentityId: targetId,
    metadata: { duration: params.duration, reason },
  });
  // Moderation-scoped response: the caller holds `banMembers`, so ban details
  // (reason/time) may be included here — never in public serializations.
  return { success: true, member: toModerationSpaceMember(banned) };
}

/**
 * Lift a ban and restore active membership with the default Member role.
 * Requires `banMembers`. Mirrors expired-ban rejoin via {@link clearBanAndActivate}.
 */
export async function unbanSpaceMember(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  targetIdentityIdRaw: string | ObjectId,
): Promise<SpaceMemberResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  const targetId = parseObjId(targetIdentityIdRaw);
  if (!spaceId || !actingId || !targetId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'banMembers')) {
    return {
      success: false,
      error: 'You do not have permission to unban members.',
      errorCode: 'FORBIDDEN',
    };
  }

  if (actingId.equals(targetId)) {
    return {
      success: false,
      error: 'You cannot unban yourself.',
      errorCode: 'FORBIDDEN',
    };
  }

  const memberRepo = getSpaceMemberRepository();
  const target = await memberRepo.findMember(spaceId, targetId);
  if (!target || target.status !== 'banned') {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  const defaultRole = await getSpaceRoleRepository().findDefaultMember(spaceId);
  const roleIds = defaultRole ? [defaultRole._id] : [];
  const reactivated = await memberRepo.clearBanAndActivate(spaceId, targetId, roleIds);
  if (!reactivated) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, 1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_joined',
    data: { spaceId: spaceId.toHexString(), member: toPublicSpaceMember(reactivated) },
  });
  void recordSpaceAudit({
    spaceId,
    actorIdentityId: actingId,
    action: 'member_unban',
    targetIdentityId: targetId,
  });
  return { success: true, member: toPublicSpaceMember(reactivated) };
}

/**
 * List banned members (moderation-scoped). Requires `banMembers`.
 */
export async function listBannedSpaceMembers(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<SpaceMembersListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, requesterId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'banMembers')) {
    return {
      success: false,
      error: 'You do not have permission to view banned members.',
      errorCode: 'FORBIDDEN',
    };
  }

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const members = await getSpaceMemberRepository().listBannedBySpace(
    spaceId,
    limit + 1,
    cursorObjId,
  );

  const hasMore = members.length > limit;
  const page = hasMore ? members.slice(0, limit) : members;

  return {
    success: true,
    members: page.map(toModerationSpaceMember),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/**
 * Rank gate for moderation actions: non-admin actors may only act on members
 * they strictly outrank. Returns an `ESCALATION` failure, or null when allowed.
 */
async function assertActorOutranksTarget(
  spaceId: ObjectId,
  actorPerms: Awaited<ReturnType<typeof resolveMemberPermissions>>,
  target: SpaceMemberDocument,
): Promise<SpaceActionResult | null> {
  if (actorPerms.isAdmin) return null;
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const actorTop = topRolePosition(actorPerms.roleIds, roles);
  const targetTop = topRolePosition(target.roleIds, roles);
  if (!actorOutranksMember(actorTop, targetTop)) {
    return {
      success: false,
      error: 'You cannot act on a member with equal or higher rank.',
      errorCode: 'ESCALATION',
    };
  }
  return null;
}

/**
 * Update a member's Space-scoped nickname and/or colour.
 *
 * - Self: requires `changeNickname`
 * - Others: requires `manageNicknames`, and target must not outrank the actor
 */
export async function updateSpaceMemberProfile(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  targetIdentityIdRaw: string | ObjectId,
  patch: { nickname?: string | null; color?: string | null },
): Promise<SpaceMemberResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  const targetId = parseObjId(targetIdentityIdRaw);
  if (!spaceId || !actingId || !targetId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  if (patch.nickname === undefined && patch.color === undefined) {
    return {
      success: false,
      error: 'At least one of nickname or color is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const memberRepo = getSpaceMemberRepository();
  const actor = await memberRepo.findMember(spaceId, actingId);
  if (!actor || actor.status !== 'active') {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  const isSelf = actingId.equals(targetId);

  if (isSelf) {
    if (!memberHasPermission(perms, 'changeNickname')) {
      return {
        success: false,
        error: 'You do not have permission to change your nickname.',
        errorCode: 'FORBIDDEN',
      };
    }
  } else if (!memberHasPermission(perms, 'manageNicknames')) {
    return {
      success: false,
      error: 'You do not have permission to manage nicknames.',
      errorCode: 'FORBIDDEN',
    };
  }

  const target = isSelf ? actor : await memberRepo.findMember(spaceId, targetId);
  if (!target || target.status !== 'active') {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  if (!isSelf) {
    const roles = await getSpaceRoleRepository().findBySpace(spaceId);
    const actorTop = topRolePosition(actor.roleIds, roles);
    const targetTop = topRolePosition(target.roleIds, roles);
    if (
      actorTop !== null &&
      targetTop !== null &&
      targetTop < actorTop
    ) {
      return {
        success: false,
        error: 'You cannot edit a member who outranks you.',
        errorCode: 'ESCALATION',
      };
    }
  }

  const updated = await memberRepo.updateProfile(spaceId, targetId, patch);
  if (!updated) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  const member = toPublicSpaceMember(updated);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_updated',
    data: { spaceId: spaceId.toHexString(), member },
  });

  return { success: true, member };
}

/**
 * List a Space's members (oldest first, cursor-paginated). Visibility applies:
 * `public` is open; `listed`/`hidden` require membership.
 */
export async function listSpaceMembers(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<SpaceMembersListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const members = await getSpaceMemberRepository().listBySpace(spaceId, limit + 1, cursorObjId);

  const hasMore = members.length > limit;
  const page = hasMore ? members.slice(0, limit) : members;

  return {
    success: true,
    members: page.map(toPublicSpaceMember),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/**
 * List a Space's roles. Visibility applies as with member listing.
 */
export async function listSpaceRoles(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceRolesResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const access = await canReadSpace(space, requesterId);
  if (!access.ok) return { success: false, error: access.error, errorCode: access.errorCode };

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  return { success: true, roles: roles.map(toPublicSpaceRole) };
}
