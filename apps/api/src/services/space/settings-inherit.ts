/**
 * Parent ACL / cipher resolution and subtree cascade for Space categories.
 *
 * Inherit flags missing on legacy docs are treated as false.
 * New entities default both inherit flags to true at create time.
 *
 * @module services/space/settings-inherit
 */

import { ObjectId } from 'mongodb';
import type { CipherCheck } from '@adieuu/shared';
import { toPublicCipherCheck } from '../../models/cipher-check';
import type { SpaceDocument } from '../../models/space';
import {
  toPublicSpaceChannel,
  type SpaceChannelDocument,
  type UpdateSpaceChannelFields,
} from '../../models/space-channel';
import {
  toPublicSpaceChannelCategory,
  type SpaceChannelCategoryDocument,
  type UpdateSpaceChannelCategoryFields,
} from '../../models/space-channel-category';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceChannelCategoryRepository } from '../../repositories/space-channel-category.repository';
import { publishSpaceEvent } from './redis-events';

export function isInheritEnabled(flag: boolean | undefined): boolean {
  return !!flag;
}

export function parentCategoryIdHex(
  doc: Pick<SpaceChannelCategoryDocument, 'parentCategoryId'>,
): string | null {
  return doc.parentCategoryId ? doc.parentCategoryId.toHexString() : null;
}

export function channelCategoryIdHex(
  doc: Pick<SpaceChannelDocument, 'categoryId'>,
): string | null {
  return doc.categoryId ? doc.categoryId.toHexString() : null;
}

/** ACL from immediate parent category, or Everyone when at Space root. */
export function resolveParentAcl(
  parentCategory: Pick<SpaceChannelCategoryDocument, 'allowedRoleIds'> | null | undefined,
  everyoneRoleId: ObjectId,
): ObjectId[] {
  if (parentCategory?.allowedRoleIds?.length) {
    return [...parentCategory.allowedRoleIds];
  }
  return [everyoneRoleId];
}

/**
 * Cipher from immediate parent category when present.
 * At Space root (no parent category): Space cipher when e2ee, else none.
 */
export function resolveParentCipher(
  space: Pick<SpaceDocument, 'e2ee' | 'cipherCheck'>,
  parentCategory: Pick<SpaceChannelCategoryDocument, 'cipherCheck'> | null | undefined,
): CipherCheck | undefined {
  if (parentCategory) {
    return parentCategory.cipherCheck
      ? toPublicCipherCheck(parentCategory.cipherCheck)
      : undefined;
  }
  if (space.e2ee && space.cipherCheck) {
    return toPublicCipherCheck(space.cipherCheck);
  }
  return undefined;
}

export interface AncestorForceResult {
  forceAcl: boolean;
  forceCipher: boolean;
  /** Category id that forces ACL (nearest ancestor with the flag). */
  forceAclByCategoryId: string | null;
  forceCipherByCategoryId: string | null;
}

/**
 * Walk parent chain from `startCategoryId` (inclusive) looking for force flags.
 */
export function ancestorForceFlags(
  startCategoryId: string | null,
  categoriesById: Map<string, SpaceChannelCategoryDocument>,
): AncestorForceResult {
  let forceAcl = false;
  let forceCipher = false;
  let forceAclByCategoryId: string | null = null;
  let forceCipherByCategoryId: string | null = null;

  let walk = startCategoryId;
  const seen = new Set<string>();
  while (walk && !seen.has(walk)) {
    seen.add(walk);
    const cat = categoriesById.get(walk);
    if (!cat) break;
    if (!forceAcl && cat.forceChildrenAcl) {
      forceAcl = true;
      forceAclByCategoryId = walk;
    }
    if (!forceCipher && cat.forceChildrenCipher) {
      forceCipher = true;
      forceCipherByCategoryId = walk;
    }
    if (forceAcl && forceCipher) break;
    walk = parentCategoryIdHex(cat);
  }

  return { forceAcl, forceCipher, forceAclByCategoryId, forceCipherByCategoryId };
}

function roleIdsEqual(a: ObjectId[] | undefined, b: ObjectId[]): boolean {
  const left = (a ?? []).map((id) => id.toHexString()).sort();
  const right = b.map((id) => id.toHexString()).sort();
  if (left.length !== right.length) return false;
  return left.every((id, i) => id === right[i]);
}

function cipherEqual(
  a: CipherCheck | undefined,
  b: CipherCheck | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.knownValue === b.knownValue && a.nonce === b.nonce;
}

function collectDescendantCategoryIds(
  rootId: string,
  categories: SpaceChannelCategoryDocument[],
): string[] {
  const childrenByParent = new Map<string | null, string[]>();
  for (const cat of categories) {
    const parent = parentCategoryIdHex(cat);
    const list = childrenByParent.get(parent) ?? [];
    list.push(cat._id.toHexString());
    childrenByParent.set(parent, list);
  }

  const ordered: string[] = [];
  const queue = [...(childrenByParent.get(rootId) ?? [])];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    for (const child of childrenByParent.get(id) ?? []) {
      queue.push(child);
    }
  }
  return ordered;
}

function applyInheritFields(
  current: {
    allowedRoleIds?: ObjectId[];
    cipherCheck?: CipherCheck;
    inheritAllowedRoleIds?: boolean;
    inheritCipherCheck?: boolean;
  },
  parentAcl: ObjectId[],
  parentCipher: CipherCheck | undefined,
  opts: {
    forceAcl: boolean;
    forceCipher: boolean;
    syncAcl: boolean;
    syncCipher: boolean;
  },
): {
  fields: UpdateSpaceChannelFields & UpdateSpaceChannelCategoryFields;
  next: {
    allowedRoleIds: ObjectId[];
    cipherCheck?: CipherCheck;
    inheritAllowedRoleIds: boolean;
    inheritCipherCheck: boolean;
  };
  changed: boolean;
} {
  const fields: UpdateSpaceChannelFields & UpdateSpaceChannelCategoryFields = {};
  let inheritAcl = isInheritEnabled(current.inheritAllowedRoleIds);
  let inheritCipher = isInheritEnabled(current.inheritCipherCheck);
  let allowedRoleIds = current.allowedRoleIds ?? [];
  let cipherCheck = current.cipherCheck;
  let changed = false;

  if (opts.forceAcl && !inheritAcl) {
    inheritAcl = true;
    fields.inheritAllowedRoleIds = true;
    changed = true;
  }
  if (opts.forceCipher && !inheritCipher) {
    inheritCipher = true;
    fields.inheritCipherCheck = true;
    changed = true;
  }

  if ((opts.syncAcl || opts.forceAcl) && inheritAcl) {
    if (!roleIdsEqual(allowedRoleIds, parentAcl)) {
      allowedRoleIds = parentAcl;
      fields.allowedRoleIds = parentAcl;
      changed = true;
    }
  }

  if ((opts.syncCipher || opts.forceCipher) && inheritCipher) {
    if (!cipherEqual(cipherCheck, parentCipher)) {
      cipherCheck = parentCipher;
      if (parentCipher) {
        fields.cipherCheck = parentCipher;
      } else {
        fields.clearCipherCheck = true;
      }
      changed = true;
    }
  }

  return {
    fields,
    next: {
      allowedRoleIds,
      cipherCheck,
      inheritAllowedRoleIds: inheritAcl,
      inheritCipherCheck: inheritCipher,
    },
    changed,
  };
}

/**
 * After a category ACL/cipher/force change, sync inheriting descendants
 * (and force-enable inherit when the category forces that aspect).
 */
export async function cascadeCategorySettings(
  spaceId: ObjectId,
  rootCategory: SpaceChannelCategoryDocument,
  space: Pick<SpaceDocument, 'e2ee' | 'cipherCheck'>,
  everyoneRoleId: ObjectId,
): Promise<void> {
  const categoryRepo = getSpaceChannelCategoryRepository();
  const channelRepo = getSpaceChannelRepository();
  const allCategories = await categoryRepo.findBySpace(spaceId);
  const allChannels = await channelRepo.findBySpace(spaceId);

  const catMap = new Map(allCategories.map((c) => [c._id.toHexString(), { ...c }]));
  catMap.set(rootCategory._id.toHexString(), { ...rootCategory });

  const rootId = rootCategory._id.toHexString();
  const forceAcl = !!rootCategory.forceChildrenAcl;
  const forceCipher = !!rootCategory.forceChildrenCipher;
  const descendantIds = collectDescendantCategoryIds(rootId, allCategories);
  const spaceIdHex = spaceId.toHexString();

  for (const catId of descendantIds) {
    const cat = catMap.get(catId);
    if (!cat) continue;
    const parentId = parentCategoryIdHex(cat);
    const parent = parentId ? catMap.get(parentId) : null;
    const parentAcl = resolveParentAcl(parent, everyoneRoleId);
    const parentCipher = resolveParentCipher(space, parent ?? null);

    const { fields, next, changed } = applyInheritFields(cat, parentAcl, parentCipher, {
      forceAcl,
      forceCipher,
      syncAcl: true,
      syncCipher: true,
    });
    if (!changed) {
      catMap.set(catId, {
        ...cat,
        inheritAllowedRoleIds: next.inheritAllowedRoleIds,
        inheritCipherCheck: next.inheritCipherCheck,
        allowedRoleIds: next.allowedRoleIds,
        cipherCheck: next.cipherCheck,
      });
      continue;
    }

    const updated = await categoryRepo.updateCategory(spaceId, cat._id, fields);
    if (updated) {
      catMap.set(catId, updated);
      await publishSpaceEvent(spaceIdHex, {
        type: 'space_category_updated',
        data: { category: toPublicSpaceChannelCategory(updated) },
      });
    } else {
      catMap.set(catId, {
        ...cat,
        ...next,
        ...(next.cipherCheck ? { cipherCheck: next.cipherCheck } : { cipherCheck: undefined }),
      });
    }
  }

  // Direct children of root + channels under any descendant.
  const parentScope = new Set([rootId, ...descendantIds]);
  for (const channel of allChannels) {
    const catId = channelCategoryIdHex(channel);
    if (!catId || !parentScope.has(catId)) continue;
    const parent = catMap.get(catId);
    if (!parent) continue;
    const parentAcl = resolveParentAcl(parent, everyoneRoleId);
    const parentCipher = resolveParentCipher(space, parent);

    const { fields, changed } = applyInheritFields(channel, parentAcl, parentCipher, {
      forceAcl,
      forceCipher,
      syncAcl: true,
      syncCipher: true,
    });
    if (!changed) continue;

    const updated = await channelRepo.updateChannel(spaceId, channel._id, fields);
    if (updated) {
      await publishSpaceEvent(spaceIdHex, {
        type: 'space_channel_updated',
        data: { channel: toPublicSpaceChannel(updated) },
      });
    }
  }
}
