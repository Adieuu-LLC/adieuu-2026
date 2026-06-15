import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  FEEDBACK_STATUSES,
  MAX_FEEDBACK_COMMENT_LENGTH,
  createApiClient,
  excerptFeedbackComment,
  type FeedbackStatus,
  type PublicFeedbackComment,
  type PublicFeedbackPost,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../icons/Icon';
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

export function FeedbackDetail() {
  const { postId } = useParams<{ postId: string }>();
  const { t } = useTranslation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { canParticipate, requireIdentitySession } = useFeedbackParticipation();
  const { status: identityStatus, identity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const currentIdentityId = identityStatus === 'logged_in' ? identity?.id ?? null : null;

  const [post, setPost] = useState<PublicFeedbackPost | null>(null);
  const [comments, setComments] = useState<PublicFeedbackComment[]>([]);
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

  const commentRemaining = MAX_FEEDBACK_COMMENT_LENGTH - comment.length;
  const replyRemaining = MAX_FEEDBACK_COMMENT_LENGTH - replyBody.length;

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
    const res = await api.feedback.getPost(postId);
    if (res.success && res.data) {
      setPost(res.data.post);
      setComments(res.data.comments);
      setCanManageStatus(res.data.canManageStatus);
    } else {
      setError(t('feedback.notFound'));
    }
    setLoading(false);
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
    const res = await api.feedback.addComment(postId, { body: comment.trim() });
    setSubmitting(false);

    if (res.success && res.data) {
      setComment('');
      setComments((prev) => [...prev, res.data!]);
      setPost((prev) =>
        prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev,
      );
      return;
    }

    setCommentError(t('feedback.commentError'));
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
    const res = await api.feedback.addComment(postId, {
      body: replyBody.trim(),
      parentCommentId: parentComment.id,
    });
    setReplySubmitting(false);

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
  };

  const handleStatusChange = async (newStatus: FeedbackStatus) => {
    if (!postId || !post) return;
    setStatusUpdating(true);
    const res = await api.feedback.updateStatus(postId, { status: newStatus });
    setStatusUpdating(false);

    if (res.success) {
      setPost({ ...post, status: newStatus });
      return;
    }

    toast.error(t('feedback.statusUpdateError'));
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
              {post.isOfficial && (
                <span className="feedback-wanted-badge">{t('feedback.feedbackWanted')}</span>
              )}
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
            <Avatar src={post.author.avatarUrl} name={post.author.displayName} size="sm" />
            <span>{t('feedback.authorLabel', { username: post.author.username })}</span>
          </div>

          <div className="feedback-detail-body">
            <p>{post.description}</p>
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

        <Card variant="elevated" className="feedback-comments-card">
          <h2 className="feedback-comments-title">{t('feedback.comments')}</h2>

          {comments.length === 0 ? (
            <p className="feedback-no-comments">{t('feedback.noComments')}</p>
          ) : (
            <div className="feedback-comment-list">
              {comments.map((c) => (
                <div key={c.id} className="feedback-comment">
                  <div className="feedback-comment-header">
                    <div className="feedback-comment-identity">
                      <Avatar src={c.author.avatarUrl} name={c.author.displayName} size="sm" />
                      <span className="feedback-comment-author">{c.author.displayName}</span>
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

                  <p className="feedback-comment-body">{c.body}</p>

                  {canParticipate && replyingToId !== c.id && (
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
              <p className="input-hint">{t('feedback.loginToComment')}</p>
              <Button type="button" variant="secondary" size="sm" onClick={requireIdentitySession}>
                {t('identity.loginButton')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
