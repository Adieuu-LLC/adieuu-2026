import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  MAX_TICKET_BODY_LENGTH,
  type PublicSupportTicket,
  type PublicSupportTicketEvent,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useIdentity } from '../../hooks/useIdentity';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { Spinner } from '../../components/Spinner';
import { Avatar } from '../../components/Avatar';
import { renderFormattedMessage } from '../../utils/markdownParser';
import { useSupportTicketRealtimeRefresh } from '../../hooks/useSupportTicketRealtimeRefresh';

interface StaffMember {
  identityId: string;
  displayName: string;
  username: string;
}

export function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const { identity } = useIdentity();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [ticket, setTicket] = useState<PublicSupportTicket | null>(null);
  const [events, setEvents] = useState<PublicSupportTicketEvent[]>([]);
  const [identityProfiles, setIdentityProfiles] = useState<Record<string, { displayName: string; username: string; avatarUrl?: string }>>({});
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [assignee, setAssignee] = useState('');
  const [comment, setComment] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'public' | 'internal'>('public');
  const [resolveNote, setResolveNote] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const permissions = session?.platformPermissions ?? [];
  const canUpdate = permissions.includes('update-support-tickets');
  const canManageEscalated = permissions.includes('manage-escalated-tickets');

  const isTerminal = ticket?.status === 'resolved' || ticket?.status === 'closed';
  const isEscalated = ticket?.status === 'escalated';

  const staffCollection = useMemo(
    () =>
      createListCollection({
        items: staff.map((s) => ({
          value: s.identityId,
          label: s.displayName || s.username || s.identityId.slice(0, 8),
        })),
      }),
    [staff],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const [detailRes, staffRes] = await Promise.all([
      api.moderation.getTicket(id),
      api.moderation.listSupportStaff(),
    ]);

    if (detailRes.success && detailRes.data) {
      setTicket(detailRes.data.ticket);
      setEvents(detailRes.data.events);
      setIdentityProfiles(detailRes.data.identityProfiles ?? {});
      setAssignee(detailRes.data.ticket.assignedTo ?? '');
    } else {
      setError(t('moderation.tickets.detail.notFound'));
    }

    if (staffRes.success && staffRes.data) {
      setStaff(staffRes.data.staff);
    }

    setLoading(false);
  }, [api, id, t]);

  const refreshTicket = useCallback(async () => {
    if (!id) return;
    const detailRes = await api.moderation.getTicket(id);
    if (detailRes.success && detailRes.data) {
      setTicket(detailRes.data.ticket);
      setEvents(detailRes.data.events);
      setIdentityProfiles(detailRes.data.identityProfiles ?? {});
      setAssignee(detailRes.data.ticket.assignedTo ?? '');
      setError(null);
    }
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useSupportTicketRealtimeRefresh(ticket?.ticketId, refreshTicket);

  const resolveActorName = useCallback(
    (actorId: string, actorType: PublicSupportTicketEvent['actorType']) => {
      if (actorType === 'account') {
        return t('moderation.tickets.detail.submitterLabel');
      }
      const profile = identityProfiles[actorId];
      return profile?.displayName || profile?.username || t('moderation.tickets.detail.staffLabel');
    },
    [identityProfiles, t],
  );

  const runAction = async (fn: () => Promise<{ success: boolean }>) => {
    setActionLoading(true);
    const res = await fn();
    setActionLoading(false);
    if (res.success) void load();
  };

  const handleAssign = () => {
    if (!id || !assignee) return;
    void runAction(() => api.moderation.assignTicket(id, assignee));
  };

  const handleUnassign = () => {
    if (!id) return;
    void runAction(() => api.moderation.unassignTicket(id));
  };

  const handleEscalate = () => {
    if (!id) return;
    void runAction(() => api.moderation.escalateTicket(id));
  };

  const handleComment = () => {
    if (!id || !comment.trim()) return;
    void runAction(async () => {
      const res = await api.moderation.addTicketComment(id, {
        body: comment.trim(),
        visibility: commentVisibility,
      });
      if (res.success) setComment('');
      return res;
    });
  };

  const handleResolve = () => {
    if (!id || !resolveNote.trim()) return;
    void runAction(async () => {
      const res = await api.moderation.resolveTicket(id, { resolutionNote: resolveNote.trim() });
      if (res.success) {
        setShowResolve(false);
        setResolveNote('');
      }
      return res;
    });
  };

  const handleClose = () => {
    if (!id || !closeReason.trim()) return;
    void runAction(async () => {
      const res = await api.moderation.closeTicket(id, { reason: closeReason.trim() });
      if (res.success) {
        setShowClose(false);
        setCloseReason('');
      }
      return res;
    });
  };

  const handleReopen = () => {
    if (!id) return;
    void runAction(() => api.moderation.reopenTicket(id, {}));
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
        <Alert variant="error">{error ?? t('moderation.tickets.detail.notFound')}</Alert>
        <Link to="/moderation/tickets">{t('moderation.tickets.detail.backToList')}</Link>
      </div>
    );
  }

  const canResolveClose = canUpdate && (!isEscalated || canManageEscalated);

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <Link to="/moderation/tickets" className="admin-back-link">
          {t('moderation.tickets.detail.backToList')}
        </Link>
        <h1 className="admin-page-title">{ticket.title}</h1>
        <p className="admin-page-subtitle">{ticket.ticketId}</p>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Card>
          <h2 className="admin-card-title">{t('moderation.tickets.detail.info')}</h2>
          <dl className="admin-dl">
            <div>
              <dt>{t('moderation.tickets.detail.status')}</dt>
              <dd>
                <span className={`moderation-status-badge moderation-status-${ticket.status}`}>
                  {t(`moderation.tickets.status.${ticket.status}`)}
                </span>
              </dd>
            </div>
            <div>
              <dt>{t('moderation.tickets.detail.category')}</dt>
              <dd>{t(`moderation.tickets.category.${ticket.category}`)}</dd>
            </div>
            <div>
              <dt>{t('moderation.tickets.detail.submitter')}</dt>
              <dd>
                {ticket.submitterType} — {ticket.submitterId}
              </dd>
            </div>
            <div>
              <dt>{t('moderation.tickets.detail.created')}</dt>
              <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>{t('moderation.tickets.detail.assignedTo')}</dt>
              <dd>{ticket.assignedTo ?? '—'}</dd>
            </div>
          </dl>

          <div style={{ marginTop: '1rem' }}>
            <h3>{t('moderation.tickets.detail.body')}</h3>
            {renderFormattedMessage(ticket.body, () => {})}
          </div>

          {ticket.attachments && ticket.attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
              {ticket.attachments.map((att) =>
                att.contentType.startsWith('video/') ? (
                  <video key={att.mediaId} src={att.cdnUrl} controls style={{ maxHeight: '12rem' }} />
                ) : (
                  <img key={att.mediaId} src={att.cdnUrl} alt="" style={{ maxHeight: '12rem', borderRadius: 'var(--radius-md)' }} />
                ),
              )}
            </div>
          )}
        </Card>

        {canUpdate && (
          <Card>
            <h2 className="admin-card-title">{t('moderation.tickets.detail.assign')}</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ minWidth: '14rem', flex: 1 }}>
                <Select.Root
                  collection={staffCollection}
                  value={assignee ? [assignee] : []}
                  onValueChange={(d) => setAssignee(d.value[0] ?? '')}
                >
                  <Select.Control className="report-select-control">
                    <Select.Trigger className="report-select-trigger">
                      <Select.ValueText placeholder={t('moderation.tickets.detail.assignSelectPlaceholder')} />
                    </Select.Trigger>
                  </Select.Control>
                  <Portal>
                    <Select.Positioner>
                      <Select.Content className="report-select-content">
                        {staffCollection.items.map((item) => (
                          <Select.Item key={item.value} item={item} className="report-select-item">
                            <Select.ItemText>{item.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Positioner>
                  </Portal>
                </Select.Root>
              </div>
              <Button size="sm" disabled={actionLoading || !assignee} onClick={handleAssign}>
                {t('moderation.tickets.detail.assign')}
              </Button>
              <Button variant="secondary" size="sm" disabled={actionLoading} onClick={handleUnassign}>
                {t('moderation.tickets.detail.unassign')}
              </Button>
            </div>

            {!isTerminal && (
              <div className="admin-action-bar" style={{ marginTop: '1rem' }}>
                <Button variant="secondary" size="sm" disabled={actionLoading || ticket.status === 'escalated'} onClick={handleEscalate}>
                  {t('moderation.tickets.detail.escalate')}
                </Button>
                <Button variant="secondary" size="sm" disabled={actionLoading || !canResolveClose} onClick={() => setShowResolve(true)}>
                  {t('moderation.tickets.detail.resolve')}
                </Button>
                <Button variant="secondary" size="sm" disabled={actionLoading || !canResolveClose} onClick={() => setShowClose(true)}>
                  {t('moderation.tickets.detail.close')}
                </Button>
              </div>
            )}

            {isTerminal && (
              <div style={{ marginTop: '1rem' }}>
                <Button variant="secondary" size="sm" disabled={actionLoading} onClick={handleReopen}>
                  {t('moderation.tickets.detail.reopen')}
                </Button>
              </div>
            )}

            {showResolve && (
              <div style={{ marginTop: '1rem' }}>
                <textarea
                  className="admin-textarea"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value.slice(0, MAX_TICKET_BODY_LENGTH))}
                  placeholder={t('moderation.tickets.detail.resolveNotePlaceholder')}
                  rows={3}
                />
                <div className="admin-action-bar">
                  <Button size="sm" disabled={actionLoading || !resolveNote.trim()} onClick={handleResolve}>
                    {t('moderation.tickets.detail.confirmResolve')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowResolve(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {showClose && (
              <div style={{ marginTop: '1rem' }}>
                <textarea
                  className="admin-textarea"
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value.slice(0, MAX_TICKET_BODY_LENGTH))}
                  placeholder={t('moderation.tickets.detail.closeReasonPlaceholder')}
                  rows={3}
                />
                <div className="admin-action-bar">
                  <Button size="sm" disabled={actionLoading || !closeReason.trim()} onClick={handleClose}>
                    {t('moderation.tickets.detail.confirmClose')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowClose(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        <Card className="support-ticket-timeline-card support-ticket-timeline-card--moderation">
          <h2 className="support-ticket-section-title">{t('moderation.tickets.detail.timeline')}</h2>
          {events.length === 0 ? (
            <p className="admin-empty">{t('moderation.tickets.detail.noComments')}</p>
          ) : (
            <div className="support-timeline">
              {events.map((ev) => {
                const isSystem =
                  ev.eventType === 'status_change'
                  || ev.eventType === 'assignment_change'
                  || ev.eventType === 'escalation';
                const isInternal = ev.eventType === 'comment_internal';
                const isStaffPublic = ev.eventType === 'comment_public' && ev.actorType === 'identity';

                const formatSystemBody = () => {
                  if (ev.eventType === 'assignment_change' && ev.metadata) {
                    const assignedTo = ev.metadata.assignedTo as string | null;
                    if (assignedTo) {
                      const name = resolveActorName(assignedTo, 'identity');
                      return t('moderation.tickets.detail.assignedToStaff', { name });
                    }
                    return t('moderation.tickets.detail.unassignedEvent');
                  }
                  if (ev.eventType === 'status_change' && ev.metadata) {
                    const to = ev.metadata.to as string | undefined;
                    if (to) return t(`moderation.tickets.status.${to}`);
                  }
                  if (ev.eventType === 'escalation') {
                    return ev.body ?? t('moderation.tickets.detail.escalatedEvent');
                  }
                  return ev.body ?? t('moderation.tickets.detail.statusChanged');
                };

                if (isSystem) {
                  return (
                    <div key={ev.id} className="support-timeline-system">
                      <span className="support-timeline-system-text">{formatSystemBody()}</span>
                      <time className="support-timeline-time">{new Date(ev.createdAt).toLocaleString()}</time>
                    </div>
                  );
                }

                const actorName = resolveActorName(ev.actorId, ev.actorType);
                const avatarProfile = ev.actorType === 'identity' ? identityProfiles[ev.actorId] : undefined;
                const isOwn = ev.actorType === 'identity' && ev.actorId === identity?.id;
                const commentClass = [
                  'support-timeline-comment',
                  isInternal
                    ? 'support-timeline-comment--internal'
                    : isStaffPublic
                      ? 'support-timeline-comment--staff'
                      : 'support-timeline-comment--user',
                  isOwn ? 'support-timeline-comment--own' : '',
                ].filter(Boolean).join(' ');

                return (
                  <div key={ev.id} className={commentClass}>
                    <div className="support-timeline-comment-header">
                      <Avatar
                        src={avatarProfile?.avatarUrl}
                        name={actorName}
                        size="xs"
                      />
                      <span className="support-timeline-actor">{actorName}</span>
                      {isInternal && (
                        <span className="support-timeline-internal-badge">
                          {t('moderation.tickets.detail.internalNote')}
                        </span>
                      )}
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

          {canUpdate && !isTerminal && (
            <div className="moderation-ticket-comment-form">
              <h3 className="admin-card-title" style={{ fontSize: 'var(--font-size-md)', marginBottom: 'var(--spacing-sm)' }}>
                {t('moderation.tickets.detail.addComment')}
              </h3>
              <textarea
                className="admin-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_TICKET_BODY_LENGTH))}
                placeholder={t('moderation.tickets.detail.commentPlaceholder')}
                rows={4}
              />
              <div className="moderation-ticket-comment-visibility">
                <label>
                  <input
                    type="radio"
                    checked={commentVisibility === 'public'}
                    onChange={() => setCommentVisibility('public')}
                  />
                  {t('moderation.tickets.detail.commentPublic')}
                </label>
                <label>
                  <input
                    type="radio"
                    checked={commentVisibility === 'internal'}
                    onChange={() => setCommentVisibility('internal')}
                  />
                  {t('moderation.tickets.detail.commentInternal')}
                </label>
              </div>
              <Button size="sm" disabled={actionLoading || !comment.trim()} onClick={handleComment} style={{ marginTop: '0.75rem' }}>
                {t('moderation.tickets.detail.postComment')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
