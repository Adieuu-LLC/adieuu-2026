/**
 * Shared parameter shapes, gates, and validators for Space channel-category
 * services (`category-crud.ts` list/create/update/delete and
 * `category-layout.ts` reorder).
 *
 * @module services/space/category-shared
 */

import { ObjectId } from 'mongodb';
import { SPACE_CATEGORY_MAX_DEPTH, type CipherCheck } from '@adieuu/shared';
import { getSpaceRepository } from '../../repositories/space.repository';
import { getSpaceRoleRepository } from '../../repositories/space-role.repository';
import { isValidObjectId } from '../../utils';
import type { SpaceChannelCategoryDocument } from '../../models/space-channel-category';
import { toPublicCipherCheck } from '../../models/cipher-check';
import type { SpaceDocument } from '../../models/space';
import type { SpaceRoleDocument } from '../../models/space-role';
import {
  resolveMemberPermissions,
  memberHasPermission,
  type SpaceMemberPermissions,
} from './permissions';
import {
  actorTopRolePosition,
  findEveryoneRole,
  rolesAtOrBelowHierarchy,
} from './channel-access';
import type { SpaceCategoryResult } from './types';

export function parseObjId(raw: string | ObjectId): ObjectId | null {
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
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
  forceChildrenAcl?: boolean;
  forceChildrenCipher?: boolean;
}

export interface UpdateSpaceChannelCategoryParams {
  name?: string;
  allowedRoleIds?: readonly string[];
  encryptedName?: string;
  nameNonce?: string;
  cipherId?: string;
  position?: number;
  parentCategoryId?: string | null;
  encrypt?: boolean;
  cipherCheck?: CipherCheck;
  inheritAllowedRoleIds?: boolean;
  inheritCipherCheck?: boolean;
  forceChildrenAcl?: boolean;
  forceChildrenCipher?: boolean;
}

export interface UpdateSpaceChannelLayoutParams {
  groups: ReadonlyArray<{
    parentCategoryId: string | null;
    items: ReadonlyArray<{ type: 'channel' | 'category'; id: string }>;
  }>;
}

/**
 * Default content Cipher for a category: explicit → parent category → Space e2ee.
 */
export function resolveCategoryCipherCheck(
  space: Pick<SpaceDocument, 'e2ee' | 'cipherCheck'>,
  params: { encrypt?: boolean; cipherCheck?: CipherCheck },
  parentCategory?: { cipherCheck?: CipherCheck } | null,
): CipherCheck | undefined {
  if (params.encrypt === false) return undefined;
  if (params.cipherCheck) return toPublicCipherCheck(params.cipherCheck);
  const inheritByDefault =
    params.encrypt === true ||
    (params.encrypt === undefined && (!!space.e2ee || !!parentCategory?.cipherCheck));
  if (!inheritByDefault) return undefined;
  if (parentCategory?.cipherCheck) return toPublicCipherCheck(parentCategory.cipherCheck);
  if (space.cipherCheck) return toPublicCipherCheck(space.cipherCheck);
  return undefined;
}

export function parentIdHex(doc: SpaceChannelCategoryDocument): string | null {
  return doc.parentCategoryId ? doc.parentCategoryId.toHexString() : null;
}

/** Depth of a category (root = 1). Returns null on cycle / missing parent. */
export function categoryDepth(
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

export async function requireCategoryMember(
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

export function forbidUnlessManage(
  perms: SpaceMemberPermissions,
): SpaceCategoryResult | null {
  if (memberHasPermission(perms, 'manageChannels')) return null;
  return {
    success: false,
    error: 'You do not have permission to manage channels.',
    errorCode: 'FORBIDDEN',
  };
}

export function forbidUnlessEncryption(
  perms: SpaceMemberPermissions,
): SpaceCategoryResult | null {
  if (memberHasPermission(perms, 'manageEncryption')) return null;
  return {
    success: false,
    error: 'You do not have permission to manage encryption.',
    errorCode: 'FORBIDDEN',
  };
}

export async function resolveAllowedRoleIds(
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

export function validateCategoryName(
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
