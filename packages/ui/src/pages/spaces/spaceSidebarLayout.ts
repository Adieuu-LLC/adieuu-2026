/**
 * Helpers for Space sidebar channel/category grouping and layout payloads.
 */

import type {
  PublicSpaceChannel,
  PublicSpaceChannelCategory,
  UpdateSpaceChannelLayoutParams,
} from '@adieuu/shared';

export type SpaceSidebarBucket = {
  categoryId: string | null;
  channels: PublicSpaceChannel[];
};

export function sortByPosition<T extends { position: number; id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

/** Group channels into uncategorized + per-category buckets (categories ordered). */
export function buildSpaceSidebarBuckets(
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): SpaceSidebarBucket[] {
  const sortedCategories = sortByPosition(categories);
  const sortedChannels = sortByPosition(channels);
  const uncategorized = sortedChannels.filter((ch) => !ch.categoryId);
  const buckets: SpaceSidebarBucket[] = [
    { categoryId: null, channels: uncategorized },
  ];
  for (const cat of sortedCategories) {
    buckets.push({
      categoryId: cat.id,
      channels: sortedChannels.filter((ch) => ch.categoryId === cat.id),
    });
  }
  return buckets;
}

/** Build a full layout payload from current ordered category ids + buckets. */
export function buildChannelLayoutPayload(
  categoryIds: readonly string[],
  buckets: ReadonlyArray<{ categoryId: string | null; channelIds: readonly string[] }>,
): UpdateSpaceChannelLayoutParams {
  return {
    categoryIds: [...categoryIds],
    channelOrder: buckets.map((b) => ({
      categoryId: b.categoryId,
      channelIds: [...b.channelIds],
    })),
  };
}

/**
 * Apply a drag result: reorder categories, reorder channels within a bucket,
 * or move a channel onto a category / uncategorized drop target.
 */
export function applySpaceSidebarDrag(params: {
  categories: readonly PublicSpaceChannelCategory[];
  channels: readonly PublicSpaceChannel[];
  activeId: string;
  overId: string;
}): UpdateSpaceChannelLayoutParams | null {
  const { categories, channels, activeId, overId } = params;
  if (activeId === overId) return null;

  const sortedCategories = sortByPosition(categories);
  const categoryIds = sortedCategories.map((c) => c.id);

  // Category reorder: active is category:X, over is category:Y
  if (activeId.startsWith('category:') && overId.startsWith('category:')) {
    const fromId = activeId.slice('category:'.length);
    const toId = overId.slice('category:'.length);
    const fromIdx = categoryIds.indexOf(fromId);
    const toIdx = categoryIds.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return null;
    const next = [...categoryIds];
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return null;
    next.splice(toIdx, 0, moved);
    const buckets = buildSpaceSidebarBuckets(sortedCategories, channels).map((b) => ({
      categoryId: b.categoryId,
      channelIds: b.channels.map((c) => c.id),
    }));
    // Reorder buckets to match new category order (keep uncategorized first)
    const byCat = new Map(
      buckets.filter((b) => b.categoryId).map((b) => [b.categoryId!, b]),
    );
    const uncategorized = buckets.find((b) => b.categoryId === null) ?? {
      categoryId: null,
      channelIds: [] as string[],
    };
    return buildChannelLayoutPayload(next, [
      uncategorized,
      ...next.map((id) => byCat.get(id) ?? { categoryId: id, channelIds: [] as string[] }),
    ]);
  }

  // Channel drag
  if (!activeId.startsWith('channel:')) return null;
  const draggedChannelId = activeId.slice('channel:'.length);
  const dragged = channels.find((c) => c.id === draggedChannelId);
  if (!dragged) return null;

  let targetCategoryId: string | null | undefined;
  let targetIndex: number | undefined;

  if (overId.startsWith('category:') || overId === 'uncategorized') {
    targetCategoryId = overId === 'uncategorized' ? null : overId.slice('category:'.length);
    targetIndex = 0;
  } else if (overId.startsWith('channel:')) {
    const overChannelId = overId.slice('channel:'.length);
    const overChannel = channels.find((c) => c.id === overChannelId);
    if (!overChannel) return null;
    targetCategoryId = overChannel.categoryId ?? null;
    const bucketChannels = sortByPosition(channels).filter(
      (c) => (c.categoryId ?? null) === targetCategoryId && c.id !== draggedChannelId,
    );
    const overIdx = bucketChannels.findIndex((c) => c.id === overChannelId);
    targetIndex = overIdx < 0 ? bucketChannels.length : overIdx;
  } else {
    return null;
  }

  const buckets = buildSpaceSidebarBuckets(sortedCategories, channels).map((b) => ({
    categoryId: b.categoryId,
    channelIds: b.channels.map((c) => c.id).filter((id) => id !== draggedChannelId),
  }));

  const targetBucket = buckets.find((b) => b.categoryId === targetCategoryId);
  if (!targetBucket) {
    buckets.push({ categoryId: targetCategoryId!, channelIds: [draggedChannelId] });
  } else {
    const idx = Math.min(targetIndex ?? 0, targetBucket.channelIds.length);
    targetBucket.channelIds.splice(idx, 0, draggedChannelId);
  }

  return buildChannelLayoutPayload(categoryIds, buckets);
}
