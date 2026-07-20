/**
 * Space channel category list + create/update/delete + layout reorder.
 *
 * @module services/space/category-crud
 */

import { ObjectId } from 'mongodb';
import { SPACE_CATEGORY_MAX_DEPTH } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceChannelCategoryRepository } from '../../repositories/space-channel-category.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { isValidObjectId } from '../../utils';
import { toPublicSpaceChannel } from '../../models/space-channel';
import {
  toPublicSpaceChannelCategory,
  type SpaceChannelCategoryDocument,
} from '../../models/space-channel-category';
import type { SpaceDocument } from '../../models/space';
import type { SpaceRoleDocument } from '../../models/space-role';
import {
  resolveMemberPermissions,
  memberHasPermission,
  type SpaceMemberPermissions,
} from './permissions';
import {
  actorTopRolePosition,
  canViewSpaceChannel,
  findEveryoneRole,
  rolesAtOrBelowHierarchy,
} from './channel-access';
import { canReadSpace } from './access';
import { publishSpaceEvent } from './redis-events';
import type {
  SpaceActionResult,
  SpaceCategoriesResult,
  SpaceCategoryResult,
  SpaceChannelLayoutResult,
} from './types';

function parseObjId(raw: string | ObjectId): ObjectId | null {
  if (raw instanceof ObjectId) return raw;
  return isValidObjectId(raw) ? new ObjectId(raw) : null;
}

export interface CreateSpaceChannelCategoryParams {
  name?: string;
  allowedRoleIds?: readonly string[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  parentCategoryId?: string | null;
}

export interface UpdateSpaceChannelCategoryParams {
  name?: string;
  allowedRoleIds?: readonly string[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  position?: number;
  parentCategoryId?: string | null;
}

export interface UpdateSpaceChannelLayoutParams {
  groups: ReadonlyArray<{
    parentCategoryId: string | null;
    items: ReadonlyArray<{ type: 'channel' | 'category'; id: string }>;
  }>;
}

function parentIdHex(doc: SpaceChannelCategoryDocument): string | null {
  return doc.parentCategoryId ? doc.parentCategoryId.toHexString() : null;
}

/** Depth of a category (root = 1). Returns null on cycle / missing parent. */
function categoryDepth(
  categoryId: string,
  parentById: ReadonlyMap<string, string | null>,
): number | null {
  let depth = 1;
  let current: string | null = categoryId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return null;
    seen.add(current);
    const parent = parentById.get(current);
    if (parent === undefined) return null;
    if (parent === null) return depth;
    depth += 1;
    if (depth > SPACE_CATEGORY_MAX_DEPTH) return depth;
    current = parent;
  }
  return depth;
}

async function requireCategoryMember(
  spaceId: ObjectId,
  actingId: ObjectId,
): Promise<
  | { ok: true; space: SpaceDocument; perms: SpaceMemberPermissions }
  | { ok: false; result: SpaceCategoryResult }
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

function forbidUnlessManage(
  perms: SpaceMemberPermissions,
): SpaceCategoryResult | null {
  if (memberHasPermission(perms, 'manageChannels')) return null;
  return {
    success: false,
    error: 'You do not have permission to manage channels.',
    errorCode: 'FORBIDDEN',
  };
}

async function resolveAllowedRoleIds(
  spaceId: ObjectId,
  perms: SpaceMemberPermissions,
  allowedRoleIds: readonly string[] | undefined,
): Promise<{ ok: true; allowedRoleIds: ObjectId[] } | { ok: false; result: SpaceCategoryResult }> {
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
          error: 'You cannot restrict a category to a role above your own.',
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

function validateCategoryName(
  space: Pick<SpaceDocument, 'e2ee'>,
  params: {
    name?: string;
    encryptedName?: string;
    nameNonce?: string;
    cipherId?: string;
  },
  opts: { requireName: boolean },
): SpaceCategoryResult | null {
  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const hasPartial =
    !!(params.encryptedName || params.nameNonce || params.cipherId) && !hasEncrypted;
  if (hasPartial) {
    return {
      success: false,
      error: 'encryptedName, nameNonce, and cipherId must be provided together.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (opts.requireName) {
    const plainName = params.name?.trim() ?? '';
    if (e2ee && !hasEncrypted) {
      return {
        success: false,
        error: 'Encrypted category name is required.',
        errorCode: 'INVALID_CONTENT',
      };
    }
    if (!e2ee && !plainName) {
      return { success: false, error: 'Category name is required.', errorCode: 'INVALID_CONTENT' };
    }
  }
  if (params.name !== undefined && e2ee && !hasEncrypted) {
    return {
      success: false,
      error: 'Encrypted category name is required.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (hasEncrypted && !e2ee) {
    return {
      success: false,
      error: 'Encrypted category names require an e2ee Space.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (params.name !== undefined && !params.name.trim()) {
    return { success: false, error: 'Category name is required.', errorCode: 'INVALID_CONTENT' };
  }
  return null;
}

/** List a Space's channel categories (ordered by position). Visibility-gated. */
export async function listSpaceChannelCategories(
  spaceIdRaw: string | ObjectId,
  requesterIdentityIdRaw: string | ObjectId,
): Promise<SpaceCategoriesResult> {
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

  const [categories, perms, roles] = await Promise.all([
    getSpaceChannelCategoryRepository().findBySpace(spaceId),
    resolveMemberPermissions(spaceId, requesterId),
    getSpaceRoleRepository().findBySpace(spaceId),
  ]);
  const everyoneId = findEveryoneRole(roles)?._id ?? null;
  const visible = categories.filter((cat) => canViewSpaceChannel(cat, perms, everyoneId));
  return { success: true, categories: visible.map(toPublicSpaceChannelCategory) };
}

/** Create a channel category. Requires membership + `manageChannels`. */
export async function createSpaceChannelCategory(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: CreateSpaceChannelCategoryParams,
): Promise<SpaceCategoryResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireCategoryMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const denied = forbidUnlessManage(perms);
  if (denied) return denied;

  const nameErr = validateCategoryName(space, params, { requireName: true });
  if (nameErr) return nameErr;

  const rolesResult = await resolveAllowedRoleIds(spaceId, perms, params.allowedRoleIds);
  if (!rolesResult.ok) return rolesResult.result;

  const existing = await getSpaceChannelCategoryRepository().findBySpace(spaceId);
  let parentCategoryId: ObjectId | null = null;
  if (params.parentCategoryId) {
    const parentOid = parseObjId(params.parentCategoryId);
    if (!parentOid) {
      return { success: false, error: 'Invalid parent category id.', errorCode: 'INVALID_ID' };
    }
    const parent = existing.find((c) => c._id.equals(parentOid));
    if (!parent) {
      return { success: false, error: 'Parent category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
    }
    const parentById = new Map(
      existing.map((c) => [c._id.toHexString(), parentIdHex(c)] as const),
    );
    const parentDepth = categoryDepth(parentOid.toHexString(), parentById);
    if (parentDepth === null || parentDepth >= SPACE_CATEGORY_MAX_DEPTH) {
      return {
        success: false,
        error: `Categories cannot nest deeper than ${SPACE_CATEGORY_MAX_DEPTH} levels.`,
        errorCode: 'INVALID_CONTENT',
      };
    }
    parentCategoryId = parentOid;
  }

  const siblings = existing.filter((c) => {
    const p = parentIdHex(c);
    return parentCategoryId
      ? p === parentCategoryId.toHexString()
      : p === null;
  });
  const maxPosition = siblings.reduce((max, cat) => Math.max(max, cat.position ?? 0), -1);
  const e2ee = !!space.e2ee;
  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);
  const plainName = params.name?.trim() ?? '';

  const category = await getSpaceChannelCategoryRepository().createCategory({
    spaceId,
    name: e2ee ? '' : plainName,
    position: maxPosition + 1,
    allowedRoleIds: rolesResult.allowedRoleIds,
    ...(parentCategoryId ? { parentCategoryId } : {}),
    ...(hasEncrypted
      ? {
          encryptedName: params.encryptedName,
          nameNonce: params.nameNonce,
          cipherId: params.cipherId,
        }
      : {}),
  });

  const publicCategory = toPublicSpaceChannelCategory(category);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_category_created',
    data: { category: publicCategory },
  });

  return { success: true, category: publicCategory };
}

/** Update a channel category (name, ACL, position). Requires `manageChannels`. */
export async function updateSpaceChannelCategory(
  spaceIdRaw: string | ObjectId,
  categoryIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: UpdateSpaceChannelCategoryParams,
): Promise<SpaceCategoryResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const categoryId = parseObjId(categoryIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !categoryId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireCategoryMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { space, perms } = gate;

  const denied = forbidUnlessManage(perms);
  if (denied) return denied;

  const existing = await getSpaceChannelCategoryRepository().findByIdInSpace(spaceId, categoryId);
  if (!existing) {
    return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
  }

  if (
    params.name === undefined &&
    params.allowedRoleIds === undefined &&
    params.encryptedName === undefined &&
    params.nameNonce === undefined &&
    params.cipherId === undefined &&
    params.position === undefined &&
    params.parentCategoryId === undefined
  ) {
    return { success: false, error: 'At least one field is required.', errorCode: 'INVALID_CONTENT' };
  }

  const nameErr = validateCategoryName(space, params, { requireName: false });
  if (nameErr) return nameErr;

  let allowedRoleIds: ObjectId[] | undefined;
  if (params.allowedRoleIds !== undefined) {
    const rolesResult = await resolveAllowedRoleIds(spaceId, perms, params.allowedRoleIds);
    if (!rolesResult.ok) return rolesResult.result;
    allowedRoleIds = rolesResult.allowedRoleIds;
  }

  let parentCategoryId: ObjectId | null | undefined;
  if (params.parentCategoryId !== undefined) {
    if (params.parentCategoryId === null) {
      parentCategoryId = null;
    } else {
      const parentOid = parseObjId(params.parentCategoryId);
      if (!parentOid) {
        return { success: false, error: 'Invalid parent category id.', errorCode: 'INVALID_ID' };
      }
      if (parentOid.equals(categoryId)) {
        return {
          success: false,
          error: 'A category cannot be its own parent.',
          errorCode: 'INVALID_CONTENT',
        };
      }
      const all = await getSpaceChannelCategoryRepository().findBySpace(spaceId);
      const parent = all.find((c) => c._id.equals(parentOid));
      if (!parent) {
        return {
          success: false,
          error: 'Parent category not found.',
          errorCode: 'CATEGORY_NOT_FOUND',
        };
      }
      const parentById = new Map(
        all.map((c) => {
          const id = c._id.toHexString();
          if (id === categoryId.toHexString()) {
            return [id, parentOid.toHexString()] as const;
          }
          return [id, parentIdHex(c)] as const;
        }),
      );
      // Reject nesting into a descendant (cycle).
      let walk: string | null = parentOid.toHexString();
      const seen = new Set<string>();
      while (walk) {
        if (walk === categoryId.toHexString()) {
          return {
            success: false,
            error: 'Cannot nest a category under its descendant.',
            errorCode: 'INVALID_CONTENT',
          };
        }
        if (seen.has(walk)) break;
        seen.add(walk);
        walk = parentById.get(walk) ?? null;
      }
      const depth = categoryDepth(categoryId.toHexString(), parentById);
      if (depth === null || depth > SPACE_CATEGORY_MAX_DEPTH) {
        return {
          success: false,
          error: `Categories cannot nest deeper than ${SPACE_CATEGORY_MAX_DEPTH} levels.`,
          errorCode: 'INVALID_CONTENT',
        };
      }
      parentCategoryId = parentOid;
    }
  }

  const hasEncrypted = !!(params.encryptedName && params.nameNonce && params.cipherId);

  const updated = await getSpaceChannelCategoryRepository().updateCategory(spaceId, categoryId, {
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
    ...(params.position !== undefined ? { position: params.position } : {}),
    ...(parentCategoryId !== undefined ? { parentCategoryId } : {}),
  });

  if (!updated) {
    return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
  }

  const publicCategory = toPublicSpaceChannelCategory(updated);
  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_category_updated',
    data: { category: publicCategory },
  });

  return { success: true, category: publicCategory };
}

/**
 * Delete a category. Direct child channels and nested categories are promoted
 * to this category's parent (or root). Requires `manageChannels`.
 */
export async function deleteSpaceChannelCategory(
  spaceIdRaw: string | ObjectId,
  categoryIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
): Promise<SpaceActionResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const categoryId = parseObjId(categoryIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !categoryId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireCategoryMember(spaceId, actingId);
  if (!gate.ok) return gate.result;
  const { perms } = gate;

  const denied = forbidUnlessManage(perms);
  if (denied) return denied;

  const existing = await getSpaceChannelCategoryRepository().findByIdInSpace(spaceId, categoryId);
  if (!existing) {
    return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
  }

  const promoteTo = existing.parentCategoryId ?? null;
  await getSpaceChannelRepository().reparentChannels(spaceId, categoryId, promoteTo);
  await getSpaceChannelCategoryRepository().reparentChildren(spaceId, categoryId, promoteTo);
  const deleted = await getSpaceChannelCategoryRepository().deleteCategory(spaceId, categoryId);
  if (!deleted) {
    return { success: false, error: 'Category not found.', errorCode: 'CATEGORY_NOT_FOUND' };
  }

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_category_deleted',
    data: { spaceId: spaceId.toHexString(), categoryId: categoryId.toHexString() },
  });

  return { success: true };
}

/**
 * Atomically reorder nested categories and interleaved channels.
 * Requires `manageChannels`. Payload must cover every category and channel.
 */
export async function updateSpaceChannelLayout(
  spaceIdRaw: string | ObjectId,
  actingIdentityIdRaw: string | ObjectId,
  params: UpdateSpaceChannelLayoutParams,
): Promise<SpaceChannelLayoutResult> {
  const spaceId = parseObjId(spaceIdRaw);
  const actingId = parseObjId(actingIdentityIdRaw);
  if (!spaceId || !actingId) {
    return { success: false, error: 'Invalid id.', errorCode: 'INVALID_ID' };
  }

  const gate = await requireCategoryMember(spaceId, actingId);
  if (!gate.ok) return { success: false, error: gate.result.error, errorCode: gate.result.errorCode };
  const { perms } = gate;

  const denied = forbidUnlessManage(perms);
  if (denied) return { success: false, error: denied.error, errorCode: denied.errorCode };

  const [categories, channels] = await Promise.all([
    getSpaceChannelCategoryRepository().findBySpace(spaceId),
    getSpaceChannelRepository().findBySpace(spaceId),
  ]);

  const categoryIdSet = new Set(categories.map((c) => c._id.toHexString()));
  const channelIdSet = new Set(channels.map((c) => c._id.toHexString()));

  if (params.groups.length !== categoryIdSet.size + 1) {
    return {
      success: false,
      error: 'groups must include the root group and exactly one group per category.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  const seenGroupParents = new Set<string | null>();
  const seenChannels = new Set<string>();
  const seenCategoriesAsItems = new Set<string>();
  const parentById = new Map<string, string | null>();
  const categoryEntries: Array<{
    categoryId: ObjectId;
    parentCategoryId: ObjectId | null;
    position: number;
  }> = [];
  const channelEntries: Array<{
    channelId: ObjectId;
    categoryId: ObjectId | null;
    position: number;
  }> = [];

  for (const group of params.groups) {
    const parentKey = group.parentCategoryId;
    if (seenGroupParents.has(parentKey)) {
      return {
        success: false,
        error: 'Duplicate parentCategoryId in groups.',
        errorCode: 'INVALID_CONTENT',
      };
    }
    seenGroupParents.add(parentKey);

    if (parentKey !== null) {
      if (!categoryIdSet.has(parentKey)) {
        return {
          success: false,
          error: 'Unknown parent category in groups.',
          errorCode: 'CATEGORY_NOT_FOUND',
        };
      }
    }

    let parentOid: ObjectId | null = null;
    if (parentKey !== null) {
      parentOid = new ObjectId(parentKey);
    }

    for (let position = 0; position < group.items.length; position++) {
      const item = group.items[position]!;
      if (item.type === 'channel') {
        if (!channelIdSet.has(item.id) || seenChannels.has(item.id)) {
          return {
            success: false,
            error: 'Invalid or duplicate channel in layout.',
            errorCode: 'INVALID_CONTENT',
          };
        }
        seenChannels.add(item.id);
        channelEntries.push({
          channelId: new ObjectId(item.id),
          categoryId: parentOid,
          position,
        });
      } else {
        if (!categoryIdSet.has(item.id) || seenCategoriesAsItems.has(item.id)) {
          return {
            success: false,
            error: 'Invalid or duplicate category in layout.',
            errorCode: 'INVALID_CONTENT',
          };
        }
        if (parentKey !== null && item.id === parentKey) {
          return {
            success: false,
            error: 'A category cannot be nested under itself.',
            errorCode: 'INVALID_CONTENT',
          };
        }
        seenCategoriesAsItems.add(item.id);
        parentById.set(item.id, parentKey);
        categoryEntries.push({
          categoryId: new ObjectId(item.id),
          parentCategoryId: parentOid,
          position,
        });
      }
    }
  }

  // Every category must appear as an item once and own a groups entry.
  if (seenCategoriesAsItems.size !== categoryIdSet.size) {
    return {
      success: false,
      error: 'Every category must appear exactly once in layout items.',
      errorCode: 'INVALID_CONTENT',
    };
  }
  for (const catId of categoryIdSet) {
    if (!seenGroupParents.has(catId)) {
      return {
        success: false,
        error: 'Every category must have a groups entry.',
        errorCode: 'INVALID_CONTENT',
      };
    }
  }
  if (!seenGroupParents.has(null)) {
    return {
      success: false,
      error: 'Layout must include a root group (parentCategoryId null).',
      errorCode: 'INVALID_CONTENT',
    };
  }
  if (seenChannels.size !== channelIdSet.size) {
    return {
      success: false,
      error: 'Every channel must appear exactly once in layout items.',
      errorCode: 'INVALID_CONTENT',
    };
  }

  for (const catId of categoryIdSet) {
    const depth = categoryDepth(catId, parentById);
    if (depth === null) {
      return {
        success: false,
        error: 'Category hierarchy contains a cycle.',
        errorCode: 'INVALID_CONTENT',
      };
    }
    if (depth > SPACE_CATEGORY_MAX_DEPTH) {
      return {
        success: false,
        error: `Categories cannot nest deeper than ${SPACE_CATEGORY_MAX_DEPTH} levels.`,
        errorCode: 'INVALID_CONTENT',
      };
    }
  }

  await getSpaceChannelCategoryRepository().setLayout(spaceId, categoryEntries);
  await getSpaceChannelRepository().setLayout(spaceId, channelEntries);

  const [updatedCategories, updatedChannels] = await Promise.all([
    getSpaceChannelCategoryRepository().findBySpace(spaceId),
    getSpaceChannelRepository().findBySpace(spaceId),
  ]);

  const publicCategories = updatedCategories.map(toPublicSpaceChannelCategory);
  const publicChannels = updatedChannels.map(toPublicSpaceChannel);

  await publishSpaceEvent(spaceId.toHexString(), {
    type: 'space_channel_layout_updated',
    data: {
      spaceId: spaceId.toHexString(),
      categories: publicCategories,
      channels: publicChannels,
    },
  });

  return { success: true, categories: publicCategories, channels: publicChannels };
}
