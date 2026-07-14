/**
 * Space invites: create, accept, decline, revoke, and list.
 *
 * Mirrors the group-conversation invite flow. Differences for Spaces:
 * - Authorization is permission-based (`invite` / `manageMembers` / `admin`)
 *   rather than the group admin array.
 * - Accepting is an invite-authorized join (`viaInvite`), which only requires
 *   the `free` tier — the anti-abuse gate for free-tier accepts is the
 *   `requireCaptchaForFreeTier` route middleware, applied at route registration.
 *
 * Realtime fan-out and notifications are added in the `realtime`/`fe-invites`
 * phases; this module owns the data + authorization only.
 *
 * @module services/space/invites
 */

import { ObjectId } from 'mongodb';
import { evaluateSpaceJoin } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceInviteRepository } from '../../repositories/space-invite.repository';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceInvite } from '../../models/space-invite';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { addSpaceMembership, resolveEffectiveTier } from './members';
import type {
  SpaceBillingContext,
  SpaceInviteResult,
  SpaceInvitesListResult,
} from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

/**
 * Create a pending invite. Requires the inviter to hold `invite` (or `admin`).
 * Rejects self-invites, unknown/absent invitees, existing members, and
 * duplicate pending invites.
 */
export async function createSpaceInvite(
  spaceIdRaw: string | ObjectId,
  inviterIdentityIdRaw: string | ObjectId,
  invitedIdentityIdRaw: string | ObjectId,
): Promise<SpaceInviteResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const inviterId = parseObjId(inviterIdentityIdRaw);
  const invitedId = parseObjId(invitedIdentityIdRaw);
  if (!spaceId || !inviterId || !invitedId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  if (inviterId.equals(invitedId)) {
    return { success: false, error: 'You cannot invite yourself.', errorCode: 'CANNOT_INVITE_SELF' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, inviterId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'invite')) {
    return { success: false, error: 'You do not have permission to invite members.', errorCode: 'FORBIDDEN' };
  }

  const invited = await getIdentityRepository().findByIdentityId(invitedId);
  if (!invited) {
    return { success: false, error: 'That identity was not found.', errorCode: 'IDENTITY_NOT_FOUND' };
  }

  const memberRepo = getSpaceMemberRepository();
  const alreadyMember = await memberRepo.findMember(spaceId, invitedId);
  if (alreadyMember) {
    return { success: false, error: 'That identity is already a member.', errorCode: 'ALREADY_MEMBER' };
  }

  const inviteRepo = getSpaceInviteRepository();
  const existingInvite = await inviteRepo.findPendingForSpace(spaceId, invitedId);
  if (existingInvite) {
    return { success: false, error: 'An invite is already pending.', errorCode: 'INVITE_EXISTS' };
  }

  const invite = await inviteRepo.createInvite({
    spaceId,
    invitedIdentityId: invitedId,
    invitedByIdentityId: inviterId,
    spaceName: space.name,
    spaceSlug: space.slug,
    memberCount: space.memberCount,
  });

  return { success: true, invite: toPublicSpaceInvite(invite) };
}

/**
 * Accept a pending invite addressed to the identity. Joins the Space via the
 * invite path (only the `free` tier is required). Idempotent with respect to
 * an existing membership.
 */
export async function acceptSpaceInvite(
  inviteIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
  billing: SpaceBillingContext,
): Promise<SpaceInviteResult> {
  const inviteId = parseObjId(inviteIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!inviteId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const inviteRepo = getSpaceInviteRepository();
  const invite = await inviteRepo.findById(inviteId);
  if (!invite || invite.status !== 'pending') {
    return { success: false, error: 'Invite not found.', errorCode: 'INVITE_NOT_FOUND' };
  }
  if (!invite.invitedIdentityId.equals(identityId)) {
    return { success: false, error: 'This invite is not addressed to you.', errorCode: 'NOT_AUTHORIZED' };
  }

  const space = await getSpaceRepository().findById(invite.spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const decision = evaluateSpaceJoin({
    visibility: space.visibility,
    allowFreeMembers: space.allowFreeMembers,
    viaInvite: true,
    tier: resolveEffectiveTier(billing),
  });
  if (!decision.allowed) {
    // Invite joins require only the free tier, so this is effectively unreachable.
    return { success: false, error: 'A paid plan is required to join this Space.', errorCode: 'TIER_REQUIRED' };
  }

  await addSpaceMembership(invite.spaceId, identityId);
  const updated = await inviteRepo.updateStatus(inviteId, 'accepted');

  return { success: true, invite: updated ? toPublicSpaceInvite(updated) : toPublicSpaceInvite(invite) };
}

/**
 * Decline a pending invite addressed to the identity.
 */
export async function declineSpaceInvite(
  inviteIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceInviteResult> {
  const inviteId = parseObjId(inviteIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!inviteId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const inviteRepo = getSpaceInviteRepository();
  const invite = await inviteRepo.findById(inviteId);
  if (!invite || invite.status !== 'pending') {
    return { success: false, error: 'Invite not found.', errorCode: 'INVITE_NOT_FOUND' };
  }
  if (!invite.invitedIdentityId.equals(identityId)) {
    return { success: false, error: 'This invite is not addressed to you.', errorCode: 'NOT_AUTHORIZED' };
  }

  const updated = await inviteRepo.updateStatus(inviteId, 'declined');
  return { success: true, invite: updated ? toPublicSpaceInvite(updated) : toPublicSpaceInvite(invite) };
}

/**
 * Revoke a pending invite. Requires the requester to hold `invite` (or `admin`)
 * in the Space.
 */
export async function revokeSpaceInvite(
  spaceIdRaw: string | ObjectId,
  inviteIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceInviteResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const inviteId = parseObjId(inviteIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !inviteId || !requesterId) {
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
  if (!memberHasPermission(perms, 'invite')) {
    return { success: false, error: 'You do not have permission to revoke invites.', errorCode: 'FORBIDDEN' };
  }

  const inviteRepo = getSpaceInviteRepository();
  const invite = await inviteRepo.findById(inviteId);
  if (!invite || !invite.spaceId.equals(spaceId)) {
    return { success: false, error: 'Invite not found.', errorCode: 'INVITE_NOT_FOUND' };
  }
  if (invite.status !== 'pending') {
    return { success: false, error: 'Invite is not pending.', errorCode: 'INVITE_NOT_PENDING' };
  }

  const updated = await inviteRepo.updateStatus(inviteId, 'revoked');
  return { success: true, invite: updated ? toPublicSpaceInvite(updated) : toPublicSpaceInvite(invite) };
}

/**
 * List an identity's pending Space invites (inbox), most recent first.
 */
export async function listSpaceInvitesForIdentity(
  identityIdRaw: string | ObjectId,
  limit = 50,
  cursor?: string,
): Promise<SpaceInvitesListResult> {
  const identityId = parseObjId(identityIdRaw);
  if (!identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;
  const invites = await getSpaceInviteRepository().findPendingForIdentity(
    identityId,
    limit + 1,
    cursorObjId,
  );

  const hasMore = invites.length > limit;
  const page = hasMore ? invites.slice(0, limit) : invites;

  return {
    success: true,
    invites: page.map(toPublicSpaceInvite),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/**
 * List a Space's pending invites. Any member may view (mirrors group invites).
 */
export async function listPendingInvitesForSpace(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceInvitesListResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const requesterId = parseObjId(requesterIdentityIdRaw);
  if (!spaceId || !requesterId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const member = await getSpaceMemberRepository().findMember(spaceId, requesterId);
  if (!member) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }

  const invites = await getSpaceInviteRepository().findAllPendingForSpace(spaceId);
  return { success: true, invites: invites.map(toPublicSpaceInvite), cursor: null };
}
