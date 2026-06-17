import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  getAdjacentRoadmapGroupId,
  getRoadmapTimelineGroupId,
  resolveRoadmapScrollTarget,
  type RoadmapTimelineGroupResponse,
  type RoadmapTimelineResponseData,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Spinner } from '../Spinner';
import { Alert } from '../Alert';
import { RoadmapTimelineGroupView } from './RoadmapTimelineGroup';
import { RoadmapTodayMarker, RoadmapTimelineFooter } from './RoadmapTodayMarker';

export interface RoadmapTimelineNav {
  navigateUp: () => void;
  navigateDown: () => void;
  jumpToToday: () => void;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
}

export function RoadmapTimeline({ onNavReady }: { onNavReady?: (nav: RoadmapTimelineNav) => void }) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const [searchParams] = useSearchParams();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const didInitialScrollRef = useRef(false);

  const [timeline, setTimeline] = useState<RoadmapTimelineResponseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const activeGroupRef = useRef<string | null>(null);

  const deepLinkPostId = searchParams.get('postId');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await api.feedback.getRoadmapTimeline();
        if (cancelled) return;
        if (res.success && res.data) {
          setTimeline(res.data);
        } else {
          setError(t('about.roadmap.loadError'));
        }
      } catch {
        if (!cancelled) setError(t('about.roadmap.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, t]);

  // Split past groups: items released today should appear after the Today marker
  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { pastBeforeToday, todayPastGroups } = useMemo(() => {
    if (!timeline) return { pastBeforeToday: [], todayPastGroups: [] };

    const withIndices = timeline.past.map((group, index) => ({ group, index }));
    return {
      pastBeforeToday: withIndices.filter(({ group }) => group.dateKey !== todayKey),
      todayPastGroups: withIndices.filter(({ group }) => group.dateKey === todayKey),
    };
  }, [timeline, todayKey]);

  // Scroll tracking: accent progress line + active group detection.
  // The blue line height is proportional to how far the container has been scrolled.
  // ratio = timelineHeight / totalScrollableHeight
  // blueLineHeight = scrollTop * ratio
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    // The page scrolls inside .app-content (overflow-y: auto), not the window.
    // Walk up to find the real scroll container.
    let scrollContainer: HTMLElement | null = null;
    let parent = el.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollContainer = parent;
        break;
      }
      parent = parent.parentElement;
    }

    const getScrollMetrics = () => {
      if (scrollContainer) {
        return {
          scrollTop: scrollContainer.scrollTop,
          totalScrollable: scrollContainer.scrollHeight - scrollContainer.clientHeight,
          viewportMid: scrollContainer.clientHeight / 2,
        };
      }
      return {
        scrollTop: window.scrollY || document.documentElement.scrollTop,
        totalScrollable: document.documentElement.scrollHeight - window.innerHeight,
        viewportMid: window.innerHeight / 2,
      };
    };

    const update = () => {
      const prog = progressRef.current;
      if (!prog) return;

      const { scrollTop, totalScrollable, viewportMid } = getScrollMetrics();
      const timelineHeight = el.offsetHeight;

      if (totalScrollable <= 0) {
        prog.style.height = `${timelineHeight}px`;
      } else {
        const ratio = timelineHeight / totalScrollable;
        const blueHeight = Math.max(0, Math.min(scrollTop * ratio, timelineHeight));
        prog.style.height = `${blueHeight}px`;
      }

      // Track which group is closest to viewport center for keyboard navigation
      const groups = el.querySelectorAll<HTMLElement>('[data-roadmap-group]');
      let closestId: string | null = null;
      let closestDist = Infinity;

      groups.forEach((group) => {
        const groupRect = group.getBoundingClientRect();
        const dist = Math.abs(groupRect.top - viewportMid);
        if (dist < closestDist) {
          closestDist = dist;
          closestId = group.id;
        }
      });

      if (closestId && activeGroupRef.current !== closestId) {
        activeGroupRef.current = closestId;
        setActiveGroupId(closestId);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    const scrollTarget = scrollContainer ?? window;
    scrollTarget.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const timer = setTimeout(onScroll, 100);

    return () => {
      scrollTarget.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timer);
    };
  }, [timeline]);

  useEffect(() => {
    if (!timeline || didInitialScrollRef.current) return;

    const targetPostId = deepLinkPostId;
    const scrollTarget = targetPostId ? resolveRoadmapScrollTarget(timeline, targetPostId) : null;
    const groupId = scrollTarget?.groupId
      ?? (timeline.future[0]
        ? getRoadmapTimelineGroupId('future', 0)
        : todayPastGroups.length > 0
          ? getRoadmapTimelineGroupId('past', todayPastGroups[0]!.index)
          : timeline.past.length > 0
            ? getRoadmapTimelineGroupId('past', timeline.past.length - 1)
            : null);

    requestAnimationFrame(() => {
      if (groupId) {
        document.getElementById(groupId)?.scrollIntoView({ block: 'center' });
        setActiveGroupId(groupId);
      } else {
        document.querySelector('[data-roadmap-today]')?.scrollIntoView({ block: 'center' });
      }

      if (targetPostId) {
        setExpandedPostId(targetPostId);
        setHighlightedPostId(targetPostId);
      }

      didInitialScrollRef.current = true;
    });
  }, [deepLinkPostId, timeline, todayPastGroups]);

  const navigateGroup = useCallback(
    (direction: 'up' | 'down') => {
      if (!timeline || !activeGroupId) return;
      const nextGroupId = getAdjacentRoadmapGroupId(timeline, activeGroupId, direction);
      if (!nextGroupId) return;
      document.getElementById(nextGroupId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setActiveGroupId(nextGroupId);
    },
    [activeGroupId, timeline],
  );

  const jumpToToday = useCallback(() => {
    document.querySelector('[data-roadmap-today]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (!timeline) return;
    const firstTodayPast = todayPastGroups.length > 0
      ? getRoadmapTimelineGroupId('past', todayPastGroups[0]!.index)
      : null;
    const firstFuture = timeline.future[0]
      ? getRoadmapTimelineGroupId('future', 0)
      : null;
    const lastPast = pastBeforeToday.length > 0
      ? getRoadmapTimelineGroupId('past', pastBeforeToday[pastBeforeToday.length - 1]!.index)
      : null;
    setActiveGroupId(firstTodayPast ?? firstFuture ?? lastPast);
  }, [timeline, todayPastGroups, pastBeforeToday]);

  const canNavigateUp = timeline && activeGroupId
    ? getAdjacentRoadmapGroupId(timeline, activeGroupId, 'up') !== null
    : false;
  const canNavigateDown = timeline && activeGroupId
    ? getAdjacentRoadmapGroupId(timeline, activeGroupId, 'down') !== null
    : false;

  useEffect(() => {
    onNavReady?.({
      navigateUp: () => navigateGroup('up'),
      navigateDown: () => navigateGroup('down'),
      jumpToToday,
      canNavigateUp,
      canNavigateDown,
    });
  }, [onNavReady, navigateGroup, jumpToToday, canNavigateUp, canNavigateDown]);

  const togglePost = useCallback((postId: string) => {
    setExpandedPostId((current) => (current === postId ? null : postId));
  }, []);

  if (loading) {
    return (
      <div className="roadmap-timeline-loading">
        <Spinner />
      </div>
    );
  }

  if (error || !timeline) {
    return <Alert variant="error">{error ?? t('about.roadmap.loadError')}</Alert>;
  }

  const isEmpty = timeline.past.length === 0 && timeline.future.length === 0;

  if (isEmpty) {
    return (
      <div className="roadmap-timeline-empty">
        <p>{t('about.roadmap.empty')}</p>
        <RoadmapTimelineFooter />
      </div>
    );
  }

  return (
    <div className="roadmap-timeline" ref={timelineRef}>
      <div className="roadmap-timeline-progress" ref={progressRef} aria-hidden />

      <div className="roadmap-timeline-section roadmap-timeline-section--past">
        {pastBeforeToday.map(({ group, index }: { group: RoadmapTimelineGroupResponse; index: number }) => (
          <RoadmapTimelineGroupView
            key={getRoadmapTimelineGroupId('past', index)}
            group={group}
            section="past"
            index={index}
            expandedPostId={expandedPostId}
            highlightedPostId={highlightedPostId}
            onTogglePost={togglePost}
          />
        ))}
      </div>

      <RoadmapTodayMarker />

      {todayPastGroups.length > 0 && (
        <div className="roadmap-timeline-section roadmap-timeline-section--today">
          {todayPastGroups.map(({ group, index }: { group: RoadmapTimelineGroupResponse; index: number }) => (
            <RoadmapTimelineGroupView
              key={getRoadmapTimelineGroupId('past', index)}
              group={group}
              section="past"
              index={index}
              expandedPostId={expandedPostId}
              highlightedPostId={highlightedPostId}
              onTogglePost={togglePost}
            />
          ))}
        </div>
      )}

      <div className="roadmap-timeline-section roadmap-timeline-section--future">
        {timeline.future.map((group: RoadmapTimelineGroupResponse, index: number) => (
          <RoadmapTimelineGroupView
            key={getRoadmapTimelineGroupId('future', index)}
            group={group}
            section="future"
            index={index}
            expandedPostId={expandedPostId}
            highlightedPostId={highlightedPostId}
            onTogglePost={togglePost}
          />
        ))}
      </div>

      <RoadmapTimelineFooter />
    </div>
  );
}
