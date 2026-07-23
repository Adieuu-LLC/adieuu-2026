import { describe, expect, test } from 'bun:test';
import type { PublicSpaceChannel, PublicSpaceChannelCategory } from '@adieuu/shared';
import {
  applySpaceSidebarDrag,
  buildSpaceSidebarTree,
  layoutAfterCreateCategoryFromChannels,
} from './spaceSidebarLayout';
import { resolveDropZone } from './spaceSidebarDnd';

function cat(
  id: string,
  position: number,
  parentCategoryId: string | null = null,
): PublicSpaceChannelCategory {
  return {
    id,
    spaceId: 's1',
    name: id,
    position,
    parentCategoryId,
    allowedRoleIds: [],
    createdAt: '',
    updatedAt: '',
  };
}

function ch(
  id: string,
  position: number,
  categoryId: string | null = null,
): PublicSpaceChannel {
  return {
    id,
    spaceId: 's1',
    type: 'text',
    name: id,
    position,
    categoryId,
    allowedRoleIds: [],
    createdAt: '',
    updatedAt: '',
  };
}

describe('spaceSidebarLayout', () => {
  test('buildSpaceSidebarTree keeps legacy root order (channels then categories)', () => {
    const tree = buildSpaceSidebarTree(
      [cat('c2', 1), cat('c1', 0)],
      [ch('a', 0), ch('b', 0, 'c1'), ch('c', 1, 'c1'), ch('d', 0, 'c2')],
    );
    expect(tree.map((n) => (n.type === 'channel' ? n.channel.id : n.category.id))).toEqual([
      'a',
      'c1',
      'c2',
    ]);
    const c1 = tree[1]!;
    expect(c1.type).toBe('category');
    if (c1.type === 'category') {
      expect(c1.children.map((n) => (n.type === 'channel' ? n.channel.id : ''))).toEqual([
        'b',
        'c',
      ]);
    }
  });

  test('buildSpaceSidebarTree nests categories when parentCategoryId is set', () => {
    const tree = buildSpaceSidebarTree(
      [cat('c1', 0), cat('c2', 0, 'c1')],
      [ch('a', 0, 'c1'), ch('b', 1, 'c2')],
    );
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.type).toBe('category');
    if (root.type === 'category') {
      expect(root.children.map((n) => (n.type === 'channel' ? n.channel.id : n.category.id))).toEqual([
        'a',
        'c2',
      ]);
    }
  });

  test('applySpaceSidebarDrag reorders channel before another', () => {
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0, 'c1'), ch('b', 1, 'c1')],
      activeId: 'channel:b',
      overId: 'channel:a',
      zone: 'before',
    });
    expect(result?.type).toBe('layout');
    if (result?.type !== 'layout') return;
    const group = result.layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(group?.items.map((i) => i.id)).toEqual(['b', 'a']);
  });

  test('applySpaceSidebarDrag moves channel onto category header to top', () => {
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0), ch('b', 0, 'c1')],
      activeId: 'channel:a',
      overId: 'category:c1',
      zone: 'on',
    });
    expect(result?.type).toBe('layout');
    if (result?.type !== 'layout') return;
    const inCat = result.layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(inCat?.items[0]).toEqual({ type: 'channel', id: 'a' });
    const root = result.layout.groups.find((g) => g.parentCategoryId === null);
    expect(root?.items.some((i) => i.id === 'a')).toBe(false);
  });

  test('applySpaceSidebarDrag after category header inserts inside at top', () => {
    // Line between category name and first channel is category:after, not a
    // sibling slot outside the category.
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0), ch('b', 0, 'c1'), ch('c', 1, 'c1')],
      activeId: 'channel:a',
      overId: 'category:c1',
      zone: 'after',
    });
    expect(result?.type).toBe('layout');
    if (result?.type !== 'layout') return;
    const inCat = result.layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(inCat?.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    const root = result.layout.groups.find((g) => g.parentCategoryId === null);
    expect(root?.items.some((i) => i.id === 'a')).toBe(false);
  });

  test('applySpaceSidebarDrag before category header stays outside as sibling', () => {
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0), ch('b', 0, 'c1')],
      activeId: 'channel:a',
      overId: 'category:c1',
      zone: 'before',
    });
    expect(result?.type).toBe('layout');
    if (result?.type !== 'layout') return;
    const root = result.layout.groups.find((g) => g.parentCategoryId === null);
    expect(root?.items.map((i) => i.id)).toEqual(['a', 'c1']);
    const inCat = result.layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(inCat?.items.map((i) => i.id)).toEqual(['b']);
  });

  test('applySpaceSidebarDrag nests category on category header', () => {
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0), cat('c2', 1)],
      channels: [],
      activeId: 'category:c2',
      overId: 'category:c1',
      zone: 'on',
    });
    expect(result?.type).toBe('layout');
    if (result?.type !== 'layout') return;
    const root = result.layout.groups.find((g) => g.parentCategoryId === null);
    expect(root?.items).toEqual([{ type: 'category', id: 'c1' }]);
    const c1 = result.layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(c1?.items).toEqual([{ type: 'category', id: 'c2' }]);
  });

  test('applySpaceSidebarDrag channel-on-channel returns create intent', () => {
    const result = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0, 'c1'), ch('b', 1, 'c1')],
      activeId: 'channel:b',
      overId: 'channel:a',
      zone: 'on',
    });
    expect(result).toEqual({
      type: 'createCategoryFromChannels',
      parentCategoryId: 'c1',
      channelIds: ['a', 'b'],
      insertIndex: 0,
    });
  });

  test('layoutAfterCreateCategoryFromChannels places both channels in new category', () => {
    const newCat = cat('new', 0, 'c1');
    const layout = layoutAfterCreateCategoryFromChannels({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0, 'c1'), ch('b', 1, 'c1'), ch('c', 2, 'c1')],
      newCategory: newCat,
      parentCategoryId: 'c1',
      channelIds: ['a', 'b'],
      insertIndex: 0,
    });
    const c1 = layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(c1?.items[0]).toEqual({ type: 'category', id: 'new' });
    const nested = layout.groups.find((g) => g.parentCategoryId === 'new');
    expect(nested?.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  test('layoutAfterCreateCategoryFromChannels does not duplicate a just-created nested category', () => {
    // createCategory already returns the category with parentCategoryId set and
    // may also appear in the local categories list after addCategoryLocally.
    const newCat = cat('new', 2, 'c1');
    const layout = layoutAfterCreateCategoryFromChannels({
      categories: [cat('c1', 0), newCat],
      channels: [ch('a', 0, 'c1'), ch('b', 1, 'c1'), ch('c', 2, 'c1')],
      newCategory: newCat,
      parentCategoryId: 'c1',
      channelIds: ['a', 'b'],
      insertIndex: 0,
    });
    const categoryItemIds = layout.groups.flatMap((g) =>
      g.items.filter((i) => i.type === 'category').map((i) => i.id),
    );
    expect(categoryItemIds.filter((id) => id === 'new')).toHaveLength(1);
    const c1 = layout.groups.find((g) => g.parentCategoryId === 'c1');
    expect(c1?.items.map((i) => i.id)).toEqual(['new', 'c']);
    const nested = layout.groups.find((g) => g.parentCategoryId === 'new');
    expect(nested?.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  test('applySpaceSidebarDrag rejects nesting past max depth', () => {
    const cats = [
      cat('c1', 0),
      cat('c2', 0, 'c1'),
      cat('c3', 0, 'c2'),
      cat('c4', 0, 'c3'),
      cat('c5', 0, 'c4'),
      cat('extra', 1),
    ];
    const result = applySpaceSidebarDrag({
      categories: cats,
      channels: [],
      activeId: 'category:extra',
      overId: 'category:c5',
      zone: 'on',
    });
    expect(result).toBeNull();
  });
});

describe('resolveDropZone', () => {
  test('splits before / on / after by Y ratio', () => {
    const rect = { top: 100, height: 100 };
    expect(resolveDropZone(110, rect)).toBe('before');
    expect(resolveDropZone(150, rect)).toBe('on');
    expect(resolveDropZone(190, rect)).toBe('after');
  });
});
