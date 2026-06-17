import { describe, expect, test } from 'bun:test';
import {
  buildRoadmapTimeline,
  getAdjacentRoadmapGroupId,
  getRoadmapTimelineGroupId,
  getRoadmapTimelineDateLabels,
  parseTargetReleaseDate,
  resolveEffectiveReleaseDate,
  resolveRoadmapScrollTarget,
  truncateRoadmapExcerpt,
  type RoadmapTimelinePostInput,
} from './roadmap-timeline';

function post(overrides: Partial<RoadmapTimelinePostInput>): RoadmapTimelinePostInput {
  return {
    postId: 'FB-test',
    status: 'planned',
    isRoadmapOfficial: false,
    ...overrides,
  };
}

describe('roadmap timeline', () => {
  test('excludes submitted and closed posts', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-a', status: 'submitted' }),
      post({ postId: 'FB-b', status: 'closed' }),
      post({ postId: 'FB-c', status: 'planned' }),
    ]);
    expect(timeline.future.flatMap((group) => group.items).map((item) => item.postId)).toEqual(['FB-c']);
    expect(timeline.past).toHaveLength(0);
  });

  test('sorts released past groups with undated first then ascending dates', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-new', status: 'released', releasedAt: '2026-06-01T00:00:00.000Z' }),
      post({ postId: 'FB-old', status: 'released', releasedAt: '2025-01-01T00:00:00.000Z' }),
      post({ postId: 'FB-undated', status: 'released' }),
    ]);

    expect(timeline.past.map((group) => group.dateKey)).toEqual([null, '2025-01-01', '2026-06-01']);
  });

  test('orders future bands and dates within bands', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-planned-late', status: 'planned', targetReleaseDate: '2026-12-01' }),
      post({ postId: 'FB-planned-early', status: 'planned', targetReleaseDate: '2026-06-01' }),
      post({ postId: 'FB-planned-none', status: 'planned' }),
      post({ postId: 'FB-testing', status: 'public_testing', targetReleaseDate: '2026-03-01' }),
    ]);

    expect(timeline.future.map((group) => group.statusBand)).toEqual([
      'public_testing',
      'planned',
      'planned',
      'planned',
    ]);
    expect(timeline.future[1]?.dateKey).toBe('2026-06-01');
    expect(timeline.future[3]?.dateKey).toBe(null);
    expect(timeline.future[3]?.items[0]?.postId).toBe('FB-planned-none');
  });

  test('groups same-date items horizontally', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-a', status: 'released', releasedAt: '2026-01-01T00:00:00.000Z' }),
      post({ postId: 'FB-b', status: 'released', releasedAt: '2026-01-01T12:00:00.000Z' }),
    ]);
    expect(timeline.past).toHaveLength(1);
    expect(timeline.past[0]?.items).toHaveLength(2);
  });

  test('parseTargetReleaseDate validates YYYY-MM-DD', () => {
    expect(parseTargetReleaseDate('2026-06-15')?.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(parseTargetReleaseDate('2026-13-01')).toBeNull();
    expect(parseTargetReleaseDate('invalid')).toBeNull();
  });

  test('truncateRoadmapExcerpt adds ellipsis', () => {
    const long = 'a'.repeat(250);
    expect(truncateRoadmapExcerpt(long)).toHaveLength(201);
    expect(truncateRoadmapExcerpt('short')).toBe('short');
  });

  test('resolveEffectiveReleaseDate prefers releasedAt then statusChangedAt then createdAt', () => {
    expect(
      resolveEffectiveReleaseDate({
        postId: 'FB-a',
        status: 'released',
        isRoadmapOfficial: false,
        releasedAt: '2026-01-01T00:00:00.000Z',
        statusChangedAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-03-01T00:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-01-01T00:00:00.000Z');

    expect(
      resolveEffectiveReleaseDate({
        postId: 'FB-b',
        status: 'released',
        isRoadmapOfficial: false,
        statusChangedAt: '2026-02-01T00:00:00.000Z',
        createdAt: '2026-03-01T00:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-02-01T00:00:00.000Z');
  });

  test('formats roadmap dates with full label and relative hover swap', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const labels = getRoadmapTimelineDateLabels('2026-09-01', now);

    expect(labels.full).toBe('1 Sept 2026');
    expect(labels.relative).not.toBe(labels.full);
    expect(labels.useHoverSwap).toBe(true);
  });

  test('uses full date only when more than a year away', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const labels = getRoadmapTimelineDateLabels('2028-01-01', now);

    expect(labels.full).toBe('1 Jan 2028');
    expect(labels.relative).toBe('1 Jan 2028');
    expect(labels.useHoverSwap).toBe(false);
  });

  test('getAdjacentRoadmapGroupId navigates between groups and stops at edges', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-past', status: 'released', releasedAt: '2025-01-01T00:00:00.000Z' }),
      post({ postId: 'FB-future', status: 'planned' }),
    ]);

    const pastId = getRoadmapTimelineGroupId('past', 0);
    const futureId = getRoadmapTimelineGroupId('future', 0);

    expect(getAdjacentRoadmapGroupId(timeline, pastId, 'up')).toBeNull();
    expect(getAdjacentRoadmapGroupId(timeline, pastId, 'down')).toBe(futureId);
    expect(getAdjacentRoadmapGroupId(timeline, futureId, 'up')).toBe(pastId);
    expect(getAdjacentRoadmapGroupId(timeline, futureId, 'down')).toBeNull();
  });

  test('resolveRoadmapScrollTarget finds post in past or future sections', () => {
    const timeline = buildRoadmapTimeline([
      post({ postId: 'FB-past', status: 'released', releasedAt: '2025-01-01T00:00:00.000Z' }),
      post({ postId: 'FB-future', status: 'planned' }),
    ]);

    expect(resolveRoadmapScrollTarget(timeline, 'FB-past')).toEqual({
      groupId: getRoadmapTimelineGroupId('past', 0),
      section: 'past',
    });
    expect(resolveRoadmapScrollTarget(timeline, 'FB-future')).toEqual({
      groupId: getRoadmapTimelineGroupId('future', 0),
      section: 'future',
    });
    expect(resolveRoadmapScrollTarget(timeline, 'FB-missing')).toBeNull();
  });
});
