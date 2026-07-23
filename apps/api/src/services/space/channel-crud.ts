/**
 * Space channel list + create/update (role ACL + `manageChannels`).
 *
 * @module services/space/channel-crud
 */

import { ObjectId } from 'mongodb';
import type { CipherCheck, SpaceChannelType } from '@adieuu/shared';
import { SPACE_CHANNEL_TYPES } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceChannelCategoryRepository } from '../../repositories/space-channel-category.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceChannel } from '../../models/space-channel';
import type { SpaceDocument } from '../../models/space';
import type { SpaceRoleDocument } from '../../models/space-role';
import { toPublicCipherCheck } from '../../models/cipher-check';
import {
  resolveMemberPermissions,
  memberHasPermission,
  type SpaceMemberPermissions,
} from './permissions';
import {
  actorTopRolePosition,
  canViewSpaceChannel,
  findEveryoneRole,
  resolveChannelAudience,
  rolesAtOrBelowHierarchy,
} from './channel-access';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import { recordSpaceAudit } from './audit';
import type { SpaceChannelResult, SpaceChannelsResult } from './types';
import {
  ancestorForceFlags,
  channelCategoryIdHex,
  isInheritEnabled,
  resolveParentAcl,
  resolveParentCipher,
} from './settings-inherit';
import type { SpaceChannelCategoryDocument } from '../../models/space-channel-category';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export interface CreateSpaceChannelParams {
  name?: string;
  type: SpaceChannelType;
  allowedRoleIds?: readonly string[];
  categoryId?: string;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
}

export interface UpdateSpaceChannelParams {
  name?: string;
  allowedRoleIds?: readonly string[];
  categoryId?: string | null;
  position?: number;
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
}

/**
 * Resolve whether a new/updated channel should store a `cipherCheck`.
 * Preference: explicit params → category default → Space (when e2ee / encrypt).
 */
export function resolveChannelCipherCheck(
  space: Pick<SpaceDocument, 'e2ee' | 'cipherCheck'>,
  params: { encrypt?: boolean; cipherCheck?: CipherCheck },
  category?: { cipherCheck?: CipherCheck } | null,
): CipherCheck | undefined {
  if (params.encrypt === false) return undefined;
  if (params.cipherCheck) return toPublicCipherCheck(params.cipherCheck);
  const inheritByDefault =
    params.encrypt === true ||
    (params.encrypt === undefined && (!!space.e2ee || !!category?.cipherCheck));
  if (!inheritByDefault) return undefined;
  if (category?.cipherCheck) return toPublicCipherCheck(category.cipherCheck);
  if (space.cipherCheck) return toPublicCipherCheck(space.cipherCheck);
  return undefined;
}

async function requireChannelMember(
  spaceId: ObjectId,
  actingId: ObjectId,
): Promise<
  | { ok: true; space: SpaceDocument; perms: SpaceMemberPermissions }
  | { ok: false; result: SpaceChannelResult }
> {
  const space = await getSpaceRepository().findById(spaceId);
  if (!space) {
    return {
      ok: false,
      result: { success: false, error: 'Space not found.', errorCode: 'SPACE_NOT_FOUND' },
    };
  }

  const perms = await resolveMemberPermissions(spaceId, actingId);
  if (!perms.isMember) {
    return {
      ok: false,
      result: {
        success: false,
        error: 'You are not a member of this Space.',
        errorCode: 'NOT_MEMBER',
      },
    };
  }
  return { ok: true, space, perms };
}

function forbidUnless(
  perms: SpaceMemberPermissions,
  permission: 'manageChannels' | 'manageEncryption',
  message: string,
): SpaceChannelResult | null {
  if (memberHasPermission(perms, permission)) return null;
  return { success: false, error: message, errorCode: 'FORBIDDEN' };
}

async function resolveAllowedRoleIds(
  spaceId: ObjectId,
  perms: SpaceMemberPermissions,
  allowedRoleIds: readonly string[] | undefined,
): Promise<{ ok: true; allowedRoleIds: ObjectId[] } | { ok: false; result: SpaceChannelResult }> {
  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (!everyone) {
    return {
      ok: false,
      result: { success: false, error: 'Everyone role not found.', errorCode: 'ROLE_NOT_FOUND' },
    };
  }

  const top = actorTopRolePosition(perms.roleIds, roles);
  if (top === null) {
    return {
      ok: false,
      result: { success: false, error: 'You have no roles in this Space.', errorCode: 'FORBIDDEN' },
    };
  }
  const selectable = new Set(
    rolesAtOrBelowHierarchy(roles, top).map((r: SpaceRoleDocument) => r._id.toHexString()),
  );

  if (!allowedRoleIds?.length) {
    return { ok: true, allowedRoleIds: [everyone._id] };
  }

  const seen = new Set<string>();
  const resolved: ObjectId[] = [];
  for (const raw of allowedRoleIds) {
    const id = parseObjId(raw);
    if (!id) {
      return {
        ok: false,
        result: { success: false, error: 'Invalid role id.', errorCode: 'INVALID_ID' },
      };
    }
    const hex = id.toHexString();
    if (seen.has(hex)) continue;
    if (!selectable.has(hex)) {
      return {
        ok: false,
        result: {
          success: false,
          error: 'You cannot restrict a channel to a role above your own.',
          errorCode: 'ESCALATION',
        },
      };
    }
    seen.add(hex);
    resolved.push(id);
  }
  return {
    ok: true,
    allowedRoleIds: resolved.length > 0 ? resolved : [everyone._id],
  };
}

/**
 * List a Space's channels (ordered by position). Visibility-gated read + role ACL.
 */
export async function listSpaceChannels(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceChannelsResult> {
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

  const [channels, perms, roles] = await Promise.all([
    getSpaceChannelRepository().findBySpace(spaceId),
    resolveMemberPermissions(spaceId, requesterId),
    getSpaceRoleRepository().findBySpace(spaceId),
  ]);
  const everyoneId = findEveryoneRole(roles)?._id ?? null;
  const visible = channels.filter((ch) => canViewSpaceChannel(ch, perms, everyoneId));
  return { success: true, channels: visible.map(toPublicSpaceChannel) };
}

/**
 * Create a text channel. Requires membership + `manageChannels`.
 * Setting encryption also requires `manageEncryption`.
 * Empty/omitted `allowedRoleIds` defaults to the Everyone role.
 * When the Space is e2ee, the channel inherits the Space `cipherCheck` unless
 * `encrypt: false` (or an explicit `cipherCheck` is provided).
 */
export async function createSpaceChannel(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: CreateSpaceChannelParams,
): Promise<SpaceChannelResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireChannelMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const channelsDenied = forbidUnless(
    perms,
    'manageChannels',
    'You do not have permission to manage channels.',
  );
  if (channelsDenied) return channelsDenied;

  const touchesEncryption = params.encrypt !== undefined || params.cipherCheck !== undefined;
  if (touchesEncryption) {
    const encryptionDenied = forbidUnless(
      perms,
      'manageEncryption',
      'You do not have permission to manage encryption.',
    );
    if (encryptionDenied) return encryptionDenied;
  }

  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const plainName = params.name?.trim() ?? '';
  if (e2ee && !hasEncrypted) {
    return {
      success: false,
      error: 'Encrypted channel name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (!e2ee && !plainName) {
    return { success: false, error: 'Channel name is required.', errorCode: 'INVALID_CONTENT' };
  }

  let categoryObjectId: ObjectId | null = null;
  let parentCategory: SpaceChannelCategoryDocument | null = null;
  const allCategories = await getSpaceChannelCategoryRepository().findBySpace(spaceId);
  const categoriesById = new Map(allCategories.map((c) => [c._id.toHexString(), c]));

  if (params.categoryId) {
    const categoryId = parseObjId(params.categoryId);
    if (!categoryId) {
      return { success: false, error: 'Invalid category id.', errorCode: 'INVALID_ID' };
    }
    let category = categoriesById.get(categoryId.toHexString()) ?? null;
    if (!category) {
      category = await getSpaceChannelCategoryRepository().findByIdInSpace(spaceId, categoryId);
      if (category) categoriesById.set(categoryId.toHexString(), category);
    }
    if (!category) {
      return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
    }
    categoryObjectId = categoryId;
    parentCategory = category;
  }

  const force = ancestorForceFlags(
    categoryObjectId?.toHexString() ?? null,
    categoriesById,
  );
  // Default inherit on; explicit ACL/cipher fields imply an override unless the
  // client also sends inherit*: true.
  let inheritAcl =
    params.inheritAllowedRoleIds ?? params.allowedRoleIds === undefined;
  let inheritCipher =
    params.inheritCipherCheck ??
    (params.encrypt === undefined && params.cipherCheck === undefined);
  if (force.forceAcl) inheritAcl = true;
  if (force.forceCipher) inheritCipher = true;

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (!everyone) {
    return { success: false, error: 'Everyone role missing.', errorCode: 'INVALID_CONTENT' };
  }

  let roleIdsInput: readonly string[] | undefined = params.allowedRoleIds;
  if (inheritAcl) {
    roleIdsInput = resolveParentAcl(parentCategory, everyone._id).map((id) => id.toHexString());
  }

  const rolesResult = await resolveAllowedRoleIds(spaceId, perms, roleIdsInput);
  if (!rolesResult.ok) return rolesResult.result;

  let cipherCheck: CipherCheck | undefined;
  if (inheritCipher) {
    cipherCheck = resolveParentCipher(space, parentCategory);
  } else {
    cipherCheck = resolveChannelCipherCheck(space, params, parentCategory);
  }
  if (params.encrypt === true && !cipherCheck) {
    return {
      success: false,
      error: 'cipherCheck is required when encrypt is enabled.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const existing = await getSpaceChannelRepository().findBySpace(spaceId);
  const inBucket = existing.filter((ch) => {
    const chCat = ch.categoryId?.toHexString() ?? null;
    const target = categoryObjectId?.toHexString() ?? null;
    return chCat === target;
  });
  const maxPosition = inBucket.reduce((max, ch) => Math.max(max, ch.position ?? 0), -1);

  const channelType: SpaceChannelType = SPACE_CHANNEL_TYPES.includes(params.type)
    ? params.type
    : 'text';

  const channel = await getSpaceChannelRepository().createChannel({
    spaceId,
    type: channelType,
    name: e2ee ? '' : plainName,
    position: maxPosition + 1,
    allowedRoleIds: rolesResult.allowedRoleIds,
    inheritAllowedRoleIds: inheritAcl,
    inheritCipherCheck: inheritCipher,
    ...(categoryObjectId ? { categoryId: categoryObjectId } : {}),
    ...(hasEncrypted
      ? {
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
    ...(cipherCheck ? { cipherCheck } : {}),
  });

  const publicChannel = toPublicSpaceChannel(channel);
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_channel_created',
      data: { channel: publicChannel },
    },
    { audienceIdentityIds: await resolveChannelAudience(spaceId, channel) },
  );

  return { success: true, channel: publicChannel };
}

/**
 * Update a text channel (name, role ACL, encryption).
 * Name/ACL require `manageChannels`; encryption requires `manageEncryption`.
 */
export async function updateSpaceChannel(
  spaceIdRaw: string | ObjectId,
  channelIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: UpdateSpaceChannelParams,
): Promise<SpaceChannelResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const channelId = parseObjId(channelIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !channelId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireChannelMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const existing = await getSpaceChannelRepository().findByIdInSpace(spaceId, channelId);
  if (!existing) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const touchesStructure =
    params.name !== undefined ||
    params.allowedRoleIds !== undefined ||
    params.categoryId !== undefined ||
    params.position !== undefined ||
    params.encryptedName !== undefined ||
    params.nameNonce !== undefined ||
    params.cipherId !== undefined ||
    params.inheritAllowedRoleIds !== undefined;
  const touchesEncryption =
    params.encrypt !== undefined ||
    params.cipherCheck !== undefined ||
    params.inheritCipherCheck !== undefined;

  if (!touchesStructure && !touchesEncryption) {
    return { success: false, error: 'At least one field is required.', errorCode: 'INVALID_CONTENT' };
  }
  if (touchesStructure) {
    const denied = forbidUnless(
      perms,
      'manageChannels',
      'You do not have permission to manage channels.',
    );
    if (denied) return denied;
  }
  if (touchesEncryption) {
    const denied = forbidUnless(
      perms,
      'manageEncryption',
      'You do not have permission to manage encryption.',
    );
    if (denied) return denied;
  }

  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const hasPartialEncrypted =
    !!(params.encryptedName || params.nameNonce || params.cipherId) && !hasEncrypted;
  if (hasPartialEncrypted) {
    return {
      success: false,
      error: 'encryptedName, nameNonce, and cipherId must be provided together.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (params.name !== undefined && e2ee) {
    return {
      success: false,
      error: 'Encrypted channel name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (hasEncrypted && !e2ee) {
    return {
      success: false,
      error: 'Encrypted channel names require an e2ee Space.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (params.name !== undefined && !params.name.trim()) {
    return { success: false, error: 'Channel name is required.', errorCode: 'INVALID_CONTENT' };
  }

  const allCategories = await getSpaceChannelCategoryRepository().findBySpace(spaceId);
  const categoriesById = new Map(allCategories.map((c) => [c._id.toHexString(), c]));

  let categoryId: ObjectId | null | undefined;
  let clearCategoryId = false;
  let effectiveCategoryIdHex = channelCategoryIdHex(existing);
  if (params.categoryId !== undefined) {
    if (params.categoryId === null) {
      clearCategoryId = true;
      categoryId = null;
      effectiveCategoryIdHex = null;
    } else {
      const parsed = parseObjId(params.categoryId);
      if (!parsed) {
        return { success: false, error: 'Invalid category id.', errorCode: 'INVALID_ID' };
      }
      if (!categoriesById.has(parsed.toHexString())) {
        return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
      }
      categoryId = parsed;
      effectiveCategoryIdHex = parsed.toHexString();
    }
  }

  const force = ancestorForceFlags(effectiveCategoryIdHex, categoriesById);
  let inheritAcl =
    params.inheritAllowedRoleIds !== undefined
      ? params.inheritAllowedRoleIds
      : isInheritEnabled(existing.inheritAllowedRoleIds);
  let inheritCipher =
    params.inheritCipherCheck !== undefined
      ? params.inheritCipherCheck
      : isInheritEnabled(existing.inheritCipherCheck);

  if (force.forceAcl) {
    if (params.inheritAllowedRoleIds === false) {
      return {
        success: false,
        error: 'Roles are forced by a parent category and cannot be overridden.',
        errorCode: 'FORBIDDEN',
      };
    }
    inheritAcl = true;
  }
  if (force.forceCipher) {
    if (params.inheritCipherCheck === false) {
      return {
        success: false,
        error: 'Encryption is forced by a parent category and cannot be overridden.',
        errorCode: 'FORBIDDEN',
      };
    }
    inheritCipher = true;
  }

  if (force.forceAcl && params.allowedRoleIds !== undefined && params.inheritAllowedRoleIds !== true) {
    return {
      success: false,
      error: 'Roles are forced by a parent category and cannot be overridden.',
      errorCode: 'FORBIDDEN',
    };
  }

  const roles = await getSpaceRoleRepository().findBySpace(spaceId);
  const everyone = findEveryoneRole(roles);
  if (!everyone) {
    return { success: false, error: 'Everyone role missing.', errorCode: 'INVALID_CONTENT' };
  }
  const parentCategory = effectiveCategoryIdHex
    ? (categoriesById.get(effectiveCategoryIdHex) ?? null)
    : null;

  const refreshAcl =
    inheritAcl &&
    (params.inheritAllowedRoleIds === true ||
      params.categoryId !== undefined ||
      force.forceAcl);
  const refreshCipher =
    inheritCipher &&
    (params.inheritCipherCheck === true ||
      params.categoryId !== undefined ||
      force.forceCipher ||
      params.encrypt !== undefined ||
      params.cipherCheck !== undefined);

  let allowedRoleIds: ObjectId[] | undefined;
  if (refreshAcl) {
    allowedRoleIds = resolveParentAcl(parentCategory, everyone._id);
  } else if (!inheritAcl && params.allowedRoleIds !== undefined) {
    const rolesResult = await resolveAllowedRoleIds(spaceId, perms, params.allowedRoleIds);
    if (!rolesResult.ok) return rolesResult.result;
    allowedRoleIds = rolesResult.allowedRoleIds;
  }

  let cipherCheck: CipherCheck | undefined;
  let clearCipherCheck = false;
  if (refreshCipher) {
    cipherCheck = resolveParentCipher(space, parentCategory);
    if (!cipherCheck) clearCipherCheck = true;
  } else if (!inheritCipher && (params.encrypt !== undefined || params.cipherCheck !== undefined)) {
    if (params.encrypt === false) {
      clearCipherCheck = true;
    } else {
      cipherCheck = resolveChannelCipherCheck(
        space,
        { encrypt: params.encrypt ?? true, cipherCheck: params.cipherCheck },
        parentCategory,
      );
      if (!cipherCheck) {
        return {
          success: false,
          error: 'cipherCheck is required when encrypt is enabled.',
          errorCode: 'INVALID_CONTENT',
        };
      }
    }
  }

  const updated = await getSpaceChannelRepository().updateChannel(spaceId, channelId, {
    ...(params.name !== undefined ? { name: params.name.trim() } : {}),
    ...(hasEncrypted
      ? {
          name: '',
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
    ...(allowedRoleIds !== undefined ? { allowedRoleIds } : {}),
    ...(clearCategoryId ? { clearCategoryId: true } : {}),
    ...(categoryId !== undefined && !clearCategoryId ? { categoryId } : {}),
    ...(params.position !== undefined ? { position: params.position } : {}),
    ...(clearCipherCheck ? { clearCipherCheck: true } : {}),
    ...(cipherCheck ? { cipherCheck } : {}),
    ...(params.inheritAllowedRoleIds !== undefined || force.forceAcl
      ? { inheritAllowedRoleIds: inheritAcl }
      : {}),
    ...(params.inheritCipherCheck !== undefined || force.forceCipher
      ? { inheritCipherCheck: inheritCipher }
      : {}),
  });

  if (!updated) {
    return { success: false, error: 'Channel not found.', errorCode: 'CHANNEL_NOT_FOUND' };
  }

  const publicChannel = toPublicSpaceChannel(updated);
  // Deliver to the union of the old and new audiences so members who just lost
  // access still learn the channel changed (and can drop it locally).
  const [oldAudience, newAudience] = await Promise.all([
    resolveChannelAudience(spaceId, existing),
    resolveChannelAudience(spaceId, updated),
  ]);
  const audienceIdentityIds =
    oldAudience === null || newAudience === null
      ? null
      : [...new Set([...oldAudience, ...newAudience])];
  await publishSpaceEvent(
    spaceId.toHexString(),
    {
      type: 'space_channel_updated',
      data: { channel: publicChannel },
    },
    { audienceIdentityIds },
  );

  if (allowedRoleIds !== undefined) {
    void recordSpaceAudit({
      spaceId,
      actorIdentityId: actingId,
      action: 'channel_acl_update',
      targetId: channelId,
      channelId,
      metadata: {
        allowedRoleIds: allowedRoleIds.map((id) => id.toHexString()),
      },
    });
  }

  return { success: true, channel: publicChannel };
}
