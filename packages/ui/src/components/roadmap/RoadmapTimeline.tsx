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
import { RoadmapTimelineFooter } from './RoadmapTodayMarker';

export interface RoadmapTimelineNav {
  navigateUp: () => void;
  navigateDown: () => void;
  jumpToLatest: () => void;
  canNavigateUp: boolean;
  canNavigateDown: boolean;
}

function getTimelineContentOffset(
  el: HTMLElement,
  scrollContainer: HTMLElement | null,
): number {
  const elRect = el.getBoundingClientRect();
  if (scrollContainer) {
    const containerRect = scrollContainer.getBoundingClientRect();
    return elRect.top - containerRect.top + scrollContainer.scrollTop;
  }
  return elRect.top + window.scrollY;
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

  // The latest release is the last past group (past is sorted ascending by date).
  // Items from today appear as regular past groups — no separate "Today" marker.
  const latestReleaseIndex = useMemo(() => {
    if (!timeline || timeline.past.length === 0) return -1;
    return timeline.past.length - 1;
  }, [timeline]);

  const latestReleaseGroupId = useMemo(
    () => latestReleaseIndex >= 0 ? getRoadmapTimelineGroupId('past', latestReleaseIndex) : null,
    [latestReleaseIndex],
  );

  // Scroll tracking: accent progress line, passed/focused dot states.
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

      // --- Reads first (batched) to avoid layout thrash ---
      const scrollTop = getScrollTop();
      const totalScrollable = getTotalScrollable();
      const timelineHeight = el.offsetHeight;

      let blueHeight: number;
      if (totalScrollable <= 0) {
        blueHeight = timelineHeight;
      } else {
        const timelineOffset = getTimelineContentOffset(el, scrollContainer);
        const relativeScrollTop = Math.max(0, scrollTop - timelineOffset);
        const ratio = timelineHeight / totalScrollable;
        blueHeight = Math.max(0, Math.min(relativeScrollTop * ratio, timelineHeight));
      }

      const groups = el.querySelectorAll<HTMLElement>('[data-roadmap-group]');
      const groupMeta: { group: HTMLElement; markerTop: number }[] = [];
      groups.forEach((group) => {
        const marker = group.querySelector<HTMLElement>('.roadmap-timeline-marker');
        if (!marker) return;
        groupMeta.push({ group, markerTop: group.offsetTop + marker.offsetTop });
      });

      // --- Writes ---
      // Progress line is full-height; scaleY keeps it on the compositor (no layout).
      prog.style.transform = `scaleY(${timelineHeight > 0 ? blueHeight / timelineHeight : 0})`;
      blueHeightRef.current = blueHeight;

      let focusedEl: HTMLElement | null = null;
      let focusedDist = Infinity;
      let focusedMetaIdx = -1;

      groupMeta.forEach(({ group, markerTop }, metaIdx) => {
        const isPassed = blueHeight >= markerTop;
        const dist = Math.abs(blueHeight - markerTop);

        group.classList.toggle('roadmap-timeline-group--passed', isPassed);
        group.classList.remove('roadmap-timeline-group--focused');

        if (dist < focusedDist) {
          focusedDist = dist;
          focusedEl = group;
          focusedMetaIdx = metaIdx;
        }
      });

      if (focusedEl) {
        (focusedEl as HTMLElement).classList.add('roadmap-timeline-group--focused');
        const id = (focusedEl as HTMLElement).id;
        if (activeGroupRef.current !== id) {
          activeGroupRef.current = id;
          setActiveGroupId(id);
        }
      }

      const totalGroups = groupMeta.length;
      const newCanUp = focusedMetaIdx > 0;
      const newCanDown = focusedMetaIdx >= 0 && focusedMetaIdx < totalGroups - 1;
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

  // Initial scroll: jump to deep-linked post, or scroll so the blue line
  // sits at the latest release group.
  useEffect(() => {
    if (!timeline || didInitialScrollRef.current) return;

    const targetPostId = deepLinkPostId;
    const scrollTarget = targetPostId ? resolveRoadmapScrollTarget(timeline, targetPostId) : null;

    requestAnimationFrame(() => {
      const el = timelineRef.current;
      const container = scrollContainerRef.current;

      if (scrollTarget?.groupId) {
        document.getElementById(scrollTarget.groupId)?.scrollIntoView({ block: 'center' });
      } else if (latestReleaseGroupId && el) {
        // Scroll so the blue line lands on the latest release marker
        const groupEl = document.getElementById(latestReleaseGroupId);
        const marker = groupEl?.querySelector<HTMLElement>('.roadmap-timeline-marker');
        if (groupEl && marker) {
          const markerTop = groupEl.offsetTop + marker.offsetTop;
          const timelineHeight = el.offsetHeight;
          const totalScrollable = container
            ? container.scrollHeight - container.clientHeight
            : document.documentElement.scrollHeight - window.innerHeight;

          if (totalScrollable > 0 && timelineHeight > 0) {
            const timelineOffset = getTimelineContentOffset(el, container);
            const targetScrollTop = timelineOffset + (markerTop / timelineHeight) * totalScrollable;
            if (container) {
              container.scrollTop = targetScrollTop;
            } else {
              window.scrollTo({ top: targetScrollTop });
            }
          } else {
            groupEl.scrollIntoView({ block: 'center' });
          }
        }
      }

      if (targetPostId) {
        setExpandedPostId(targetPostId);
        setHighlightedPostId(targetPostId);
      }

      didInitialScrollRef.current = true;
    });
  }, [deepLinkPostId, timeline, latestReleaseGroupId]);

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

      const timelineOffset = getTimelineContentOffset(el, container);
      const targetScrollTop = timelineOffset + (targetOffset / timelineHeight) * totalScrollable;

      if (container) {
        container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      } else {
        window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      }
    },
    [],
  );

  const jumpToLatest = useCallback(() => {
    if (!latestReleaseGroupId) return;
    const el = timelineRef.current;
    const container = scrollContainerRef.current;
    if (!el) return;

    const groupEl = document.getElementById(latestReleaseGroupId);
    const marker = groupEl?.querySelector<HTMLElement>('.roadmap-timeline-marker');
    if (!groupEl || !marker) return;

    const markerTop = groupEl.offsetTop + marker.offsetTop;
    const timelineHeight = el.offsetHeight;
    const totalScrollable = container
      ? container.scrollHeight - container.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;

    if (totalScrollable <= 0) return;

    const timelineOffset = getTimelineContentOffset(el, container);
    const targetScrollTop = timelineOffset + (markerTop / timelineHeight) * totalScrollable;
    if (container) {
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    }
  }, [latestReleaseGroupId]);

  useEffect(() => {
    onNavReady?.({
      navigateUp: () => navigateGroup('up'),
      navigateDown: () => navigateGroup('down'),
      jumpToLatest,
      canNavigateUp,
      canNavigateDown,
    });
  }, [onNavReady, navigateGroup, jumpToLatest, canNavigateUp, canNavigateDown]);

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
        {timeline.past.map((group: RoadmapTimelineGroupResponse, index: number) => (
          <RoadmapTimelineGroupView
            key={getRoadmapTimelineGroupId('past', index)}
            group={group}
            section="past"
            index={index}
            isLatestRelease={index === latestReleaseIndex}
            isFocused={getRoadmapTimelineGroupId('past', index) === activeGroupId}
            expandedPostId={expandedPostId}
            highlightedPostId={highlightedPostId}
            onTogglePost={togglePost}
          />
        ))}
      </div>

      <div className="roadmap-timeline-section roadmap-timeline-section--future">
        {timeline.future.map((group: RoadmapTimelineGroupResponse, index: number) => (
          <RoadmapTimelineGroupView
            key={getRoadmapTimelineGroupId('future', index)}
            group={group}
            section="future"
            index={index}
            isFocused={getRoadmapTimelineGroupId('future', index) === activeGroupId}
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
