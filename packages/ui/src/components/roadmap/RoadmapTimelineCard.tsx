import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ROADMAP_TIMELINE_EXCERPT_MAX_LENGTH,
  shouldShowFeedbackAuthorCredit,
  truncateRoadmapExcerpt,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { Icon } from '../../icons/Icon';
import { Tooltip } from '../Tooltip';

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

  return (
    <Link
      to={`/feedback/${post.postId}`}
      className={[
        'roadmap-timeline-card',
        isCommunityIdea ? 'roadmap-timeline-card--community' : '',
        expanded ? 'roadmap-timeline-card--expanded' : '',
        highlighted ? 'roadmap-timeline-card--highlighted' : '',
        isFocused ? 'roadmap-timeline-card--focused' : '',
      ].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (isTruncated && !(e.metaKey || e.ctrlKey)) {
          const target = e.target as HTMLElement;
          if (!target.closest('.roadmap-timeline-card-footer')) {
            e.preventDefault();
            onToggle();
          }
        }
      }}
    >
      <div className="roadmap-timeline-card-body-area">
        <div className="roadmap-timeline-card-header">
          {isCommunityIdea && (
            <Tooltip content={t('about.roadmap.communityIdeaTooltip')} position="top">
              <span className="roadmap-timeline-card-badge roadmap-timeline-card-badge--community">
                {t('about.roadmap.communityIdea')}
              </span>
            </Tooltip>
          )}
          <span className={`feedback-status-badge feedback-status-${post.status}`}>
            {t(`feedback.statuses.${post.status}`)}
          </span>
          {isCommunityIdea && post.upvoteCount > 0 && (
            <Tooltip content={t('about.roadmap.upvoteTooltip', { count: post.upvoteCount })} position="top">
              <span className="roadmap-timeline-card-upvotes">
                <Icon name="thumbsUp" size="xs" />
                {post.upvoteCount}
              </span>
            </Tooltip>
          )}
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
        <span className="roadmap-timeline-card-comments-count">
          {t('about.roadmap.commentCount', { count: post.commentCount })}
        </span>
      </div>
      <span className="roadmap-timeline-card-see-more" aria-hidden>
        {t('about.roadmap.seeMore')}
      </span>
    </Link>
  );
}
