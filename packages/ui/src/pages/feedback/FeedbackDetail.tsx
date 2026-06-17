import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_COMMENT_LENGTH,
  createApiClient,
  excerptFeedbackComment,
  isRoadmapTimelineStatus,
  shouldShowFeedbackAuthorCredit,
  type FeedbackLinkType,
  type FeedbackStatus,
  type PublicFeedbackComment,
  type PublicFeedbackPost,
  type RelatedFeedbackPost,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { Icon } from '../../icons/Icon';
import { LinkPostModal } from '../../components/LinkPostModal';
import { FeedbackAuthorLink } from '../../components/FeedbackAuthorLink';
import { useFeedbackParticipation } from '../../hooks/useFeedbackParticipation';
import { useIdentity } from '../../hooks/useIdentity';
import { useToast } from '../../components/Toast';

function CommentParentQuote({
  authorDisplayName,
  bodyExcerpt,
}: {
  authorDisplayName: string;
  bodyExcerpt: string;
}) {
  return (
    <blockquote className="feedback-comment-quote">
      <cite className="feedback-comment-quote-author">{authorDisplayName}</cite>
      <p className="feedback-comment-quote-body">{bodyExcerpt}</p>
    </blockquote>
  );
}

function LinkCommentBody({
  comment,
}: {
  comment: PublicFeedbackComment;
}) {
  const { t } = useTranslation();

  if (!comment.linkType || !comment.linkedPostId || !comment.linkedPostTitle) {
    return <p className="feedback-comment-body">{comment.body}</p>;
  }

  const isReciprocal = comment.linkDirection === 'inbound';
  const linkDescription = t(
    isReciprocal
      ? `feedback.reciprocalByLabel.${comment.linkType}`
      : `feedback.relatedByLabel.${comment.linkType}`,
  );

  return (
    <p className="feedback-comment-body feedback-comment-body--link">
      <Icon name="link" />
      <span>
        {isReciprocal ? (
          <>
            <FeedbackAuthorLink author={comment.author} layout="inline" />
            {t('feedback.linkCommentReciprocalSuggested')}
            <Link to={`/feedback/${comment.linkedPostId}`} className="feedback-comment-link">
              {comment.linkedPostTitle}
            </Link>{' '}
            {linkDescription}
          </>
        ) : (
          <>
            <FeedbackAuthorLink author={comment.author} layout="inline" />
            {' '}
            {t('feedback.linkCommentBodySuffix', { linkDescription })}{' '}
            <Link to={`/feedback/${comment.linkedPostId}`} className="feedback-comment-link">
              {comment.linkedPostTitle}
            </Link>
          </>
        )}
      </span>
    </p>
  );
}

export function FeedbackDetail() {
  const { postId } = useParams<{ postId: string }>();

  useEffect(() => {
    document.querySelector('.app-content')?.scrollTo(0, 0);
  }, [postId]);

  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { canParticipate, requireIdentitySession } = useFeedbackParticipation();
  const { status: identityStatus, identity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const currentIdentityId = identityStatus === 'logged_in' ? identity?.id ?? null : null;

  const [post, setPost] = useState<PublicFeedbackPost | null>(null);
  const [comments, setComments] = useState<PublicFeedbackComment[]>([]);
  const [relatedPosts, setRelatedPosts] = useState<RelatedFeedbackPost[]>([]);
  const [canManageStatus, setCanManageStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkSubmitting, setLinkSubmitting] = useState(false);
  const [relatedPostsExpanded, setRelatedPostsExpanded] = useState(false);
  const [commentFilter, setCommentFilter] = useState<'all' | 'op' | 'staff'>('all');
  const [commentSort, setCommentSort] = useState<'oldest' | 'newest'>('oldest');

  const commentRemaining = MAX_FEEDBACK_COMMENT_LENGTH - comment.length;
  const replyRemaining = MAX_FEEDBACK_COMMENT_LENGTH - replyBody.length;

  const commentFilterCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'all', label: t('feedback.commentFilterAll') },
          { value: 'op', label: t('feedback.commentFilterOp') },
          { value: 'staff', label: t('feedback.commentFilterStaff') },
        ],
      }),
    [t],
  );

  const commentSortCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { value: 'oldest', label: t('feedback.commentSortOldest') },
          { value: 'newest', label: t('feedback.commentSortNewest') },
        ],
      }),
    [t],
  );

  const displayedComments = useMemo(() => {
    let filtered = comments;
    if (commentFilter === 'op' && post) {
      filtered = comments.filter(
        (commentItem) => commentItem.author.identityId === post.author.identityId,
      );
    } else if (commentFilter === 'staff') {
      filtered = comments.filter(
        (commentItem) =>
          commentItem.responseLabel === 'dev_response' ||
          commentItem.responseLabel === 'staff_response',
      );
    }

    return [...filtered].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return commentSort === 'oldest' ? aTime - bTime : bTime - aTime;
    });
  }, [comments, commentFilter, commentSort, post]);

  const statusCollection = useMemo(
    () =>
      createListCollection({
        items: FEEDBACK_STATUSES.map((s) => ({
          value: s,
          label: t(`feedback.statuses.${s}`),
        })),
      }),
    [t],
  );

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.feedback.getPost(postId);
      if (res.success && res.data) {
        setPost(res.data.post);
        setComments(res.data.comments ?? []);
        setRelatedPosts(res.data.relatedPosts ?? []);
        setCanManageStatus(res.data.canManageStatus ?? false);
      } else {
        setError(t('feedback.notFound'));
      }
    } catch (err) {
      console.error('[FeedbackDetail] load failed', err);
      setError(t('feedback.notFound'));
    } finally {
      setLoading(false);
    }
  }, [api, postId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUpvote = useCallback(async () => {
    if (!post) return;
    if (currentIdentityId && post.author.identityId === currentIdentityId) return;
    if (!requireIdentitySession()) {
      toast.info(t('feedback.loginToVote'));
      return;
    }
    try {
      const res = post.hasUpvoted
        ? await api.feedback.removeUpvote(post.postId)
        : await api.feedback.upvotePost(post.postId);

      if (res.success && res.data) {
        setPost((prev) =>
          prev
            ? { ...prev, upvoteCount: res.data!.upvoteCount, hasUpvoted: res.data!.hasUpvoted }
            : prev,
        );
        return;
      }
      toast.error(res.error?.message ?? t('feedback.upvoteError'));
    } catch {
      toast.error(t('feedback.upvoteError'));
    }
  }, [api, currentIdentityId, post, requireIdentitySession, t, toast]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postId || !comment.trim()) return;
    if (!requireIdentitySession()) {
      toast.info(t('feedback.loginToComment'));
      return;
    }

    setSubmitting(true);
    setCommentError(null);
    try {
      const res = await api.feedback.addComment(postId, { body: comment.trim() });

      if (res.success && res.data) {
        setComment('');
        setComments((prev) => [...prev, res.data!]);
        setPost((prev) =>
          prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev,
        );
        return;
      }

      setCommentError(t('feedback.commentError'));
    } catch (err) {
      console.error('[FeedbackDetail] addComment failed', err);
      setCommentError(t('feedback.commentError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (e: React.FormEvent, parentComment: PublicFeedbackComment) => {
    e.preventDefault();
    if (!postId || !replyBody.trim()) return;
    if (!requireIdentitySession()) {
      toast.info(t('feedback.loginToComment'));
      return;
    }

    setReplySubmitting(true);
    setReplyError(null);
    try {
      const res = await api.feedback.addComment(postId, {
        body: replyBody.trim(),
        parentCommentId: parentComment.id,
      });

      if (res.success && res.data) {
        setReplyBody('');
        setReplyingToId(null);
        setComments((prev) => [...prev, res.data!]);
        setPost((prev) =>
          prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev,
        );
        return;
      }

      setReplyError(t('feedback.commentError'));
    } catch (err) {
      console.error('[FeedbackDetail] addReply failed', err);
      setReplyError(t('feedback.commentError'));
    } finally {
      setReplySubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: FeedbackStatus) => {
    if (!postId || !post) return;
    setStatusUpdating(true);
    try {
      const res = await api.feedback.updateStatus(postId, { status: newStatus });

      if (res.success) {
        setPost({ ...post, status: newStatus });
        return;
      }

      toast.error(t('feedback.statusUpdateError'));
    } catch (err) {
      console.error('[FeedbackDetail] updateStatus failed', err);
      toast.error(t('feedback.statusUpdateError'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleLinkPost = async (linkedPostId: string, linkType: FeedbackLinkType) => {
    if (!postId) return;
    if (!requireIdentitySession()) {
      toast.info(t('feedback.loginToComment'));
      return;
    }

    setLinkSubmitting(true);
    try {
      const res = await api.feedback.addComment(postId, { linkedPostId, linkType });

      if (res.success && res.data) {
        setLinkModalOpen(false);
        setComments((prev) => [...prev, res.data!]);
        setPost((prev) =>
          prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev,
        );

        const linkedTitle = res.data.linkedPostTitle;
        if (linkedTitle) {
          setRelatedPosts((prev) => {
            if (prev.some((entry) => entry.postId === linkedPostId)) {
              return prev;
            }
            return [
              ...prev,
              {
                postId: linkedPostId,
                title: linkedTitle,
                linkType,
                suggestedBy: res.data!.author,
              },
            ];
          });
        }
        return;
      }

      toast.error(t('feedback.linkPostError'));
    } catch (err) {
      console.error('[FeedbackDetail] linkPost failed', err);
      toast.error(t('feedback.linkPostError'));
    } finally {
      setLinkSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="page-content feedback-page feedback-loading-page">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="page-content feedback-page">
        <div className="container">
          <Alert variant="error">{error ?? t('feedback.notFound')}</Alert>
          <Link to="/feedback" className="feedback-back-link">
            {t('feedback.backToList')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content feedback-page">
      <div className="container">
        <Link to="/feedback" className="feedback-back-link">
          {t('feedback.backToList')}
        </Link>

        <Card variant="elevated" className="feedback-detail-card">
          <div className="feedback-detail-header">
            <div className="feedback-detail-badges">
              <span className={`feedback-category-badge feedback-category-${post.category}`}>
                {t(`feedback.categories.${post.category}`)}
              </span>
              <span className={`feedback-status-badge feedback-status-${post.status}`}>
                {t(`feedback.statuses.${post.status}`)}
              </span>
            </div>

            {currentIdentityId === post.author.identityId ? (
              <div
                className="feedback-upvote-btn feedback-upvote-btn--large feedback-upvote-btn--readonly"
                aria-label={t('feedback.upvoteCount', { count: post.upvoteCount })}
              >
                <Icon name="plus" />
                <span className="feedback-upvote-count">{post.upvoteCount}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`feedback-upvote-btn feedback-upvote-btn--large ${post.hasUpvoted ? 'feedback-upvote-btn--active' : ''}`}
                onClick={() => void handleUpvote()}
                aria-label={t('feedback.upvoteButton')}
              >
                <Icon name="plus" />
                <span className="feedback-upvote-count">{post.upvoteCount}</span>
              </button>
            )}
          </div>

          <h1 className="feedback-detail-title">{post.title}</h1>

          <div className="feedback-detail-author">
            {shouldShowFeedbackAuthorCredit(post) && (
              <FeedbackAuthorLink author={post.author} layout="post-detail" />
            )}
            {isRoadmapTimelineStatus(post.status) && (
              <Link
                to={`/about/roadmap?postId=${encodeURIComponent(post.postId)}`}
                className="feedback-timeline-link"
              >
                {t('feedback.viewInTimeline')}
              </Link>
            )}
          </div>

          <div className="feedback-detail-body">
            {post.description.length > 0 ? <p>{post.description}</p> : null}
          </div>

          {post.attachments.length > 0 && (
            <div className="feedback-attachment-gallery">
              {post.attachments.map((att) => (
                <a
                  key={att.mediaId}
                  href={att.cdnUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="feedback-gallery-item"
                >
                  <img src={att.cdnUrl} alt="" />
                </a>
              ))}
            </div>
          )}

          {canParticipate && (
            <button
              type="button"
              className="feedback-link-post-trigger"
              onClick={() => setLinkModalOpen(true)}
            >
              <Icon name="link" />
              {t('feedback.linkPost')}
            </button>
          )}

          {canManageStatus && (
            <div className="feedback-status-admin">
              <label className="input-label">{t('feedback.changeStatus')}</label>
              <Select.Root
                collection={statusCollection}
                value={[post.status]}
                disabled={statusUpdating}
                onValueChange={(d) => {
                  const next = d.value[0] as FeedbackStatus | undefined;
                  if (next && next !== post.status) {
                    void handleStatusChange(next);
                  }
                }}
              >
                <Select.Control className="report-select-control">
                  <Select.Trigger className="report-select-trigger">
                    <Select.ValueText />
                  </Select.Trigger>
                </Select.Control>
                <Portal>
                  <Select.Positioner>
                    <Select.Content className="report-select-content">
                      {statusCollection.items.map((item) => (
                        <Select.Item key={item.value} item={item} className="report-select-item">
                          <Select.ItemText>{item.label}</Select.ItemText>
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Portal>
              </Select.Root>
            </div>
          )}
        </Card>

        {relatedPosts.length > 0 && (
          <Card variant="elevated" className="feedback-related-posts-card">
            <button
              type="button"
              className="feedback-related-posts-header"
              onClick={() => setRelatedPostsExpanded((expanded) => !expanded)}
              aria-expanded={relatedPostsExpanded}
            >
              <span>{t('feedback.relatedPostsHeader', { count: relatedPosts.length })}</span>
              <Icon name={relatedPostsExpanded ? 'chevronUp' : 'chevronDown'} size="xs" />
            </button>

            {relatedPostsExpanded && (
              <ul className="feedback-related-posts-list">
                {relatedPosts.map((relatedPost) => (
                  <li key={relatedPost.postId} className="feedback-related-posts-item">
                    <Link to={`/feedback/${relatedPost.postId}`} className="feedback-related-posts-title">
                      {relatedPost.title}
                    </Link>
                    <span className={`feedback-link-type-badge feedback-link-type-badge--${relatedPost.linkType}`}>
                      {t(`feedback.relatedByLabel.${relatedPost.linkType}`)}
                    </span>
                    <span className="feedback-related-posts-meta">
                      {t('feedback.relatedSuggestedBy', {
                        username: relatedPost.suggestedBy.username,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card variant="elevated" className="feedback-comments-card">
          <div className="feedback-comments-header">
            <h2 className="feedback-comments-title">{t('feedback.comments')}</h2>
            {comments.length > 0 && (
              <div className="feedback-comment-controls">
                <Select.Root
                  collection={commentFilterCollection}
                  value={[commentFilter]}
                  onValueChange={(details) => {
                    const next = details.value[0] as 'all' | 'op' | 'staff' | undefined;
                    if (next) setCommentFilter(next);
                  }}
                >
                  <Select.Control className="report-select-control">
                    <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                      <Select.ValueText />
                      <Select.Indicator className="report-select-indicator">
                        <Icon name="chevronDown" size="xs" />
                      </Select.Indicator>
                    </Select.Trigger>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content className="report-select-content">
                        {commentFilterCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item} className="report-select-item">
                            <Select.ItemText>{item.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>

                <Select.Root
                  collection={commentSortCollection}
                  value={[commentSort]}
                  onValueChange={(details) => {
                    const next = details.value[0] as 'oldest' | 'newest' | undefined;
                    if (next) setCommentSort(next);
                  }}
                >
                  <Select.Control className="report-select-control">
                    <Select.Trigger className="report-select-trigger feedback-filter-trigger">
                      <Select.ValueText />
                      <Select.Indicator className="report-select-indicator">
                        <Icon name="chevronDown" size="xs" />
                      </Select.Indicator>
                    </Select.Trigger>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content className="report-select-content">
                        {commentSortCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item} className="report-select-item">
                            <Select.ItemText>{item.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </div>
            )}
          </div>

          {comments.length === 0 ? (
            <p className="feedback-no-comments">{t('feedback.noComments')}</p>
          ) : displayedComments.length === 0 ? (
            <p className="feedback-no-comments">{t('feedback.noFilteredComments')}</p>
          ) : (
            <div className="feedback-comment-list">
              {displayedComments.map((c) => (
                <div
                  key={c.id}
                  className={`feedback-comment${c.linkedPostId ? ' feedback-comment--link' : ''}`}
                >
                  <div className="feedback-comment-header">
                    <div className="feedback-comment-identity">
                      <FeedbackAuthorLink author={c.author} layout="comment" />
                    </div>
                    {c.responseLabel === 'dev_response' && (
                      <span className="feedback-response-badge feedback-response-badge--dev">
                        {t('feedback.devResponse')}
                      </span>
                    )}
                    {c.responseLabel === 'staff_response' && (
                      <span className="feedback-response-badge feedback-response-badge--staff">
                        {t('feedback.staffResponse')}
                      </span>
                    )}
                    {c.author.identityId === post.author.identityId && (
                      <span className="feedback-response-badge feedback-response-badge--op">
                        {t('feedback.opResponse')}
                      </span>
                    )}
                    <time className="feedback-comment-time">
                      {new Date(c.createdAt).toLocaleString()}
                    </time>
                  </div>

                  {c.parentPreview && (
                    <CommentParentQuote
                      authorDisplayName={c.parentPreview.authorDisplayName}
                      bodyExcerpt={c.parentPreview.bodyExcerpt}
                    />
                  )}

                  <LinkCommentBody comment={c} />

                  {canParticipate && !c.linkedPostId && replyingToId !== c.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="feedback-comment-reply-btn"
                      onClick={() => {
                        setReplyingToId(c.id);
                        setReplyBody('');
                        setReplyError(null);
                      }}
                    >
                      <Icon name="reply" />
                      {t('feedback.reply')}
                    </Button>
                  )}

                  {replyingToId === c.id && (
                    <form
                      onSubmit={(e) => void handleReply(e, c)}
                      className="feedback-comment-reply-form"
                    >
                      {replyError && <Alert variant="error">{replyError}</Alert>}
                      <CommentParentQuote
                        authorDisplayName={c.author.displayName}
                        bodyExcerpt={excerptFeedbackComment(c.body)}
                      />
                      <textarea
                        className="input textarea"
                        value={replyBody}
                        onChange={(e) =>
                          setReplyBody(e.target.value.slice(0, MAX_FEEDBACK_COMMENT_LENGTH))
                        }
                        placeholder={t('feedback.replyPlaceholder')}
                        rows={3}
                        autoFocus
                      />
                      <p className="input-hint">
                        {t('feedback.form.charsRemaining', { count: replyRemaining })}
                      </p>
                      <div className="feedback-comment-reply-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={replySubmitting}
                          onClick={() => {
                            setReplyingToId(null);
                            setReplyBody('');
                            setReplyError(null);
                          }}
                        >
                          {t('feedback.cancelReply')}
                        </Button>
                        <Button type="submit" disabled={!replyBody.trim() || replySubmitting}>
                          {replySubmitting ? t('common.loading') : t('feedback.postReply')}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}

          {canParticipate ? (
            <form
              onSubmit={(e) => {
                if (replyingToId) {
                  e.preventDefault();
                  return;
                }
                void handleComment(e);
              }}
              className="feedback-comment-form"
            >
              {commentError && <Alert variant="error">{commentError}</Alert>}
              <textarea
                className="input textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_FEEDBACK_COMMENT_LENGTH))}
                placeholder={t('feedback.commentPlaceholder')}
                rows={4}
              />
              <p className="input-hint">
                {t('feedback.form.charsRemaining', { count: commentRemaining })}
              </p>
              <Button type="submit" disabled={!comment.trim() || submitting}>
                {submitting ? t('common.loading') : t('feedback.postComment')}
              </Button>
            </form>
          ) : (
            <div className="feedback-participation-prompt">
              <Button type="button" variant="secondary" size="sm" onClick={requireIdentitySession}>
                {t('feedback.loginToVoteOrComment')}
              </Button>
            </div>
          )}
        </Card>

        <LinkPostModal
          open={linkModalOpen}
          onOpenChange={setLinkModalOpen}
          currentPostId={post.postId}
          onConfirm={(linkedPostId, linkType) => void handleLinkPost(linkedPostId, linkType)}
          loading={linkSubmitting}
        />
      </div>
    </div>
  );
}
