import { describe, expect, test } from 'bun:test';
import type { PublicSpaceChannel, PublicSpaceChannelCategory } from '@adieuu/shared';
import {
  applySpaceSidebarDrag,
  buildSpaceSidebarBuckets,
} from './spaceSidebarLayout';

function cat(
  id: string,
  position: number,
): PublicSpaceChannelCategory {
  return {
    id,
    spaceId: 's1',
    name: id,
    position,
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
  test('buildSpaceSidebarBuckets groups uncategorized first then categories', () => {
    const buckets = buildSpaceSidebarBuckets(
      [cat('c2', 1), cat('c1', 0)],
      [ch('a', 0), ch('b', 0, 'c1'), ch('c', 1, 'c1'), ch('d', 0, 'c2')],
    );
    expect(buckets.map((b) => b.categoryId)).toEqual([null, 'c1', 'c2']);
    expect(buckets[0]!.channels.map((x) => x.id)).toEqual(['a']);
    expect(buckets[1]!.channels.map((x) => x.id)).toEqual(['b', 'c']);
  });

  test('applySpaceSidebarDrag reorders categories', () => {
    const layout = applySpaceSidebarDrag({
      categories: [cat('c1', 0), cat('c2', 1)],
      channels: [ch('a', 0, 'c1')],
      activeId: 'category:c2',
      overId: 'category:c1',
    });
    expect(layout?.categoryIds).toEqual(['c2', 'c1']);
  });

  test('applySpaceSidebarDrag moves channel onto a category', () => {
    const layout = applySpaceSidebarDrag({
      categories: [cat('c1', 0)],
      channels: [ch('a', 0), ch('b', 0, 'c1')],
      activeId: 'channel:a',
      overId: 'category:c1',
    });
    expect(layout).not.toBeNull();
    const inCat = layout!.channelOrder.find((b) => b.categoryId === 'c1');
    expect(inCat?.channelIds[0]).toBe('a');
    const uncategorized = layout!.channelOrder.find((b) => b.categoryId === null);
    expect(uncategorized?.channelIds).toEqual([]);
  });
});
