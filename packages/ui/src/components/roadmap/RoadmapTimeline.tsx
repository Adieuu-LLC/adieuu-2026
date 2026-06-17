import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
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
  const [canNavigateUp, setCanNavigateUp] = useState(false);
  const [canNavigateDown, setCanNavigateDown] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const activeGroupRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const blueHeightRef = useRef(0);
  const canNavRef = useRef({ up: false, down: false });

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

  const todayKey = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { pastBeforeToday, todayPastGroups } = useMemo(() => {
    if (!timeline) return { pastBeforeToday: [], todayPastGroups: [] };

    const withIndices = timeline.past.map((group, index) => ({ group, index }));
    return {
      pastBeforeToday: withIndices.filter(({ group }) => group.dateKey !== todayKey),
      todayPastGroups: withIndices.filter(({ group }) => group.dateKey === todayKey),
    };
  }, [timeline, todayKey]);

  // Scroll tracking: accent progress line, passed/focused dot states.
  // blueHeight = scrollTop * (timelineHeight / totalScrollable)
  // A dot is "passed" when blueHeight >= its offsetTop within the timeline.
  // The "focused" dot is the one closest to blueHeight.
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

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
    scrollContainerRef.current = scrollContainer;

    const getScrollTop = () =>
      scrollContainer
        ? scrollContainer.scrollTop
        : (window.scrollY || document.documentElement.scrollTop);

    const getTotalScrollable = () =>
      scrollContainer
        ? scrollContainer.scrollHeight - scrollContainer.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;

    const update = () => {
      const prog = progressRef.current;
      if (!prog) return;

      const scrollTop = getScrollTop();
      const totalScrollable = getTotalScrollable();
      const timelineHeight = el.offsetHeight;

      let blueHeight: number;
      if (totalScrollable <= 0) {
        blueHeight = timelineHeight;
      } else {
        const ratio = timelineHeight / totalScrollable;
        blueHeight = Math.max(0, Math.min(scrollTop * ratio, timelineHeight));
      }
      prog.style.height = `${blueHeight}px`;
      blueHeightRef.current = blueHeight;

      // Compute per-marker state from blueHeight
      const groups = el.querySelectorAll<HTMLElement>('[data-roadmap-group]');
      let focusedEl: HTMLElement | null = null;
      let focusedDist = Infinity;
      let focusedIdx = -1;
      let idx = 0;

      groups.forEach((group) => {
        const marker = group.querySelector<HTMLElement>('.roadmap-timeline-marker');
        if (!marker) { idx++; return; }

        const markerTop = group.offsetTop + marker.offsetTop;
        const isPassed = blueHeight >= markerTop;
        const dist = Math.abs(blueHeight - markerTop);

        group.classList.toggle('roadmap-timeline-group--passed', isPassed);
        group.classList.remove('roadmap-timeline-group--focused');

        if (dist < focusedDist) {
          focusedDist = dist;
          focusedEl = group;
          focusedIdx = idx;
        }
        idx++;
      });

      if (focusedEl) {
        (focusedEl as HTMLElement).classList.add('roadmap-timeline-group--focused');
        const id = (focusedEl as HTMLElement).id;
        if (activeGroupRef.current !== id) {
          activeGroupRef.current = id;
          setActiveGroupId(id);
        }
      }

      const totalGroups = groups.length;
      const newCanUp = focusedIdx > 0;
      const newCanDown = focusedIdx >= 0 && focusedIdx < totalGroups - 1;
      if (canNavRef.current.up !== newCanUp || canNavRef.current.down !== newCanDown) {
        canNavRef.current = { up: newCanUp, down: newCanDown };
        setCanNavigateUp(newCanUp);
        setCanNavigateDown(newCanDown);
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

  // Navigation: up/down move to adjacent markers relative to the blue line tip.
  // Down = next marker after the focused one (extends the blue line forward).
  // Up = previous marker before the focused one (shortens the blue line back).
  const navigateGroup = useCallback(
    (direction: 'up' | 'down') => {
      const el = timelineRef.current;
      if (!el) return;

      const groups = el.querySelectorAll<HTMLElement>('[data-roadmap-group]');
      const offsets: number[] = [];

      groups.forEach((group) => {
        const marker = group.querySelector<HTMLElement>('.roadmap-timeline-marker');
        if (!marker) return;
        offsets.push(group.offsetTop + marker.offsetTop);
      });

      if (offsets.length === 0) return;

      const blueHeight = blueHeightRef.current;
      let focusedIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < offsets.length; i++) {
        const dist = Math.abs(offsets[i]! - blueHeight);
        if (dist < bestDist) {
          bestDist = dist;
          focusedIdx = i;
        }
      }

      const targetIdx = direction === 'down' ? focusedIdx + 1 : focusedIdx - 1;
      if (targetIdx < 0 || targetIdx >= offsets.length) return;

      const targetOffset = offsets[targetIdx]!;
      const timelineHeight = el.offsetHeight;
      const container = scrollContainerRef.current;
      const totalScrollable = container
        ? container.scrollHeight - container.clientHeight
        : document.documentElement.scrollHeight - window.innerHeight;

      if (totalScrollable <= 0) return;

      const targetScrollTop = (targetOffset / timelineHeight) * totalScrollable;

      if (container) {
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    },
    [],
  );

  const jumpToToday = useCallback(() => {
    document.querySelector('[data-roadmap-today]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

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
