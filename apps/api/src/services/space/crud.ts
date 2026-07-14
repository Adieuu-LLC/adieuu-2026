/**
 * Space CRUD: create, get-by-slug, list-mine, discover, slug availability.
 *
 * Create seeds the default Admin + Member roles, adds the creator as an Admin
 * member, and creates the default `#general` text channel. When the Space is
 * E2EE, the caller-provided blind-relay cipher challenge is persisted verbatim
 * (the server performs no crypto and stores no keys).
 *
 * @module services/space/crud
 */

import { ObjectId } from 'mongodb';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { hasPaidAccess } from '../billing/resolve-access';
import { isValidObjectId } from '../../utils';
import elog from '../../utils/adieuuLogger';
import { toPublicSpace } from '../../models/space';
import { resolveMemberPermissions, memberHasPermission } from './permissions';
import { publishSpaceEvent, publishSpaceEventToIdentity } from './redis-events';
import type { PublicSpace, SpaceVisibility } from '@adieuu/shared';
import {
  DEFAULT_ADMIN_ROLE_NAME,
  DEFAULT_MEMBER_ROLE_NAME,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
} from '../../constants/spaces';
import { isReservedSpaceSlug } from '../../constants/spaces';
import { DEFAULT_SPACE_CHANNEL_NAME } from '@adieuu/shared';
import type {
  CreateSpaceServiceParams,
  SpaceBillingContext,
  SpaceListPayload,
  SpaceResult,
} from './types';

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Create a Space. Paid-only; seeds roles/member/#general and persists the
 * cipher challenge for E2EE Spaces.
 */
export async function createSpace(
  creatorIdentityId: string | ObjectId,
  params: CreateSpaceServiceParams,
  billing: SpaceBillingContext,
): Promise<SpaceResult> {
  // Paid gate — Space creation is a paid feature regardless of visibility.
  if (!hasPaidAccess(billing)) {
    return {
      success: false,
      error: 'Upgrade to a paid plan to create a Space.',
      errorCode: 'TIER_REQUIRED',
    };
  }

  const { slug, name, description, visibility } = params;

  if (isReservedSpaceSlug(slug)) {
    return { success: false, error: 'That URL is reserved.', errorCode: 'SLUG_RESERVED' };
  }

  // Defense-in-depth: public Spaces never carry Space-wide E2EE (also enforced by schema).
  if (visibility === 'public' && params.cipherCheck) {
    return {
      success: false,
      error: 'Public Spaces cannot have Space-wide encryption.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  // Resolve the Space id (client-generated when the cipher challenge is bound to it).
  let spaceObjId: ObjectId;
  if (params.id !== undefined) {
    if (!isValidObjectId(params.id)) {
      return { success: false, error: 'Invalid Space id.', errorCode: 'INVALID_ID' };
    }
    spaceObjId = new ObjectId(params.id);
  } else {
    spaceObjId = new ObjectId();
  }

  const creatorObjId =
    creatorIdentityId instanceof ObjectId ? creatorIdentityId : new ObjectId(creatorIdentityId);

  const spaceRepo = getSpaceRepository();

  // Fast pre-check (the unique index is the authoritative guard below).
  const existing = await spaceRepo.findBySlug(slug);
  if (existing) {
    return { success: false, error: 'That URL is taken.', errorCode: 'SLUG_TAKEN' };
  }

  let space;
  try {
    space = await spaceRepo.createSpace({
      _id: spaceObjId,
      slug,
      name,
      ...(description !== undefined ? { description } : {}),
      visibility,
      ...(params.cipherCheck ? { cipherCheck: params.cipherCheck } : {}),
      createdBy: creatorObjId,
      ownerIdentityId: creatorObjId,
      allowFreeMembers: params.allowFreeMembers ?? false,
      memberCount: 1,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { success: false, error: 'That URL is taken.', errorCode: 'SLUG_TAKEN' };
    }
    throw err;
  }

  // Seed roles, creator membership, and the default channel. On failure, roll
  // back the orphaned documents (no multi-doc transaction requirement).
  try {
    const roleRepo = getSpaceRoleRepository();
    const adminRole = await roleRepo.createRole({
      spaceId: spaceObjId,
      name: DEFAULT_ADMIN_ROLE_NAME,
      permissions: [...DEFAULT_ADMIN_PERMISSIONS],
      isSystem: true,
    });
    await roleRepo.createRole({
      spaceId: spaceObjId,
      name: DEFAULT_MEMBER_ROLE_NAME,
      permissions: [...DEFAULT_MEMBER_PERMISSIONS],
      isDefaultMember: true,
      isSystem: true,
    });

    await getSpaceMemberRepository().createMember({
      spaceId: spaceObjId,
      identityId: creatorObjId,
      roleIds: [adminRole._id],
    });

    await getSpaceChannelRepository().createChannel({
      spaceId: spaceObjId,
      type: 'text',
      name: DEFAULT_SPACE_CHANNEL_NAME,
      position: 0,
    });
  } catch (err) {
    elog.error('Failed to seed Space after create; rolling back', { spaceId: spaceObjId.toHexString(), err });
    await rollbackSpaceSeed(spaceObjId);
    throw err;
  }

  const publicSpace = toPublicSpace(space);
  // Notify the creator so their Spaces sidebar updates in real time.
  await publishSpaceEventToIdentity(creatorObjId.toHexString(), {
    type: 'space_created',
    data: { space: publicSpace },
  });

  return { success: true, space: publicSpace };
}

/** Best-effort cleanup of a partially-seeded Space. */
async function rollbackSpaceSeed(spaceId: ObjectId): Promise<void> {
  try {
    await Promise.all([
      getSpaceChannelRepository().deleteBySpace(spaceId),
      getSpaceMemberRepository().deleteBySpace(spaceId),
      getSpaceRoleRepository().deleteBySpace(spaceId),
    ]);
    await getSpaceRepository().deleteById(spaceId);
  } catch (cleanupErr) {
    elog.error('Space rollback cleanup failed', { spaceId: spaceId.toHexString(), cleanupErr });
  }
}

/**
 * Fetch a Space by slug. Hidden Spaces are only visible to members; their
 * existence is not revealed to non-members.
 */
export async function getSpaceBySlug(
  slug: string,
  requesterIdentityId?: string | ObjectId,
): Promise<SpaceResult> {
  const space = await getSpaceRepository().findBySlug(slug);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  if (space.visibility === 'hidden') {
    if (!requesterIdentityId) {
      return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
    }
    const requesterObjId =
      requesterIdentityId instanceof ObjectId
        ? requesterIdentityId
        : new ObjectId(requesterIdentityId);
    const member = await getSpaceMemberRepository().findMember(space._id, requesterObjId);
    if (!member) {
      // Do not reveal that a hidden Space exists.
      return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
    }
  }

  return { success: true, space: toPublicSpace(space) };
}

/**
 * Fetch a Space by id. Hidden Spaces are only visible to members; their
 * existence is not revealed to non-members.
 */
export async function getSpaceById(
  spaceIdRaw: string | ObjectId,
  requesterIdentityId?: string | ObjectId,
): Promise<SpaceResult> {
  const spaceId =
    spaceIdRaw instanceof ObjectId
      ? spaceIdRaw
      : isValidObjectId(spaceIdRaw)
        ? new ObjectId(spaceIdRaw)
        : null;
  if (!spaceId) {
    return { success: false, error: 'Invalid Space id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  if (space.visibility === 'hidden') {
    if (!requesterIdentityId) {
      return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
    }
    const requesterObjId =
      requesterIdentityId instanceof ObjectId
        ? requesterIdentityId
        : new ObjectId(requesterIdentityId);
    const member = await getSpaceMemberRepository().findMember(space._id, requesterObjId);
    if (!member) {
      // Do not reveal that a hidden Space exists.
      return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
    }
  }

  return { success: true, space: toPublicSpace(space) };
}

/**
 * Update a Space's settings (name/description/visibility/allowFreeMembers).
 * Requires the acting identity to hold the `admin` permission. A Space carrying
 * a cipher challenge (Space-wide E2EE) can never be switched to `public`.
 */
export async function updateSpace(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  updates: {
    name?: string;
    description?: string;
    visibility?: SpaceVisibility;
    allowFreeMembers?: boolean;
  },
): Promise<SpaceResult> {
  const spaceId =
    spaceIdRaw instanceof ObjectId
      ? spaceIdRaw
      : isValidObjectId(spaceIdRaw)
        ? new ObjectId(spaceIdRaw)
        : null;
  const actingId =
    actingIdentityIdRaw instanceof ObjectId
      ? actingIdentityIdRaw
      : isValidObjectId(actingIdentityIdRaw)
        ? new ObjectId(actingIdentityIdRaw)
        : null;
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const spaceRepo = getSpaceRepository();
  const space = await spaceRepo.findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return { success: false, error: 'You are not a member of this Space.', errorCode: 'NOT_MEMBER' };
  }
  if (!memberHasPermission(perms, 'admin')) {
    return {
      success: false,
      error: 'You do not have permission to manage this Space.',
      errorCode: 'FORBIDDEN',
    };
  }

  // Defense-in-depth: an E2EE Space cannot become public (public Spaces never
  // carry a Space-wide cipher challenge).
  if (updates.visibility === 'public' && space.cipherCheck) {
    return {
      success: false,
      error: 'An encrypted Space cannot be made public.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.visibility !== undefined) patch.visibility = updates.visibility;
  if (updates.allowFreeMembers !== undefined) patch.allowFreeMembers = updates.allowFreeMembers;

  const updated = await spaceRepo.updateById(spaceId, patch as never);
  if (!updated) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const publicSpace = toPublicSpace(updated);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_updated',
    data: { space: publicSpace },
  });

  return { success: true, space: publicSpace };
}

/**
 * List Spaces the identity is a member of, most recently joined first.
 */
export async function listMySpaces(
  identityId: string | ObjectId,
  limit = 100,
  cursor?: string,
): Promise<SpaceListPayload> {
  const identityObjId = identityId instanceof ObjectId ? identityId : new ObjectId(identityId);
  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;

  const memberships = await getSpaceMemberRepository().findForIdentity(
    identityObjId,
    limit + 1,
    cursorObjId,
  );

  const hasMore = memberships.length > limit;
  const page = hasMore ? memberships.slice(0, limit) : memberships;

  const spaces = await getSpaceRepository().findByIds(page.map((m) => m.spaceId));
  const byId = new Map<string, PublicSpace>();
  for (const s of spaces) {
    byId.set(s._id.toHexString(), toPublicSpace(s));
  }

  // Preserve membership order and drop any spaces that no longer exist.
  const ordered: PublicSpace[] = [];
  for (const m of page) {
    const pub = byId.get(m.spaceId.toHexString());
    if (pub) ordered.push(pub);
  }

  return {
    spaces: ordered,
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/**
 * Discover public/listed Spaces for the directory. Hidden Spaces never appear.
 */
export async function discoverSpaces(options: {
  q?: string;
  limit?: number;
  cursor?: string;
} = {}): Promise<SpaceListPayload> {
  const { q, limit = 30, cursor } = options;
  const cursorObjId = cursor && isValidObjectId(cursor) ? new ObjectId(cursor) : undefined;

  const spaces = await getSpaceRepository().discover({
    ...(q ? { q } : {}),
    limit: limit + 1,
    ...(cursorObjId ? { cursor: cursorObjId } : {}),
  });

  const hasMore = spaces.length > limit;
  const page = hasMore ? spaces.slice(0, limit) : spaces;

  return {
    spaces: page.map(toPublicSpace),
    cursor: hasMore && page.length > 0 ? page[page.length - 1]!._id.toHexString() : null,
  };
}

/**
 * Whether a slug is free to claim (not reserved and not already used).
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  if (isReservedSpaceSlug(slug)) return false;
  const existing = await getSpaceRepository().findBySlug(slug);
  return existing === null;
}
