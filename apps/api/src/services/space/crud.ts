/**
 * Space CRUD: create, get-by-slug, list-mine, discover, slug availability.
 *
 * Create seeds the default Admin + Member roles, adds the creator as an Admin
 * member, and creates the default `#general` text channel. When the Space is
 * E2EE, the caller-provided blind-relay cipher challenge and encrypted seed
 * metadata are persisted verbatim (the server performs no crypto and stores
 * no keys).
 *
 * @module services/space/crud
 */

import { ObjectId } from 'mongodb';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { getSpaceMemberRepository } from '../../repositories/space-member.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceMessageRepository } from '../../repositories/space-message.repository';
import { getSpaceReactionRepository } from '../../repositories/space-reaction.repository';
import { getSpacePinRepository } from '../../repositories/space-pin.repository';
import { getSpaceInviteRepository } from '../../repositories/space-invite.repository';
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
  DEFAULT_ADMIN_ROLE_COLOR,
  DEFAULT_MEMBER_ROLE_COLOR,
  isReservedSpaceSlug,
} from '../../constants/spaces';
import { DEFAULT_SPACE_CHANNEL_NAME } from '@adieuu/shared';
import type {
  CreateSpaceServiceParams,
  SpaceActionResult,
  SpaceBillingContext,
  SpaceListPayload,
  SpaceManageOverviewResult,
  SpaceResult,
  SpaceViewerPermissionsResult,
} from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

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

  const { description, visibility } = params;
  const isHidden = visibility === 'hidden';

  const e2ee = params.e2ee ?? false;
  const encryptIdentity = params.encryptIdentity ?? false;
  const cipherRequired = params.cipherRequired ?? false;

  // Defense-in-depth: public Spaces never carry Cipher gates or E2EE (also enforced by schema).
  if (visibility === 'public' && (params.cipherCheck || e2ee || cipherRequired || encryptIdentity)) {
    return {
      success: false,
      error: 'Public Spaces cannot use Cipher gates or encryption.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if ((e2ee || cipherRequired) && !params.cipherCheck) {
    return {
      success: false,
      error: 'A Cipher challenge is required when E2EE or cipherRequired is enabled.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if (encryptIdentity && !e2ee) {
    return {
      success: false,
      error: 'encryptIdentity requires e2ee.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if (e2ee && !params.encryptedSeed) {
    return {
      success: false,
      error: 'encryptedSeed is required when E2EE is enabled.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if (encryptIdentity && !(params.encryptedName && params.nameNonce && params.cipherId)) {
    return {
      success: false,
      error: 'Encrypted name fields are required when encryptIdentity is enabled.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if (!encryptIdentity && !params.name) {
    return {
      success: false,
      error: 'Name is required when encryptIdentity is not enabled.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  // Resolve the Space id (client-generated for cipher binding and for Hidden routing).
  let spaceObjId: ObjectId;
  if (params.id !== undefined) {
    if (!isValidObjectId(params.id)) {
      return { success: false, error: 'Invalid Space id.', errorCode: 'INVALID_ID' };
    }
    spaceObjId = new ObjectId(params.id);
  } else if (isHidden) {
    // Hidden Spaces always route by ObjectId; require a client id so slug === id.
    return {
      success: false,
      error: 'Hidden Spaces require a client-generated id.',
      errorCode: 'INVALID_ID',
    };
  } else {
    spaceObjId = new ObjectId();
  }

  // Hidden Spaces never get a vanity URL — slug is always the ObjectId hex
  // (client vanity slugs are ignored).
  const slug = isHidden ? spaceObjId.toHexString() : (params.slug ?? '');
  if (!isHidden) {
    if (!slug) {
      return { success: false, error: 'A URL slug is required.', errorCode: 'SLUG_REQUIRED' };
    }
    if (isReservedSpaceSlug(slug)) {
      return { success: false, error: 'That URL is reserved.', errorCode: 'SLUG_RESERVED' };
    }
  }

  const creatorObjId =
    creatorIdentityId instanceof ObjectId ? creatorIdentityId : new ObjectId(creatorIdentityId);

  const spaceRepo = getSpaceRepository();

  // Fast pre-check (the unique index is the authoritative guard below).
  const existing = await spaceRepo.findBySlug(slug);
  if (existing) {
    return { success: false, error: 'That URL is taken.', errorCode: 'SLUG_TAKEN' };
  }

  const storedName = encryptIdentity ? '' : (params.name ?? '');

  let space;
  try {
    space = await spaceRepo.createSpace({
      _id: spaceObjId,
      slug,
      name: storedName,
      ...(!encryptIdentity && description !== undefined ? { description } : {}),
      visibility,
      ...(params.cipherCheck ? { cipherCheck: params.cipherCheck } : {}),
      e2ee,
      encryptIdentity,
      cipherRequired,
      ...(encryptIdentity
        ? {
            encryptedName: params.encryptedName,
            nameNonce: params.nameNonce,
            cipherId: params.cipherId,
            ...(params.encryptedDescription && params.descriptionNonce
              ? {
                  encryptedDescription: params.encryptedDescription,
                  descriptionNonce: params.descriptionNonce,
                }
              : {}),
          }
        : {}),
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
    const seed = params.encryptedSeed;
    const adminSeed = seed?.roles.find((r) => r.system === 'admin');
    const memberSeed = seed?.roles.find((r) => r.system === 'member');

    const adminRole = await roleRepo.createRole({
      spaceId: spaceObjId,
      name: e2ee ? '' : DEFAULT_ADMIN_ROLE_NAME,
      permissions: [...DEFAULT_ADMIN_PERMISSIONS],
      color: DEFAULT_ADMIN_ROLE_COLOR,
      displaySeparately: true,
      mentionable: false,
      position: 0,
      isSystem: true,
      systemKey: 'admin',
      ...(adminSeed
        ? {
            encryptedName: adminSeed.encryptedName,
            nameNonce: adminSeed.nameNonce,
            cipherId: adminSeed.cipherId,
          }
        : {}),
    });
    await roleRepo.createRole({
      spaceId: spaceObjId,
      name: e2ee ? '' : DEFAULT_MEMBER_ROLE_NAME,
      permissions: [...DEFAULT_MEMBER_PERMISSIONS],
      color: DEFAULT_MEMBER_ROLE_COLOR,
      displaySeparately: false,
      mentionable: false,
      position: 1000,
      isDefaultMember: true,
      isSystem: true,
      systemKey: 'member',
      ...(memberSeed
        ? {
            encryptedName: memberSeed.encryptedName,
            nameNonce: memberSeed.nameNonce,
            cipherId: memberSeed.cipherId,
          }
        : {}),
    });

    await getSpaceMemberRepository().createMember({
      spaceId: spaceObjId,
      identityId: creatorObjId,
      roleIds: [adminRole._id],
    });

    await getSpaceChannelRepository().createChannel({
      spaceId: spaceObjId,
      type: 'text',
      name: e2ee ? '' : DEFAULT_SPACE_CHANNEL_NAME,
      position: 0,
      ...(seed?.channel
        ? {
            encryptedName: seed.channel.encryptedName,
            nameNonce: seed.channel.nameNonce,
            cipherId: seed.channel.cipherId,
          }
        : {}),
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
 * Update a Space's settings (name/description/visibility/allowFreeMembers/
 * cipherRequired). Requires the acting identity to hold the `admin` permission.
 * A Space with a cipher challenge or E2EE can never be switched to `public`.
 * `cipherCheck` / `e2ee` are immutable after create.
 */
export async function updateSpace(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  updates: {
    name?: string;
    description?: string;
    visibility?: SpaceVisibility;
    allowFreeMembers?: boolean;
    cipherRequired?: boolean;
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
  if (!memberHasPermission(perms, 'manageMetadata')) {
    return {
      success: false,
      error: 'You do not have permission to manage this Space.',
      errorCode: 'FORBIDDEN',
    };
  }

  // Defense-in-depth: a Space with a Cipher association cannot become public.
  if (
    updates.visibility === 'public' &&
    (space.cipherCheck || space.e2ee || space.cipherRequired || space.encryptIdentity)
  ) {
    return {
      success: false,
      error: 'A Space with Cipher gates or encryption cannot be made public.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  // Identity-encrypted Spaces cannot receive plaintext name/description patches.
  if (space.encryptIdentity && (updates.name !== undefined || updates.description !== undefined)) {
    return {
      success: false,
      error: 'This Space encrypts its name and description; plaintext updates are not accepted.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  if (updates.cipherRequired === true && !space.cipherCheck) {
    return {
      success: false,
      error: 'A Cipher challenge is required before enabling cipherRequired.',
      errorCode: 'INVALID_ENCRYPTION',
    };
  }

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = updates.name;
  if (updates.description !== undefined) patch.description = updates.description;
  if (updates.visibility !== undefined) patch.visibility = updates.visibility;
  if (updates.allowFreeMembers !== undefined) patch.allowFreeMembers = updates.allowFreeMembers;
  if (updates.cipherRequired !== undefined) patch.cipherRequired = updates.cipherRequired;

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
 * Resolve the current viewer's membership and effective permissions.
 */
export async function getSpaceViewerPermissions(
  spaceIdRaw: string | ObjectId,
  identityIdRaw: string | ObjectId,
): Promise<SpaceViewerPermissionsResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const identityId = parseObjId(identityIdRaw);
  if (!spaceId || !identityId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' };
  }

  const perms = await resolveMemberPermissions(spaceId, identityId);
  return {
    success: true,
    viewer: {
      isMember: perms.isMember,
      isAdmin: perms.isAdmin,
      permissions: [...perms.permissions],
      roleIds: perms.roleIds.map((id) => id.toHexString()),
    },
  };
}

/**
 * Admin-only Manage overview: counts + recent joins.
 */
export async function getSpaceManageOverview(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
): Promise<SpaceManageOverviewResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
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
  if (!memberHasPermission(perms, 'manageMetadata')) {
    return {
      success: false,
      error: 'You do not have permission to manage this Space.',
      errorCode: 'FORBIDDEN',
    };
  }

  const [channelCount, recentMembers] = await Promise.all([
    getSpaceChannelRepository().countBySpace(spaceId),
    getSpaceMemberRepository().listRecentBySpace(spaceId, 10),
  ]);

  return {
    success: true,
    overview: {
      spaceId: space._id.toHexString(),
      slug: space.slug,
      name: space.name,
      visibility: space.visibility,
      e2ee: space.e2ee,
      encryptIdentity: space.encryptIdentity,
      memberCount: space.memberCount,
      channelCount,
      createdAt: space.createdAt.toISOString(),
      ...(space.encryptedName ? { encryptedName: space.encryptedName } : {}),
      ...(space.nameNonce ? { nameNonce: space.nameNonce } : {}),
      ...(space.cipherId ? { cipherId: space.cipherId } : {}),
      recentJoins: recentMembers.map((m) => ({
        identityId: m.identityId.toHexString(),
        joinedAt: m.joinedAt.toISOString(),
      })),
    },
  };
}

/**
 * Permanently delete a Space and all related documents. Admin-only.
 */
export async function deleteSpace(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
): Promise<SpaceActionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
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
  if (!memberHasPermission(perms, 'manageMetadata')) {
    return {
      success: false,
      error: 'You do not have permission to manage this Space.',
      errorCode: 'FORBIDDEN',
    };
  }

  const spaceIdHex = spaceId.toHexString();
  const channels = await getSpaceChannelRepository().findBySpace(spaceId);
  const channelIds = channels.map((c) => c._id);

  try {
    await Promise.all([
      getSpaceMessageRepository().deleteBySpace(spaceId),
      getSpaceReactionRepository().deleteBySpace(spaceId),
      getSpacePinRepository().deleteByChannelIds(channelIds),
      getSpaceInviteRepository().deleteBySpace(spaceId),
    ]);
    await Promise.all([
      getSpaceChannelRepository().deleteBySpace(spaceId),
      getSpaceMemberRepository().deleteBySpace(spaceId),
      getSpaceRoleRepository().deleteBySpace(spaceId),
    ]);
    await getSpaceRepository().deleteById(spaceId);
  } catch (err) {
    elog.error('Failed to delete Space', { spaceId: spaceIdHex, err });
    throw err;
  }

  await publishSpaceEvent(spaceIdHex, {
    type: 'space_deleted',
    data: { spaceId: spaceIdHex },
  });

  return { success: true };
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
