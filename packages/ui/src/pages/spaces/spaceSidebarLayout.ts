/**
 * Helpers for Space sidebar channel/category tree and layout payloads.
 */

import {
  SPACE_CATEGORY_MAX_DEPTH,
  type PublicSpaceChannel,
  type PublicSpaceChannelCategory,
  type SpaceChannelLayoutItem,
  type UpdateSpaceChannelLayoutParams,
} from '@adieuu/shared';

export type SpaceSidebarDropZone = 'before' | 'after' | 'on';

export type SpaceSidebarTreeItem =
  | { type: 'channel'; channel: PublicSpaceChannel }
  | {
      type: 'category';
      category: PublicSpaceChannelCategory;
      children: SpaceSidebarTreeItem[];
    };

export type SpaceSidebarDragResult =
  | { type: 'layout'; layout: UpdateSpaceChannelLayoutParams }
  | {
      type: 'createCategoryFromChannels';
      parentCategoryId: string | null;
      /** Target channel first, then dragged (stable by prior position when tied). */
      channelIds: [string, string];
      /** Sibling insert index under parent for the new category. */
      insertIndex: number;
    };

export function sortByPosition<T extends { position: number; id: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

function parentOfCategory(cat: PublicSpaceChannelCategory): string | null {
  return cat.parentCategoryId ?? null;
}

/** Depth of a category in the current tree (root = 1). */
export function getCategoryDepth(
  categoryId: string,
  categories: readonly PublicSpaceChannelCategory[],
): number {
  const parentById = new Map(categories.map((c) => [c.id, parentOfCategory(c)] as const));
  let depth = 1;
  let current: string | null = categoryId;
  const seen = new Set<string>();
  while (current) {
    if (seen.has(current)) return depth;
    seen.add(current);
    const parent = parentById.get(current);
    if (parent === undefined || parent === null) return depth;
    depth += 1;
    current = parent;
  }
  return depth;
}

function wouldExceedMaxDepth(
  draggedCategoryId: string,
  newParentId: string,
  categories: readonly PublicSpaceChannelCategory[],
): boolean {
  const parentDepth = getCategoryDepth(newParentId, categories);
  // Subtree height of dragged category
  const childrenByParent = new Map<string, string[]>();
  for (const c of categories) {
    const p = parentOfCategory(c);
    if (!p) continue;
    const list = childrenByParent.get(p) ?? [];
    list.push(c.id);
    childrenByParent.set(p, list);
  }
  const subtreeHeight = (id: string): number => {
    const kids = childrenByParent.get(id) ?? [];
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map(subtreeHeight));
  };
  return parentDepth + subtreeHeight(draggedCategoryId) > SPACE_CATEGORY_MAX_DEPTH;
}

function isDescendantOf(
  maybeDescendant: string,
  ancestorId: string,
  categories: readonly PublicSpaceChannelCategory[],
): boolean {
  const parentById = new Map(categories.map((c) => [c.id, parentOfCategory(c)] as const));
  let current: string | null = maybeDescendant;
  const seen = new Set<string>();
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

type FlatSibling =
  | { type: 'channel'; id: string; position: number }
  | { type: 'category'; id: string; position: number };

/**
 * Build interleaved children for a parent. When the Space has no nested
 * categories yet, preserve legacy root order: uncategorized channels, then
 * root categories.
 */
function siblingsForParent(
  parentId: string | null,
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): FlatSibling[] {
  const childChannels = channels.filter((ch) => (ch.categoryId ?? null) === parentId);
  const childCategories = categories.filter((c) => parentOfCategory(c) === parentId);
  const hasAnyNesting = categories.some((c) => parentOfCategory(c) !== null);

  if (parentId === null && !hasAnyNesting) {
    return [
      ...sortByPosition(childChannels).map(
        (ch): FlatSibling => ({ type: 'channel', id: ch.id, position: ch.position }),
      ),
      ...sortByPosition(childCategories).map(
        (c): FlatSibling => ({ type: 'category', id: c.id, position: c.position }),
      ),
    ];
  }

  const mixed: FlatSibling[] = [
    ...childChannels.map((ch) => ({ type: 'channel' as const, id: ch.id, position: ch.position })),
    ...childCategories.map((c) => ({ type: 'category' as const, id: c.id, position: c.position })),
  ];
  return mixed.sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
}

/** Build a recursive tree of interleaved channels and nested categories. */
export function buildSpaceSidebarTree(
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): SpaceSidebarTreeItem[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const channelById = new Map(channels.map((c) => [c.id, c]));

  const buildLevel = (parentId: string | null): SpaceSidebarTreeItem[] => {
    const siblings = siblingsForParent(parentId, categories, channels);
    const items: SpaceSidebarTreeItem[] = [];
    for (const sib of siblings) {
      if (sib.type === 'channel') {
        const channel = channelById.get(sib.id);
        if (channel) items.push({ type: 'channel', channel });
      } else {
        const category = categoryById.get(sib.id);
        if (!category) continue;
        items.push({
          type: 'category',
          category,
          children: buildLevel(category.id),
        });
      }
    }
    return items;
  };

  return buildLevel(null);
}

/** Convert a tree into the layout API payload (every category gets a group). */
export function treeToLayoutPayload(
  categories: readonly PublicSpaceChannelCategory[],
  tree: readonly SpaceSidebarTreeItem[],
): UpdateSpaceChannelLayoutParams {
  const groups: UpdateSpaceChannelLayoutParams['groups'] = [];

  const walk = (parentCategoryId: string | null, items: readonly SpaceSidebarTreeItem[]) => {
    const layoutItems: SpaceChannelLayoutItem[] = items.map((item) =>
      item.type === 'channel'
        ? { type: 'channel', id: item.channel.id }
        : { type: 'category', id: item.category.id },
    );
    groups.push({ parentCategoryId, items: layoutItems });
    for (const item of items) {
      if (item.type === 'category') {
        walk(item.category.id, item.children);
      }
    }
  };

  walk(null, tree);

  // Ensure every category has a group even if missing from the tree walk.
  const seenParents = new Set(groups.map((g) => g.parentCategoryId));
  for (const cat of categories) {
    if (!seenParents.has(cat.id)) {
      groups.push({ parentCategoryId: cat.id, items: [] });
    }
  }

  return { groups };
}

/** Build layout payload from current categories + channels. */
export function buildCurrentLayoutPayload(
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): UpdateSpaceChannelLayoutParams {
  return treeToLayoutPayload(categories, buildSpaceSidebarTree(categories, channels));
}

/**
 * Apply a drag with an explicit drop zone.
 * Returns a layout update, a create-category intent, or null (no-op / invalid).
 */
export function applySpaceSidebarDrag(params: {
  categories: readonly PublicSpaceChannelCategory[];
  channels: readonly PublicSpaceChannel[];
  activeId: string;
  overId: string;
  zone: SpaceSidebarDropZone;
}): SpaceSidebarDragResult | null {
  const { categories, channels, activeId, overId, zone } = params;
  if (activeId === overId && zone === 'on') return null;

  const tree = buildSpaceSidebarTree(categories, channels);

  type Loc = { parentId: string | null; index: number };
  const locate = (
    items: readonly SpaceSidebarTreeItem[],
    parentId: string | null,
    kind: 'channel' | 'category',
    id: string,
  ): Loc | null => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (kind === 'channel' && item.type === 'channel' && item.channel.id === id) {
        return { parentId, index: i };
      }
      if (kind === 'category' && item.type === 'category' && item.category.id === id) {
        return { parentId, index: i };
      }
      if (item.type === 'category') {
        const found = locate(item.children, item.category.id, kind, id);
        if (found) return found;
      }
    }
    return null;
  };

  const removeAt = (
    items: SpaceSidebarTreeItem[],
    parentId: string | null,
    index: number,
  ): SpaceSidebarTreeItem | null => {
    if (parentId === null) {
      const [removed] = items.splice(index, 1);
      return removed ?? null;
    }
    for (const item of items) {
      if (item.type === 'category' && item.category.id === parentId) {
        const [removed] = item.children.splice(index, 1);
        return removed ?? null;
      }
      if (item.type === 'category') {
        const removed = removeAt(item.children, parentId, index);
        if (removed) return removed;
      }
    }
    return null;
  };

  const insertAt = (
    items: SpaceSidebarTreeItem[],
    parentId: string | null,
    index: number,
    node: SpaceSidebarTreeItem,
  ): boolean => {
    if (parentId === null) {
      items.splice(Math.min(index, items.length), 0, node);
      return true;
    }
    for (const item of items) {
      if (item.type === 'category' && item.category.id === parentId) {
        item.children.splice(Math.min(index, item.children.length), 0, node);
        return true;
      }
      if (item.type === 'category' && insertAt(item.children, parentId, index, node)) {
        return true;
      }
    }
    return false;
  };

  const cloneTree = (items: readonly SpaceSidebarTreeItem[]): SpaceSidebarTreeItem[] =>
    items.map((item) =>
      item.type === 'channel'
        ? { type: 'channel', channel: item.channel }
        : {
            type: 'category',
            category: item.category,
            children: cloneTree(item.children),
          },
    );

  const next = cloneTree(tree);

  // --- Channel drag ---
  if (activeId.startsWith('channel:')) {
    const draggedId = activeId.slice('channel:'.length);
    const draggedLoc = locate(next, null, 'channel', draggedId);
    if (!draggedLoc) return null;
    const draggedChannel = channels.find((c) => c.id === draggedId);
    if (!draggedChannel) return null;

    if (overId.startsWith('channel:')) {
      const overChannelId = overId.slice('channel:'.length);
      if (overChannelId === draggedId) return null;
      const overLoc = locate(next, null, 'channel', overChannelId);
      if (!overLoc) return null;
      const overChannel = channels.find((c) => c.id === overChannelId);
      if (!overChannel) return null;

      if (zone === 'on') {
        // Create a new category containing both channels under over's parent.
        const parentCategoryId = overLoc.parentId;
        // insertIndex: position of the earlier of the two among current siblings
        // after we'll remove both — computed before mutation.
        const siblings = (() => {
          if (parentCategoryId === null) return next;
          const find = (items: SpaceSidebarTreeItem[]): SpaceSidebarTreeItem[] | null => {
            for (const item of items) {
              if (item.type === 'category' && item.category.id === parentCategoryId) {
                return item.children;
              }
              if (item.type === 'category') {
                const found = find(item.children);
                if (found) return found;
              }
            }
            return null;
          };
          return find(next) ?? [];
        })();
        const idxs = [draggedLoc, overLoc]
          .filter((l) => l.parentId === parentCategoryId)
          .map((l) => l.index);
        const insertIndex = idxs.length > 0 ? Math.min(...idxs) : overLoc.index;

        const byPos = sortByPosition(
          [draggedChannel, overChannel].filter((c) => (c.categoryId ?? null) === parentCategoryId),
        );
        const ordered: [string, string] =
          byPos.length === 2
            ? [byPos[0]!.id, byPos[1]!.id]
            : [overChannelId, draggedId];

        return {
          type: 'createCategoryFromChannels',
          parentCategoryId,
          channelIds: ordered,
          insertIndex,
        };
      }

      // before / after: move next to over channel as sibling
      const removed = removeAt(next, draggedLoc.parentId, draggedLoc.index);
      if (!removed || removed.type !== 'channel') return null;

      // Re-locate over after removal (index may have shifted).
      const overLocAfter = locate(next, null, 'channel', overChannelId);
      if (!overLocAfter) return null;
      let insertIndex = overLocAfter.index + (zone === 'after' ? 1 : 0);
      insertAt(next, overLocAfter.parentId, insertIndex, removed);
      return { type: 'layout', layout: treeToLayoutPayload(categories, next) };
    }

    if (overId.startsWith('category:')) {
      const overCategoryId = overId.slice('category:'.length);
      const overLoc = locate(next, null, 'category', overCategoryId);
      if (!overLoc) return null;

      const removed = removeAt(next, draggedLoc.parentId, draggedLoc.index);
      if (!removed || removed.type !== 'channel') return null;

      if (zone === 'on' || zone === 'after') {
        // Header center or the line just below the category name (above the
        // first child) both mean: insert at the top of this category.
        insertAt(next, overCategoryId, 0, removed);
      } else {
        // Line above the category name → sibling before the category.
        const overLocAfter = locate(next, null, 'category', overCategoryId);
        if (!overLocAfter) return null;
        insertAt(next, overLocAfter.parentId, overLocAfter.index, removed);
      }
      return { type: 'layout', layout: treeToLayoutPayload(categories, next) };
    }

    return null;
  }

  // --- Category drag ---
  if (activeId.startsWith('category:')) {
    const draggedId = activeId.slice('category:'.length);
    const draggedLoc = locate(next, null, 'category', draggedId);
    if (!draggedLoc) return null;

    // Find the category node (with children) before removing
    const findNode = (
      items: readonly SpaceSidebarTreeItem[],
      id: string,
    ): SpaceSidebarTreeItem | null => {
      for (const item of items) {
        if (item.type === 'category' && item.category.id === id) return item;
        if (item.type === 'category') {
          const found = findNode(item.children, id);
          if (found) return found;
        }
      }
      return null;
    };
    const draggedNode = findNode(next, draggedId);
    if (!draggedNode || draggedNode.type !== 'category') return null;

    if (overId.startsWith('category:')) {
      const overCategoryId = overId.slice('category:'.length);
      if (overCategoryId === draggedId) return null;
      if (isDescendantOf(overCategoryId, draggedId, categories)) return null;

      if (zone === 'on') {
        if (wouldExceedMaxDepth(draggedId, overCategoryId, categories)) return null;
        const removed = removeAt(next, draggedLoc.parentId, draggedLoc.index);
        if (!removed || removed.type !== 'category') return null;
        // Keep category settings; only change parent via layout placement.
        insertAt(next, overCategoryId, 0, removed);
        return { type: 'layout', layout: treeToLayoutPayload(categories, next) };
      }

      const removed = removeAt(next, draggedLoc.parentId, draggedLoc.index);
      if (!removed || removed.type !== 'category') return null;
      const overLocAfter = locate(next, null, 'category', overCategoryId);
      if (!overLocAfter) return null;
      const insertIndex = overLocAfter.index + (zone === 'after' ? 1 : 0);
      insertAt(next, overLocAfter.parentId, insertIndex, removed);
      return { type: 'layout', layout: treeToLayoutPayload(categories, next) };
    }

    if (overId.startsWith('channel:')) {
      const overChannelId = overId.slice('channel:'.length);
      const overLoc = locate(next, null, 'channel', overChannelId);
      if (!overLoc) return null;

      // Nesting into a channel's parent as sibling (before/after). "on" channel
      // with a category drag is treated as after the channel (no create-cat).
      const removed = removeAt(next, draggedLoc.parentId, draggedLoc.index);
      if (!removed || removed.type !== 'category') return null;
      const overLocAfter = locate(next, null, 'channel', overChannelId);
      if (!overLocAfter) return null;
      const insertIndex =
        overLocAfter.index + (zone === 'before' ? 0 : 1);
      // If moving under a parent would deepen past max — only when parent changes
      // into a nested category; sibling under same/root is fine.
      if (overLocAfter.parentId) {
        // Temporary parent map for depth check
        const withParent = categories.map((c) =>
          c.id === draggedId
            ? { ...c, parentCategoryId: overLocAfter.parentId }
            : c,
        );
        if (getCategoryDepth(draggedId, withParent) > SPACE_CATEGORY_MAX_DEPTH) {
          return null;
        }
      }
      insertAt(next, overLocAfter.parentId, insertIndex, removed);
      return { type: 'layout', layout: treeToLayoutPayload(categories, next) };
    }

    return null;
  }

  return null;
}

/**
 * After creating a category from two channels, build the layout that places
 * the new category at `insertIndex` under `parentCategoryId` with both channels inside.
 */
export function layoutAfterCreateCategoryFromChannels(params: {
  categories: readonly PublicSpaceChannelCategory[];
  channels: readonly PublicSpaceChannel[];
  newCategory: PublicSpaceChannelCategory;
  parentCategoryId: string | null;
  channelIds: readonly [string, string];
  insertIndex: number;
}): UpdateSpaceChannelLayoutParams {
  const { categories, channels, newCategory, parentCategoryId, channelIds, insertIndex } = params;
  const allCategories = [...categories, newCategory];
  const tree = cloneAndBuild(allCategories, channels);

  // Remove both channels from wherever they are
  for (const chId of channelIds) {
    removeChannel(tree, chId);
  }

  const newNode: SpaceSidebarTreeItem = {
    type: 'category',
    category: newCategory,
    children: channelIds.map((id) => {
      const channel = channels.find((c) => c.id === id)!;
      return { type: 'channel' as const, channel };
    }),
  };

  insertNode(tree, parentCategoryId, insertIndex, newNode);
  return treeToLayoutPayload(allCategories, tree);
}

function cloneAndBuild(
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): SpaceSidebarTreeItem[] {
  return buildSpaceSidebarTree(categories, channels).map(cloneItem);
}

function cloneItem(item: SpaceSidebarTreeItem): SpaceSidebarTreeItem {
  if (item.type === 'channel') return { type: 'channel', channel: item.channel };
  return {
    type: 'category',
    category: item.category,
    children: item.children.map(cloneItem),
  };
}

function removeChannel(items: SpaceSidebarTreeItem[], channelId: string): boolean {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.type === 'channel' && item.channel.id === channelId) {
      items.splice(i, 1);
      return true;
    }
    if (item.type === 'category' && removeChannel(item.children, channelId)) {
      return true;
    }
  }
  return false;
}

function insertNode(
  items: SpaceSidebarTreeItem[],
  parentId: string | null,
  index: number,
  node: SpaceSidebarTreeItem,
): void {
  if (parentId === null) {
    items.splice(Math.min(index, items.length), 0, node);
    return;
  }
  for (const item of items) {
    if (item.type === 'category' && item.category.id === parentId) {
      item.children.splice(Math.min(index, item.children.length), 0, node);
      return;
    }
    if (item.type === 'category') {
      insertNode(item.children, parentId, index, node);
    }
  }
}

/** @deprecated Prefer buildSpaceSidebarTree — kept for transitional call sites. */
export function buildSpaceSidebarBuckets(
  categories: readonly PublicSpaceChannelCategory[],
  channels: readonly PublicSpaceChannel[],
): Array<{ categoryId: string | null; channels: PublicSpaceChannel[] }> {
  const sortedCategories = sortByPosition(
    categories.filter((c) => parentOfCategory(c) === null),
  );
  const sortedChannels = sortByPosition(channels);
  const uncategorized = sortedChannels.filter((ch) => !ch.categoryId);
  const buckets: Array<{ categoryId: string | null; channels: PublicSpaceChannel[] }> = [
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
