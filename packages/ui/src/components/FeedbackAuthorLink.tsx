import type { MouseEvent, ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { FeedbackAuthor, PublicIdentity } from '@adieuu/shared';
import { Avatar } from './Avatar';
import { IdentityHoverCard } from './IdentityHoverCard';
import { useIdentity } from '../hooks/useIdentity';

function feedbackAuthorToPublicIdentity(author: FeedbackAuthor): PublicIdentity {
  return {
    id: author.identityId,
    username: author.username,
    displayName: author.displayName,
    avatarUrl: author.avatarUrl,
    lastActiveAt: new Date(0).toISOString(),
    isDeleted: false,
  };
}

type FeedbackAuthorLinkLayout = 'post-detail' | 'post-list' | 'comment' | 'inline';

interface FeedbackAuthorLinkProps {
  author: FeedbackAuthor;
  layout: FeedbackAuthorLinkLayout;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function FeedbackAuthorLink({
  author,
  layout,
  onClick,
}: FeedbackAuthorLinkProps): ReactElement {
  const { t } = useTranslation();
  const { status: identityStatus } = useIdentity();
  const identity = feedbackAuthorToPublicIdentity(author);
  const profilePath = `/identity/${author.identityId}`;
  const showHoverCard = identityStatus === 'logged_in';

  const linkContent =
    layout === 'comment' ? (
      <>
        <Avatar src={author.avatarUrl} name={author.displayName} size="sm" />
        <span className="feedback-comment-author">{author.displayName}</span>
      </>
    ) : layout === 'inline' ? (
      <span className="feedback-author-link-inline-text">{author.displayName}</span>
    ) : (
      <>
        <Avatar src={author.avatarUrl} name={author.displayName} size="sm" />
        <span>{t('feedback.authorLabel', { username: author.username })}</span>
      </>
    );

  const authorLink = (
    <Link
      to={profilePath}
      className={`feedback-author-link feedback-author-link--${layout}`}
      onClick={onClick}
    >
      {linkContent}
    </Link>
  );

  if (!showHoverCard) {
    return authorLink;
  }

  return (
    <IdentityHoverCard
      identity={identity}
      positioning={{ placement: 'bottom-start', gutter: 8 }}
    >
      {authorLink}
    </IdentityHoverCard>
  );
}
