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

  useEffect(() => {
    if (!timeline || didInitialScrollRef.current) return;

    const targetPostId = deepLinkPostId;
    const scrollTarget = targetPostId ? resolveRoadmapScrollTarget(timeline, targetPostId) : null;
    const groupId = scrollTarget?.groupId
      ?? (timeline.future[0]
        ? getRoadmapTimelineGroupId('future', 0)
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
  }, [deepLinkPostId, timeline]);

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
    const firstFuture = timeline.future[0]
      ? getRoadmapTimelineGroupId('future', 0)
      : null;
    const lastPast = timeline.past.length > 0
      ? getRoadmapTimelineGroupId('past', timeline.past.length - 1)
      : null;
    setActiveGroupId(firstFuture ?? lastPast);
  }, [timeline]);

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
    <div className="roadmap-timeline">
      <div className="roadmap-timeline-section roadmap-timeline-section--past">
        {timeline.past.map((group: RoadmapTimelineGroupResponse, index: number) => (
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
