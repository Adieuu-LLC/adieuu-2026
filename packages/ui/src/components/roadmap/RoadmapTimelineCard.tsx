import { type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH,
  shouldShowFeedbackAuthorCredit,
  truncateRoadmapExcerpt,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { FeedbackAuthorLink } from '../FeedbackAuthorLink';

export function RoadmapTimelineCard({
  post,
  expanded,
  highlighted,
  onToggle,
}: {
  post: PublicFeedbackPost;
  expanded: boolean;
  highlighted?: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const showAuthorCredit = shouldShowFeedbackAuthorCredit(post);
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
        showAuthorCredit ? 'roadmap-timeline-card--community' : '',
        post.isRoadmapOfficial ? 'roadmap-timeline-card--team' : '',
        expanded ? 'roadmap-timeline-card--expanded' : '',
        highlighted ? 'roadmap-timeline-card--highlighted' : '',
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
          {post.isRoadmapOfficial ? (
            <span className="roadmap-timeline-card-label">{t('about.roadmap.teamRoadmap')}</span>
          ) : showAuthorCredit ? (
            <span className="roadmap-timeline-card-label roadmap-timeline-card-label--community">
              <span>{t('about.roadmap.suggestedBy')}</span>{' '}
              <FeedbackAuthorLink author={post.author} layout="inline" />
            </span>
          ) : null}
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
