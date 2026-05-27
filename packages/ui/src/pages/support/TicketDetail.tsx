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
import { renderFormattedMessage } from '../../utils/markdownParser';

export function TicketDetail() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [ticket, setTicket] = useState<PublicSupportTicket | null>(null);
  const [events, setEvents] = useState<PublicSupportTicketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

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
    } else {
      setError(t('support.notFound'));
    }
    setLoading(false);
  }, [api, ticketId, t]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading) {
    return (
      <div className="admin-page" style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="admin-page">
        <Alert variant="error">{error ?? t('support.notFound')}</Alert>
        <Link to="/support">{t('support.backToList')}</Link>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <Link to="/support" className="admin-back-link">{t('support.backToList')}</Link>
        <h1 className="admin-page-title">{ticket.title}</h1>
        <p className="admin-page-subtitle">{ticket.ticketId}</p>
      </div>

      <Card>
        <dl className="admin-dl">
          <div>
            <dt>{t('support.detail.status')}</dt>
            <dd>
              <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                {t(`support.status.${ticket.status}`)}
              </span>
            </dd>
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

        <div style={{ marginTop: '1.5rem' }}>
          {renderFormattedMessage(ticket.body, () => {})}
        </div>

        {ticket.attachments && ticket.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
            {ticket.attachments.map((att) =>
              att.contentType.startsWith('video/') ? (
                <video key={att.mediaId} src={att.cdnUrl} controls style={{ maxWidth: '100%', maxHeight: '16rem' }} />
              ) : (
                <img
                  key={att.mediaId}
                  src={att.cdnUrl}
                  alt=""
                  style={{ maxWidth: '100%', maxHeight: '16rem', borderRadius: 'var(--radius-md)' }}
                />
              ),
            )}
          </div>
        )}
      </Card>

      <Card style={{ marginTop: '1rem' }}>
        <h2 className="admin-card-title">{t('support.detail.timeline')}</h2>
        {events.length === 0 ? (
          <p className="admin-empty">{t('support.detail.noComments')}</p>
        ) : (
          <ul className="moderation-timeline">
            {events.map((ev) => (
              <li key={ev.id} className="moderation-timeline-item">
                <time>{new Date(ev.createdAt).toLocaleString()}</time>
                {ev.body && <div>{renderFormattedMessage(ev.body, () => {})}</div>}
              </li>
            ))}
          </ul>
        )}

        {!isTerminal && (
          <form onSubmit={(e) => void handleComment(e)} style={{ marginTop: '1rem' }}>
            {commentError && <Alert variant="error">{commentError}</Alert>}
            <textarea
              className="admin-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, MAX_TICKET_BODY_LENGTH))}
              placeholder={t('support.form.commentPlaceholder')}
              rows={4}
            />
            <p className="input-hint">{t('support.form.charsRemaining', { count: commentRemaining })}</p>
            <Button type="submit" disabled={submitting || !comment.trim()}>
              {submitting ? t('common.loading') : t('support.form.sendComment')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
