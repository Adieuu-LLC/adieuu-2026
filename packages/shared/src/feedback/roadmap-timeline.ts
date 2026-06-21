import {
  isRoadmapTimelineStatus,
  type FeedbackStatus,
} from '../constants/feedback';

export const ROADMAP_TIMELINE_FUTURE_STATUS_ORDER: FeedbackStatus[] = [
  'public_testing',
  'internal_testing',
  'in_progress',
  'roadmapped',
  'planned',
];

export const ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH = 200;

export interface RoadmapTimelinePostInput {
  postId: string;
  status: FeedbackStatus;
  isRoadmapOfficial: boolean;
  showOnTimeline?: boolean;
  targetReleaseDate?: string | Date | null;
  releasedAt?: string | Date | null;
  statusChangedAt?: string | Date | null;
  createdAt?: string | Date | null;
}

export interface RoadmapTimelineGroup<T = RoadmapTimelinePostInput> {
  dateKey: string | null;
  statusBand?: FeedbackStatus;
  items: T[];
}

export interface RoadmapTimelineResponse<T = RoadmapTimelinePostInput> {
  past: RoadmapTimelineGroup<T>[];
  future: RoadmapTimelineGroup<T>[];
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(value: string | Date | null | undefined): string | null {
  const date = toDate(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function resolveEffectiveReleaseDate(post: RoadmapTimelinePostInput): Date | null {
  return (
    toDate(post.releasedAt)
    ?? toDate(post.statusChangedAt)
    ?? toDate(post.createdAt)
  );
}

export function resolveEffectiveTargetDate(post: RoadmapTimelinePostInput): Date | null {
  return toDate(post.targetReleaseDate);
}

export function parseTargetReleaseDate(input: string): Date | null {
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [year, month, day] = trimmed.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month! - 1
    || date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

const ROADMAP_FULL_DATE_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec',
] as const;

const MS_PER_DAY = 86_400_000;

export function formatRoadmapTimelineFullDate(dateKey: string): string {
  const parsed = parseTargetReleaseDate(dateKey);
  if (!parsed) return dateKey;
  const day = parsed.getUTCDate();
  const month = ROADMAP_FULL_DATE_MONTHS[parsed.getUTCMonth()] ?? '???';
  const year = parsed.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export function formatRoadmapTimelineRelativeDate(
  dateKey: string,
  now: Date = new Date(),
): string {
  const parsed = parseTargetReleaseDate(dateKey);
  if (!parsed) return dateKey;

  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
  const diffDays = Math.round((targetUtc - nowUtc) / MS_PER_DAY);

  if (Math.abs(diffDays) >= 365) {
    return formatRoadmapTimelineFullDate(dateKey);
  }

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const absDays = Math.abs(diffDays);
  if (absDays >= 28) {
    return rtf.format(Math.round(diffDays / 30), 'month');
  }
  if (absDays >= 7) {
    return rtf.format(Math.round(diffDays / 7), 'week');
  }
  return rtf.format(diffDays, 'day');
}

export interface RoadmapTimelineDateLabels {
  relative: string;
  full: string;
  useHoverSwap: boolean;
}

export function getRoadmapTimelineDateLabels(
  dateKey: string,
  now: Date = new Date(),
): RoadmapTimelineDateLabels {
  const full = formatRoadmapTimelineFullDate(dateKey);
  const relative = formatRoadmapTimelineRelativeDate(dateKey, now);
  return {
    relative,
    full,
    useHoverSwap: relative !== full,
  };
}

export function truncateRoadmapExcerpt(
  text: string,
  maxLength = ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH,
): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}\u2026`;
}

function comparePostIds(a: RoadmapTimelinePostInput, b: RoadmapTimelinePostInput): number {
  return a.postId.localeCompare(b.postId);
}

function groupByDateKey(
  posts: RoadmapTimelinePostInput[],
  dateResolver: (post: RoadmapTimelinePostInput) => Date | null,
): RoadmapTimelineGroup[] {
  const buckets = new Map<string | null, RoadmapTimelinePostInput[]>();

  for (const post of posts) {
    const key = toDateKey(dateResolver(post));
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(post);
    } else {
      buckets.set(key, [post]);
    }
  }

  const groups: RoadmapTimelineGroup[] = [];
  for (const [dateKey, items] of buckets.entries()) {
    groups.push({
      dateKey,
      items: [...items].sort(comparePostIds),
    });
  }

  groups.sort((a, b) => {
    if (a.dateKey === null && b.dateKey !== null) return -1;
    if (a.dateKey !== null && b.dateKey === null) return 1;
    if (a.dateKey === null && b.dateKey === null) return 0;
    return a.dateKey!.localeCompare(b.dateKey!);
  });

  return groups;
}

export function buildRoadmapTimeline<T extends RoadmapTimelinePostInput>(
  posts: T[],
): RoadmapTimelineResponse<T> {
  const eligible = posts.filter((post) => isRoadmapTimelineStatus(post.status));

  const pastPosts = eligible.filter((post) => post.status === 'released');
  const futurePosts = eligible.filter((post) => post.status !== 'released');

  const past = groupByDateKey(pastPosts, resolveEffectiveReleaseDate) as RoadmapTimelineGroup<T>[];

  const future: RoadmapTimelineGroup<T>[] = [];
  for (const status of ROADMAP_TIMELINE_FUTURE_STATUS_ORDER) {
    const bandPosts = futurePosts.filter((post) => post.status === status);
    if (bandPosts.length === 0) continue;

    const dated = bandPosts.filter((post) => resolveEffectiveTargetDate(post) !== null);
    const undated = bandPosts.filter((post) => resolveEffectiveTargetDate(post) === null);

    const datedGroups = groupByDateKey(dated, resolveEffectiveTargetDate) as RoadmapTimelineGroup<T>[];
    for (const group of datedGroups) {
      future.push({ ...group, statusBand: status });
    }

    if (undated.length > 0) {
      future.push({
        dateKey: null,
        statusBand: status,
        items: [...undated].sort(comparePostIds) as T[],
      });
    }
  }

  return { past, future };
}

export function getRoadmapTimelineGroupId(
  section: 'past' | 'future',
  index: number,
): string {
  return `${section}-${index}`;
}

export function getAdjacentRoadmapGroupId(
  timeline: RoadmapTimelineResponse,
  currentGroupId: string,
  direction: 'up' | 'down',
): string | null {
  const refs: string[] = [
    ...timeline.past.map((_, index) => getRoadmapTimelineGroupId('past', index)),
    ...timeline.future.map((_, index) => getRoadmapTimelineGroupId('future', index)),
  ];
  const currentIndex = refs.indexOf(currentGroupId);
  if (currentIndex === -1) return null;

  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (nextIndex < 0 || nextIndex >= refs.length) return null;
  return refs[nextIndex] ?? null;
}

export function resolveRoadmapScrollTarget(
  timeline: RoadmapTimelineResponse,
  postId: string,
): { groupId: string; section: 'past' | 'future' } | null {
  for (let index = 0; index < timeline.past.length; index += 1) {
    if (timeline.past[index]!.items.some((item) => item.postId === postId)) {
      return { groupId: getRoadmapTimelineGroupId('past', index), section: 'past' };
    }
  }
  for (let index = 0; index < timeline.future.length; index += 1) {
    if (timeline.future[index]!.items.some((item) => item.postId === postId)) {
      return { groupId: getRoadmapTimelineGroupId('future', index), section: 'future' };
    }
  }
  return null;
}
