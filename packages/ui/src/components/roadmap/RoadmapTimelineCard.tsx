import { type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH,
  shouldShowFeedbackAuthorCredit,
  truncateRoadmapExcerpt,
  type PublicFeedbackPost,
} from '@adieuu/shared';

export function RoadmapTimelineCard({
  post,
  expanded,
  highlighted,
  isFocused,
  onToggle,
}: {
  post: PublicFeedbackPost;
  expanded: boolean;
  highlighted?: boolean;
  isFocused?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const isCommunityIdea = shouldShowFeedbackAuthorCredit(post);
  const excerpt = truncateRoadmapExcerpt(post.description);
  const isTruncated = post.description.length > ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH;
  const body = expanded ? post.description : excerpt;
  const showBody = body.length > 0;

  const handleToggleClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) return;
    onToggle();
  };

  const handleToggleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <article
      className={[
        'roadmap-timeline-card',
        isCommunityIdea ? 'roadmap-timeline-card--community' : '',
        expanded ? 'roadmap-timeline-card--expanded' : '',
        highlighted ? 'roadmap-timeline-card--highlighted' : '',
        isFocused ? 'roadmap-timeline-card--focused' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="roadmap-timeline-card-toggle"
        role="button"
        tabIndex={0}
        onClick={handleToggleClick}
        onKeyDown={handleToggleKeyDown}
      >
        <div className="roadmap-timeline-card-header">
          {isCommunityIdea && (
            <span className="roadmap-timeline-card-badge roadmap-timeline-card-badge--community">
              {t('about.roadmap.communityIdea')}
            </span>
          )}
          <span className={`feedback-status-badge feedback-status-${post.status}`}>
            {t(`feedback.statuses.${post.status}`)}
          </span>
        </div>
        <h3 className="roadmap-timeline-card-title">{post.title}</h3>
        {showBody && (
          <div className={`roadmap-timeline-card-body${!expanded && isTruncated ? ' roadmap-timeline-card-body--truncated' : ''}`}>
            <p className="roadmap-timeline-card-excerpt">{body}</p>
          </div>
        )}
        {isTruncated && (
          <span className="roadmap-timeline-card-expand-hint">
            {expanded ? t('about.roadmap.showLess') : t('about.roadmap.readMore')}
          </span>
        )}
      </div>
      <div className="roadmap-timeline-card-footer">
        <Link to={`/feedback/${post.postId}`} className="roadmap-timeline-card-comments-link">
          {t('about.roadmap.viewComments', { count: post.commentCount })}
        </Link>
      </div>
    </article>
  );
}
