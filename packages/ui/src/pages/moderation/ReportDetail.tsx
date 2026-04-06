import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { createApiClient, type PublicReport, type PublicReportEvent } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/Button';

export function ReportDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [report, setReport] = useState<PublicReport | null>(null);
  const [events, setEvents] = useState<PublicReportEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Comment form
  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'internal' | 'public'>('internal');

  // Resolve form
  const [showResolve, setShowResolve] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [resolveRemove, setResolveRemove] = useState(true);
  const [resolveWarn, setResolveWarn] = useState(true);
  const [resolveSuspendMs, setResolveSuspendMs] = useState(0);
  const [resolveBan, setResolveBan] = useState(false);

  // Close form
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  // Category edit
  const [editingCategory, setEditingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const canManage =
    session?.platformPermissions?.includes('update-content-reports') ||
    session?.platformPermissions?.includes('update-abuse-reports') ||
    false;

  const canManageEscalated =
    session?.platformPermissions?.includes('manage-escalated-reports') || false;

  const isActionable =
    report?.status === 'open' || report?.status === 'escalated';

  const canActOnThis =
    isActionable &&
    canManage &&
    (report?.status !== 'escalated' || canManageEscalated);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await api.moderation.getReport(id);
    if (res.success && res.data) {
      setReport(res.data.report);
      setEvents(res.data.events);
    } else {
      setError(t('moderation.detail.loadError'));
    }
    setLoading(false);
  }, [api, id, t]);

  useEffect(() => { void load(); }, [load]);

  const handleEscalate = async () => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.moderation.escalateReport(id);
    if (res.success && res.data) setReport(res.data);
    await load();
    setActionLoading(false);
  };

  const handleAssignToMe = async () => {
    if (!id || !session) return;
    setActionLoading(true);
    // session doesn't have userId directly, but the API reads it server-side
    // We'll use a special "me" sentinel that the API can handle
    // Actually, the API requires a userId. Let's pass the session identifier.
    // The admin routes use a direct userId string from the settings list.
    // For moderator self-assign, we need the backend to resolve from session.
    // Simplest approach: the assign endpoint already gets session from cookie.
    // Let's add a self-assign shortcut — passing "me" and resolving server-side.
    // For now, we use the API as-is. The userId is the session.userId which isn't
    // exposed to the client. We'll create a dedicated self-assign endpoint.
    // Actually, let's just call assign with a placeholder and let the server know.
    // The simplest correct approach: we'll just do unassign/escalate for now,
    // and note that assign-to-me will need the userId in the session or a dedicated endpoint.
    // For the MVP, we skip self-assign in the UI — moderators can escalate, comment, resolve, close.
    setActionLoading(false);
  };

  const handleComment = async () => {
    if (!id || !commentBody.trim()) return;
    setActionLoading(true);
    const res = await api.moderation.addComment(id, commentBody.trim(), commentVisibility);
    if (res.success) {
      setCommentBody('');
      await load();
    }
    setActionLoading(false);
  };

  const handleResolve = async () => {
    if (!id || !resolveReason.trim()) return;
    setActionLoading(true);
    const res = await api.moderation.resolveReport(id, {
      reason: resolveReason.trim(),
      removeContent: resolveRemove,
      warnUser: resolveWarn,
      suspendAliasMs: resolveSuspendMs,
      banAlias: resolveBan,
    });
    if (res.success && res.data) {
      setReport(res.data);
      setShowResolve(false);
      await load();
    }
    setActionLoading(false);
  };

  const handleClose = async () => {
    if (!id || !closeReason.trim()) return;
    setActionLoading(true);
    const res = await api.moderation.closeReport(id, closeReason.trim());
    if (res.success && res.data) {
      setReport(res.data);
      setShowClose(false);
      await load();
    }
    setActionLoading(false);
  };

  const handleCategoryChange = async () => {
    if (!id || !newCategory) return;
    setActionLoading(true);
    const res = await api.moderation.changeCategory(id, newCategory);
    if (res.success && res.data) {
      setReport(res.data);
      setEditingCategory(false);
      await load();
    }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="admin-page" style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="admin-page">
        <div className="admin-card" style={{ color: 'var(--color-danger)', textAlign: 'center' }}>
          {error ?? t('moderation.detail.notFound')}
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/moderation/reports')}>
          {t('moderation.detail.backToList')}
        </Button>
      </div>
    );
  }

  const categories = ['csam', 'illegal_content', 'violence', 'harassment', 'spam', 'impersonation', 'other'];
  const suspensionPresets = [
    { label: '1 hour', ms: 3600000 },
    { label: '24 hours', ms: 86400000 },
    { label: '7 days', ms: 604800000 },
    { label: '30 days', ms: 2592000000 },
  ];

  return (
    <div className="admin-page">
      {/* Header */}
      <div className="admin-page-header">
        <Button variant="ghost" size="sm" onClick={() => navigate('/moderation/reports')} style={{ marginBottom: '0.5rem' }}>
          &larr; {t('moderation.detail.backToList')}
        </Button>
        <h1 className="admin-page-title">
          {t('moderation.detail.title')} &mdash;{' '}
          <span className={`moderation-status-badge moderation-status-${report.status}`}>
            {t(`moderation.reports.status.${report.status}`)}
          </span>
        </h1>
      </div>

      {/* Report metadata */}
      <div className="admin-card">
        <h2 className="admin-card-title">{t('moderation.detail.info')}</h2>
        <dl className="moderation-detail-grid">
          <dt>{t('moderation.detail.type')}</dt>
          <dd>{report.reportType}</dd>
          <dt>{t('moderation.detail.source')}</dt>
          <dd>{report.source === 'automated_rekognition' ? t('moderation.reports.sourceAuto') : t('moderation.reports.sourceManual')}</dd>
          <dt>{t('moderation.detail.category')}</dt>
          <dd>
            {editingCategory ? (
              <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="moderation-filter-select">
                  {categories.map((c) => <option key={c} value={c}>{t(`moderation.reports.category.${c}`, c)}</option>)}
                </select>
                <Button variant="primary" size="sm" onClick={handleCategoryChange} disabled={actionLoading}>{t('common.save')}</Button>
                <Button variant="ghost" size="sm" onClick={() => setEditingCategory(false)}>{t('common.cancel')}</Button>
              </span>
            ) : (
              <span>
                {t(`moderation.reports.category.${report.category}`, report.category)}
                {canActOnThis && (
                  <Button variant="ghost" size="sm" onClick={() => { setNewCategory(report.category); setEditingCategory(true); }} style={{ marginLeft: '0.5rem' }}>
                    {t('common.edit')}
                  </Button>
                )}
              </span>
            )}
          </dd>
          <dt>{t('moderation.detail.target')}</dt>
          <dd className="moderation-cell-mono">{report.targetRef.type}: {report.targetRef.id}</dd>
          {report.targetIdentityId && (
            <>
              <dt>{t('moderation.detail.targetIdentity')}</dt>
              <dd className="moderation-cell-mono">{report.targetIdentityId}</dd>
            </>
          )}
          {report.reporterIdentityId && (
            <>
              <dt>{t('moderation.detail.reporter')}</dt>
              <dd className="moderation-cell-mono">{report.reporterIdentityId}</dd>
            </>
          )}
          <dt>{t('moderation.detail.created')}</dt>
          <dd>{new Date(report.createdAt).toLocaleString()}</dd>
          {report.assignedTo && (
            <>
              <dt>{t('moderation.detail.assignedTo')}</dt>
              <dd className="moderation-cell-mono">{report.assignedTo}</dd>
            </>
          )}
        </dl>

        {/* Detection metadata (Rekog labels etc.) */}
        {report.detectionMetadata && Object.keys(report.detectionMetadata).length > 0 && (
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.875rem', opacity: 0.7 }}>
              {t('moderation.detail.detectionMetadata')}
            </summary>
            <pre style={{ fontSize: '0.75rem', marginTop: '0.5rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {JSON.stringify(report.detectionMetadata, null, 2)}
            </pre>
          </details>
        )}

        {/* Resolution info */}
        {report.resolution && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--color-surface-alt, rgba(0,0,0,0.05))' }}>
            <strong>{t('moderation.detail.resolution')}</strong>
            <p style={{ margin: '0.25rem 0' }}>{report.resolution.reason}</p>
            <small style={{ opacity: 0.6 }}>
              {t('moderation.detail.resolvedBy')}: {report.resolution.resolvedBy} &mdash; {new Date(report.resolution.resolvedAt).toLocaleString()}
            </small>
          </div>
        )}

        {report.closureReason && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--color-surface-alt, rgba(0,0,0,0.05))' }}>
            <strong>{t('moderation.detail.closedLabel')}</strong>
            <p style={{ margin: '0.25rem 0' }}>{report.closureReason}</p>
            <small style={{ opacity: 0.6 }}>
              {t('moderation.detail.closedByLabel')}: {report.closedBy} &mdash; {report.closedAt ? new Date(report.closedAt).toLocaleString() : ''}
            </small>
          </div>
        )}
      </div>

      {/* Actions */}
      {canActOnThis && (
        <div className="admin-card">
          <h2 className="admin-card-title">{t('moderation.detail.actions')}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {report.status === 'open' && canManage && (
              <Button variant="ghost" size="sm" onClick={handleEscalate} disabled={actionLoading}>
                {t('moderation.detail.escalate')}
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={() => setShowResolve(!showResolve)} disabled={actionLoading}>
              {t('moderation.detail.resolve')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowClose(!showClose)} disabled={actionLoading}>
              {t('moderation.detail.close')}
            </Button>
          </div>

          {/* Resolve form */}
          {showResolve && (
            <div className="moderation-action-form">
              <h3>{t('moderation.detail.resolveTitle')}</h3>
              <textarea
                className="moderation-textarea"
                rows={3}
                placeholder={t('moderation.detail.reasonPlaceholder')}
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
              />
              <div className="moderation-action-checks">
                <label><input type="checkbox" checked={resolveRemove} onChange={(e) => setResolveRemove(e.target.checked)} /> {t('moderation.detail.removeContent')}</label>
                <label><input type="checkbox" checked={resolveWarn} onChange={(e) => setResolveWarn(e.target.checked)} /> {t('moderation.detail.warnUser')}</label>
                <label><input type="checkbox" checked={resolveBan} onChange={(e) => setResolveBan(e.target.checked)} /> {t('moderation.detail.banAlias')}</label>
              </div>
              {!resolveBan && (
                <label className="moderation-filter-label" style={{ marginTop: '0.5rem' }}>
                  <span>{t('moderation.detail.suspendDuration')}</span>
                  <select
                    value={resolveSuspendMs}
                    onChange={(e) => setResolveSuspendMs(Number(e.target.value))}
                    className="moderation-filter-select"
                  >
                    <option value={0}>{t('moderation.detail.noSuspension')}</option>
                    {suspensionPresets.map((p) => (
                      <option key={p.ms} value={p.ms}>{p.label}</option>
                    ))}
                  </select>
                </label>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <Button variant="primary" size="sm" onClick={handleResolve} disabled={actionLoading || !resolveReason.trim()}>
                  {t('moderation.detail.confirmResolve')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowResolve(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          {/* Close form */}
          {showClose && (
            <div className="moderation-action-form">
              <h3>{t('moderation.detail.closeTitle')}</h3>
              <textarea
                className="moderation-textarea"
                rows={3}
                placeholder={t('moderation.detail.closeReasonPlaceholder')}
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <Button variant="ghost" size="sm" onClick={handleClose} disabled={actionLoading || !closeReason.trim()}>
                  {t('moderation.detail.confirmClose')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowClose(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comment form */}
      <div className="admin-card">
        <h2 className="admin-card-title">{t('moderation.detail.addComment')}</h2>
        <textarea
          className="moderation-textarea"
          rows={2}
          placeholder={t('moderation.detail.commentPlaceholder')}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
          <select
            value={commentVisibility}
            onChange={(e) => setCommentVisibility(e.target.value as 'internal' | 'public')}
            className="moderation-filter-select"
          >
            <option value="internal">{t('moderation.detail.commentInternal')}</option>
            <option value="public">{t('moderation.detail.commentPublic')}</option>
          </select>
          <Button variant="primary" size="sm" onClick={handleComment} disabled={actionLoading || !commentBody.trim()}>
            {t('moderation.detail.postComment')}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="admin-card">
        <h2 className="admin-card-title">{t('moderation.detail.timeline')}</h2>
        {events.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{t('moderation.detail.noEvents')}</p>
        )}
        <div className="moderation-timeline">
          {events.map((ev) => (
            <div key={ev.id} className={`moderation-timeline-event moderation-event-${ev.eventType}`}>
              <div className="moderation-timeline-meta">
                <span className="moderation-timeline-type">
                  {t(`moderation.detail.eventType.${ev.eventType}`, ev.eventType)}
                </span>
                <span className="moderation-timeline-date">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
              {ev.body && <p className="moderation-timeline-body">{ev.body}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
