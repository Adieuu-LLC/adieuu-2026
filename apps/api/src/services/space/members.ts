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
import type { SubscriptionTierId } from '@adieuu/shared';
import { evaluateSpaceJoin } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { hasPaidAccess } from '../billing/resolve-access';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceMember } from '../../models/space-member';
import type { SpaceMemberDocument } from '../../models/space-member';
import { toPublicSpaceRole } from '../../models/space-role';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import type {
  SpaceActionResult,
  SpaceBillingContext,
  SpaceMemberResult,
  SpaceMembersListResult,
  SpaceRolesResult,
} from './types';

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
 * Returns the existing membership unchanged when already a member. Shared by
 * open-join and invite-accept; callers own any tier/visibility gating.
 */
export async function addSpaceMembership(
  spaceId: ObjectId,
  identityId: ObjectId,
): Promise<SpaceMemberDocument> {
  const memberRepo = getSpaceMemberRepository();

  const existing = await memberRepo.findMember(spaceId, identityId);
  if (existing) return existing;

  const defaultRole = await getSpaceRoleRepository().findDefaultMember(spaceId);
  const roleIds = defaultRole ? [defaultRole._id] : [];

  let member: SpaceMemberDocument;
  try {
    member = await memberRepo.createMember({ spaceId, identityId, roleIds });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const now = await memberRepo.findMember(spaceId, identityId);
      if (now) return now;
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

/**
 * Open-join a Space. Idempotent: an existing membership is returned as success.
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

  const memberRepo = getSpaceMemberRepository();

  const existing = await memberRepo.findMember(spaceId, identityId);
  if (existing) {
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

  const removed = await getSpaceMemberRepository().removeMember(spaceId, identityId);
  if (!removed) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, -1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_left',
    data: { spaceId: spaceId.toHexString(), identityId: identityId.toHexString() },
  });
  return { success: true };
}

/**
 * Remove another member. Requires the acting identity to hold `manageMembers`
 * (or `admin`). The Space owner can never be removed.
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
  if (!memberHasPermission(perms, 'manageMembers')) {
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

  const removed = await getSpaceMemberRepository().removeMember(spaceId, targetId);
  if (!removed) {
    return { success: false, error: 'That member was not found.', errorCode: 'MEMBER_NOT_FOUND' };
  }

  await getSpaceRepository().incrementMemberCount(spaceId, -1);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_member_left',
    data: { spaceId: spaceId.toHexString(), identityId: targetId.toHexString() },
  });
  return { success: true };
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
