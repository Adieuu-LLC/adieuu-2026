import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
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
  const body = expanded ? post.description : excerpt;
  const showBody = body.length > 0;

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
      <button type="button" className="roadmap-timeline-card-toggle" onClick={onToggle}>
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
          <p className="roadmap-timeline-card-excerpt">{body}</p>
        )}
      </button>
      <div className="roadmap-timeline-card-footer">
        <Link to={`/feedback/${post.postId}`} className="roadmap-timeline-card-comments-link">
          {t('about.roadmap.viewComments', { count: post.commentCount })}
        </Link>
      </div>
    </article>
  );
}
