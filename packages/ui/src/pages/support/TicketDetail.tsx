import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  MAX_TICKET_BODY_LENGTH,
  type PublicSupportTicket,
  type PublicSupportTicketEvent,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { Alert } from '../../components/Alert';
import { MarkdownTextarea } from '../../components/MarkdownTextarea';
import { Avatar } from '../../components/Avatar';
import { renderFormattedMessage } from '../../utils/markdownParser';
import { useSupportTicketRealtimeRefresh } from '../../hooks/useSupportTicketRealtimeRefresh';
import { emitSupportUnreadChanged } from '../../services/supportTicketEvents';

export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [ticket, setTicket] = useState<PublicSupportTicket | null>(null);
  const [events, setEvents] = useState<PublicSupportTicketEvent[]>([]);
  const [identityProfiles, setIdentityProfiles] = useState<Record<string, { displayName: string; username: string; avatarUrl?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);

  const commentRemaining = MAX_TICKET_BODY_LENGTH - comment.length;
  const isTerminal = ticket?.status === 'resolved' || ticket?.status === 'closed';

  const load = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    const res = await api.supportTickets.getTicket(ticketId);
    if (res.success && res.data) {
      setTicket(res.data.ticket);
      setEvents(res.data.events);
      setIdentityProfiles(res.data.identityProfiles ?? {});
      emitSupportUnreadChanged();
    } else {
      setError(t('support.notFound'));
    }
    setLoading(false);
  }, [api, ticketId, t]);

  const refreshTicket = useCallback(async () => {
    if (!ticketId) return;
    const res = await api.supportTickets.getTicket(ticketId);
    if (res.success && res.data) {
      setTicket(res.data.ticket);
      setEvents(res.data.events);
      setIdentityProfiles(res.data.identityProfiles ?? {});
      setError(null);
      emitSupportUnreadChanged();
    }
  }, [api, ticketId]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupportTicketRealtimeRefresh(ticketId, refreshTicket);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || !comment.trim() || isTerminal) return;

    setSubmitting(true);
    setCommentError(null);
    const res = await api.supportTickets.addComment(ticketId, { body: comment.trim() });
    setSubmitting(false);

    if (res.success) {
      setComment('');
      void load();
      return;
    }

    setCommentError(t('support.commentError'));
  };

  const handleResolve = async () => {
    if (!ticketId || isTerminal) return;
    setResolving(true);
    const res = await api.supportTickets.resolveTicket(ticketId, {
      note: resolveNote.trim() || undefined,
    });
    setResolving(false);

    if (res.success) {
      setShowResolveForm(false);
      setResolveNote('');
      void load();
      return;
    }

    setCommentError(t('support.resolveError'));
  };

  if (loading) {
    return (
      <div className="page-content support-page support-loading-page">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="page-content support-page">
        <div className="container">
          <Alert variant="error">{error ?? t('support.notFound')}</Alert>
          <Link to="/support">{t('support.backToList')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content support-page">
      <div className="container">
        <div className="page-header">
          <Link to="/support" className="support-back-link">{t('support.backToList')}</Link>
          <h1 className="page-title">{ticket.title}</h1>
          <p className="page-subtitle">{ticket.ticketId}</p>
        </div>

        <Card variant="elevated">
          <dl className="support-ticket-meta">
            <div>
              <dt>{t('support.detail.status')}</dt>
              <dd>
                <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                  {t(`support.status.${ticket.status}`)}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('support.detail.assignedTo')}</dt>
              <dd>{ticket.assignedToName ?? t('support.detail.unassigned')}</dd>
            </div>
            <div>
              <dt>{t('support.detail.category')}</dt>
              <dd>
                {t(`support.categories.${ticket.category}`)}
                {ticket.subcategory
                  ? ` / ${t(`support.subcategories.${ticket.category}.${ticket.subcategory}`)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>{t('support.detail.created')}</dt>
              <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            </div>
          </dl>

          <div className="support-ticket-body">
            {renderFormattedMessage(ticket.body, () => {})}
          </div>

          {ticket.attachments && ticket.attachments.length > 0 && (
            <div className="support-ticket-attachments">
              {ticket.attachments.map((att) =>
                att.contentType.startsWith('video/') ? (
                  // biome-ignore lint/a11y/useMediaCaption: user-uploaded support ticket attachments have no captions
                  <video key={att.mediaId} src={att.cdnUrl} controls className="support-ticket-attachment" />
                ) : (
                  <img key={att.mediaId} src={att.cdnUrl} alt="" className="support-ticket-attachment" />
                ),
              )}
            </div>
          )}
        </Card>

        <Card variant="elevated" className="support-ticket-timeline-card">
          <h2 className="support-ticket-section-title">{t('support.detail.timeline')}</h2>
          {events.length === 0 ? (
            <p className="admin-empty">{t('support.detail.noComments')}</p>
          ) : (
            <div className="support-timeline">
              {events.map((ev) => {
                const isSystem = ev.eventType === 'status_change' || ev.eventType === 'assignment_change';
                const isStaff = ev.actorType === 'identity' && !isSystem;
                const isUser = ev.actorType === 'account' || (ev.actorType === 'identity' && ev.actorId === ticket.submitterId && !isSystem);

                const resolveActorName = (actorId: string) => {
                  const profile = identityProfiles[actorId];
                  return profile?.displayName || profile?.username || t('support.detail.staff');
                };

                const formatSystemBody = () => {
                  if (ev.eventType === 'assignment_change' && ev.metadata) {
                    const assignedTo = ev.metadata.assignedTo as string | null;
                    if (assignedTo) {
                      const name = resolveActorName(assignedTo);
                      return t('support.detail.assignedToStaff', { name });
                    }
                    return t('support.detail.unassignedEvent');
                  }
                  if (ev.eventType === 'status_change' && ev.metadata) {
                    const to = ev.metadata.to as string | undefined;
                    if (to) return t(`support.status.${to}`);
                  }
                  return ev.body ?? t('support.detail.statusChanged');
                };

                if (isSystem) {
                  return (
                    <div key={ev.id} className="support-timeline-system">
                      <span className="support-timeline-system-text">
                        {formatSystemBody()}
                      </span>
                      <time className="support-timeline-time">{new Date(ev.createdAt).toLocaleString()}</time>
                    </div>
                  );
                }

                const actorName = isUser
                  ? t('support.detail.you')
                  : resolveActorName(ev.actorId);

                const actorProfile = identityProfiles[ev.actorId];
                const submitterProfile = identityProfiles[ticket.submitterId];
                const avatarProfile = isUser ? submitterProfile : actorProfile;

                return (
                  <div
                    key={ev.id}
                    className={`support-timeline-comment ${isStaff ? 'support-timeline-comment--staff' : 'support-timeline-comment--user'}${isUser ? ' support-timeline-comment--own' : ''}`}
                  >
                    <div className="support-timeline-comment-header">
                      <Avatar
                        src={avatarProfile?.avatarUrl}
                        name={actorName}
                        size="xs"
                      />
                      <span className="support-timeline-actor">
                        {actorName}
                      </span>
                      <time className="support-timeline-time">{new Date(ev.createdAt).toLocaleString()}</time>
                    </div>
                    {ev.body && (
                      <div className="support-timeline-comment-body">
                        {renderFormattedMessage(ev.body, () => {})}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!isTerminal && (
            <form onSubmit={(e) => void handleComment(e)} className="support-comment-form">
              {commentError && <Alert variant="error">{commentError}</Alert>}
              <MarkdownTextarea
                value={comment}
                onChange={setComment}
                maxLength={MAX_TICKET_BODY_LENGTH}
                placeholder={t('support.form.commentPlaceholder')}
                rows={4}
              />
              <p className="input-hint">{t('support.form.charsRemaining', { count: commentRemaining })}</p>
              <div className="support-comment-actions">
                <Button type="submit" disabled={submitting || !comment.trim()}>
                  {submitting ? t('common.loading') : t('support.form.sendComment')}
                </Button>
                {!showResolveForm && (
                  <Button type="button" variant="secondary" onClick={() => setShowResolveForm(true)}>
                    {t('support.detail.markResolved')}
                  </Button>
                )}
              </div>
            </form>
          )}

          {!isTerminal && showResolveForm && (
            <div className="support-resolve-form">
              <label className="input-label" htmlFor="resolve-note">{t('support.detail.resolveNoteLabel')}</label>
              <MarkdownTextarea
                id="resolve-note"
                value={resolveNote}
                onChange={setResolveNote}
                maxLength={500}
                placeholder={t('support.detail.resolveNotePlaceholder')}
                rows={2}
              />
              <div className="support-comment-actions">
                <Button onClick={() => void handleResolve()} disabled={resolving}>
                  {resolving ? t('common.loading') : t('support.detail.confirmResolve')}
                </Button>
                <Button variant="secondary" onClick={() => setShowResolveForm(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
