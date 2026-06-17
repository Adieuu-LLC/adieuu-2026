import { useTranslation } from 'react-i18next';
import {
  getRoadmapTimelineGroupId,
  type FeedbackStatus,
  type PublicFeedbackPost,
  type RoadmapTimelineGroupResponse,
} from '@adieuu/shared';
import { RoadmapTimelineCard } from './RoadmapTimelineCard';
import { RoadmapHorizontalRow } from './RoadmapHorizontalRow';
import { RoadmapTimelineDateLabel } from './RoadmapTimelineDateLabel';

export function RoadmapTimelineGroupView({
  group,
  section,
  index,
  expandedPostId,
  highlightedPostId,
  onTogglePost,
}: {
  group: RoadmapTimelineGroupResponse;
  section: 'past' | 'future';
  index: number;
  expandedPostId: string | null;
  highlightedPostId: string | null;
  onTogglePost: (postId: string) => void;
}) {
  const { t } = useTranslation();
  const groupId = getRoadmapTimelineGroupId(section, index);

  const label = group.dateKey ? (
    <RoadmapTimelineDateLabel dateKey={group.dateKey} />
  ) : (
    <div className="roadmap-timeline-group-label">
      {group.statusBand
        ? t('about.roadmap.undatedBand', { status: t(`feedback.statuses.${group.statusBand as FeedbackStatus}`) })
        : t('about.roadmap.undatedReleased')}
    </div>
  );

  return (
    <section
      id={groupId}
      className={`roadmap-timeline-group roadmap-timeline-group--${section}`}
      data-roadmap-group={groupId}
    >
      <span className="roadmap-timeline-marker" aria-hidden />
      <div className="roadmap-timeline-group-content">
        {label}
        <RoadmapHorizontalRow>
          {group.items.map((post: PublicFeedbackPost) => (
            <RoadmapTimelineCard
              key={post.postId}
              post={post}
              expanded={expandedPostId === post.postId}
              highlighted={highlightedPostId === post.postId}
              onToggle={() => onTogglePost(post.postId)}
            />
          ))}
        </RoadmapHorizontalRow>
      </div>
    </section>
  );
}
