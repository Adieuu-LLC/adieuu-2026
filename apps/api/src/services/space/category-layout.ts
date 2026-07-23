/**
 * Atomic reorder of a Space's nested categories and interleaved channels.
 *
 * Split from `category-crud.ts` (list/create/update/delete) to keep both under
 * the repository file-size limit; shared gates live in `category-shared.ts`.
 *
 * @module services/space/category-layout
 */

import { ObjectId } from 'mongodb';
import { SPACE_CATEGORY_MAX_DEPTH } from '@adieuu/shared';
import { getSpaceChannelRepository } from '../../repositories/space-channel.repository';
import { getSpaceChannelCategoryRepository } from '../../repositories/space-channel-category.repository';
import { toPublicSpaceChannel } from '../../models/space-channel';
import { toPublicSpaceChannelCategory } from '../../models/space-channel-category';
import { publishLayoutUpdated } from './layout-broadcast';
import type { SpaceChannelLayoutResult } from './types';
import {
  categoryDepth,
  forbidUnlessManage,
  parseObjId,
  requireCategoryMember,
  type UpdateSpaceChannelLayoutParams,
} from './category-shared';

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

  // Visibility-scoped broadcast: each member only receives the entries they
  // may view (restricted-channel metadata must not leak space-wide).
  await publishLayoutUpdated(spaceId, updatedCategories, updatedChannels);

  return { success: true, categories: publicCategories, channels: publicChannels };
}
