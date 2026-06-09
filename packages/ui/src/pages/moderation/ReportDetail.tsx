import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
  AccordionItemIndicator,
} from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  createApiClient,
  getReportSourceI18nKey,
  type PublicReport,
  type PublicReportEvent,
  type ModerationIdentityProfile,
  type ModerationModerator,
} from '@adieuu/shared';
import { Select, Portal, createListCollection } from '@ark-ui/react';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import type { LeReportCategory } from '@adieuu/shared';
import { ModerationEvidenceMessageRow } from './ModerationEvidenceMessageRow';
import { ReportModerationScanEvidence } from './ReportModerationScanEvidence';
import { LeReportModal } from './LeReportModal';
import { splitMessageEvidenceForModeration } from './moderationEvidenceSplit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatIdentity(
  id: string | undefined,
  profiles: Record<string, ModerationIdentityProfile>,
  fallbackLabel: string,
): string {
  if (!id) return '—';
  const p = profiles[id];
  if (p?.displayName || p?.username) {
    const name = p.displayName || p.username;
    const username = p.username ? `@${p.username}` : '';
    return `${name} ${username} (${id.slice(0, 8)}…)`.trim();
  }
  return `${fallbackLabel} (${id.slice(0, 8)}…)`;
}

// ---------------------------------------------------------------------------
// History sub-component (used for Target History and Reporter History tabs)
// ---------------------------------------------------------------------------

function ReportHistoryTab({
  identityId,
  currentReportId,
  filterKey,
}: {
  identityId: string | undefined;
  currentReportId: string;
  filterKey: 'targetIdentityId' | 'reporterIdentityId';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [reports, setReports] = useState<PublicReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!identityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = { [filterKey]: identityId, limit: 25 };
    api.moderation.listReports(params).then((res) => {
      if (res.success && res.data) {
        setReports(res.data.reports.filter((r) => r.id !== currentReportId));
      }
      setLoading(false);
    });
  }, [api, identityId, filterKey, currentReportId]);

  if (!identityId) {
    return <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{t('moderation.detail.historyEmpty')}</p>;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  if (reports.length === 0) {
    return <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{t('moderation.detail.historyEmpty')}</p>;
  }

  return (
    <div className="admin-card" style={{ overflow: 'auto', padding: 0 }}>
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('moderation.reports.col.status')}</th>
            <th>{t('moderation.reports.col.category')}</th>
            <th>{t('moderation.reports.col.source')}</th>
            <th>{t('moderation.reports.col.created')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="moderation-report-row">
              <td>
                <span className={`moderation-status-badge moderation-status-${r.status}`}>
                  {t(`moderation.reports.status.${r.status}`)}
                </span>
              </td>
              <td>{t(`moderation.reports.category.${r.category}`, r.category)}</td>
              <td>{t(`moderation.reports.${getReportSourceI18nKey(r.source)}`)}</td>
              <td>{new Date(r.createdAt).toLocaleDateString()}</td>
              <td>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/moderation/reports/${r.id}`)}>
                  {t('moderation.detail.historyViewReport')}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ReportDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [report, setReport] = useState<PublicReport | null>(null);
  const [events, setEvents] = useState<PublicReportEvent[]>([]);
  const [identityProfiles, setIdentityProfiles] = useState<Record<string, ModerationIdentityProfile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<'internal' | 'public'>('internal');

  const [showResolve, setShowResolve] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [resolveRemove, setResolveRemove] = useState(true);
  const [resolveWarn, setResolveWarn] = useState(true);
  const [resolveSuspendMs, setResolveSuspendMs] = useState(0);
  const [resolveBan, setResolveBan] = useState(false);

  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [editingCategory, setEditingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const [moderators, setModerators] = useState<ModerationModerator[]>([]);
  const [moderatorsLoaded, setModeratorsLoaded] = useState(false);

  const [showLeReport, setShowLeReport] = useState(false);
  const [leReportLoading, setLeReportLoading] = useState(false);

  const toast = useToast();

  const canManage =
    session?.platformPermissions?.includes('update-content-reports') ||
    session?.platformPermissions?.includes('update-abuse-reports') ||
    false;

  const canManageEscalated =
    session?.platformPermissions?.includes('manage-escalated-reports') || false;

  const isActionable = report?.status === 'open' || report?.status === 'escalated';
  const isReopenable = (report?.status === 'resolved' || report?.status === 'closed') && canManage;

  const canActOnThis =
    isActionable && canManage && (report?.status !== 'escalated' || canManageEscalated);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    const res = await api.moderation.getReport(id);
    if (res.success && res.data) {
      setReport(res.data.report);
      setEvents(res.data.events);
      setIdentityProfiles(res.data.identityProfiles ?? {});
    } else {
      setError(t('moderation.detail.loadError'));
    }
    setLoading(false);
  }, [api, id, t]);

  useEffect(() => { void load(); }, [load]);

  const handleFileLeReport = async (category: LeReportCategory, notes?: string) => {
    if (!id) return;
    setLeReportLoading(true);
    const res = await api.moderation.fileLeReport(id, { category, notes });
    setLeReportLoading(false);
    if (!res.success) return;

    const filed = res.data;
    if (filed?.ncmecStatus === 'submitted') {
      toast.success(t('moderation.detail.leReportSuccess'));
      setShowLeReport(false);
    } else {
      const detail = filed?.ncmecError?.trim();
      toast.error(
        detail
          ? `${t('moderation.detail.leReportSubmitFailed')} ${detail}`
          : t('moderation.detail.leReportSubmitFailed'),
      );
    }
    await load();
  };

  const handleEscalate = async () => {
    if (!id) return;
    setActionLoading(true);
    await api.moderation.escalateReport(id);
    await load();
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

  const handleReopen = async () => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.moderation.reopenReport(id, reopenReason.trim() || undefined);
    if (res.success && res.data) {
      setReport(res.data);
      setShowReopen(false);
      setReopenReason('');
      toast.success(t('moderation.detail.reopenSuccess'));
      await load();
    }
    setActionLoading(false);
  };

  useEffect(() => {
    if (moderatorsLoaded) return;
    api.moderation.listModerators().then((res) => {
      if (res.success && res.data) {
        setModerators(res.data.moderators);
      }
      setModeratorsLoaded(true);
    });
  }, [api, moderatorsLoaded]);

  const moderatorCollection = useMemo(
    () =>
      createListCollection({
        items: moderators.map((m) => ({
          value: m.identityId,
          label: m.displayName || `@${m.username}` || m.identityId.slice(0, 8) + '…',
        })),
      }),
    [moderators],
  );

  const handleAssign = async (identityId: string) => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.moderation.assignReport(id, identityId);
    if (res.success) {
      toast.success(t('moderation.detail.assignSuccess'));
      await load();
    }
    setActionLoading(false);
  };

  const handleUnassign = async () => {
    if (!id) return;
    setActionLoading(true);
    const res = await api.moderation.unassignReport(id);
    if (res.success) {
      toast.success(t('moderation.detail.unassignSuccess'));
      await load();
    }
    setActionLoading(false);
  };

  const handleCopyAliasId = async (aliasId: string) => {
    try {
      await navigator.clipboard.writeText(aliasId);
      toast.success(t('moderation.detail.copiedAliasId'));
    } catch {
      /* clipboard API unavailable */
    }
  };

  // Shorthand helpers
  const fmtId = (identityId: string | undefined) =>
    formatIdentity(identityId, identityProfiles, t('moderation.detail.unknownAlias'));

  const messageEvidenceSplit = useMemo(() => {
    if (report?.evidence?.type !== 'message' || !report.evidence.messageEvidence) return null;
    return splitMessageEvidenceForModeration(
      report.evidence.messageEvidence,
      report.evidence.contextMessageCount,
    );
  }, [report]);

  const hasScanEvidenceSession = useMemo(() => {
    const h = report?.detectionMetadata?.scanHash;
    return typeof h === 'string' && /^[0-9a-f]{64}$/i.test(h);
  }, [report?.detectionMetadata?.scanHash]);

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
          {report.ncmecStatus === 'submitted' && (
            <span className="le-report-filed-badge" style={{ marginLeft: '0.5rem' }}>
              {t('moderation.detail.leReportFiled')}
              {report.ncmecReportId && (
                <span style={{ marginLeft: '0.25rem', fontWeight: 400 }}>
                  (NCMEC #{report.ncmecReportId})
                </span>
              )}
            </span>
          )}
          {report.ncmecStatus === 'failed' && (
            <span className="le-report-failed-badge" style={{ marginLeft: '0.5rem' }}>
              {t('moderation.detail.ncmecSubmitFailed')}
            </span>
          )}
        </h1>
      </div>

      {/* Report metadata */}
      <div className="admin-card">
        <h2 className="admin-card-title">{t('moderation.detail.info')}</h2>
        <dl className="moderation-detail-grid">
          <dt>{t('moderation.detail.type')}</dt>
          <dd>{report.reportType}</dd>
          <dt>{t('moderation.detail.source')}</dt>
          <dd>{t(`moderation.reports.${getReportSourceI18nKey(report.source)}`)}</dd>
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
              <dd>
                <button
                  type="button"
                  className="moderation-copyable-id"
                  onClick={() => handleCopyAliasId(report.targetIdentityId!)}
                  title={report.targetIdentityId}
                >
                  {fmtId(report.targetIdentityId)}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </dd>
            </>
          )}
          {report.reporterIdentityId && (
            <>
              <dt>{t('moderation.detail.reporter')}</dt>
              <dd>
                <button
                  type="button"
                  className="moderation-copyable-id"
                  onClick={() => handleCopyAliasId(report.reporterIdentityId!)}
                  title={report.reporterIdentityId}
                >
                  {fmtId(report.reporterIdentityId)}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                </button>
              </dd>
            </>
          )}
          <dt>{t('moderation.detail.created')}</dt>
          <dd>{new Date(report.createdAt).toLocaleString()}</dd>
          <dt>{t('moderation.detail.assignedTo')}</dt>
          <dd>
            {report.assignedTo ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>{fmtId(report.assignedTo)}</span>
                {isActionable && (
                  <Button variant="ghost" size="sm" onClick={handleUnassign} disabled={actionLoading}>
                    {t('moderation.detail.unassign')}
                  </Button>
                )}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>—</span>
                {isActionable && moderatorsLoaded && moderators.length > 0 && (
                  <Select.Root
                    collection={moderatorCollection}
                    value={[]}
                    onValueChange={(details) => {
                      const iid = details.value[0];
                      if (iid) void handleAssign(iid);
                    }}
                    positioning={{ sameWidth: true }}
                  >
                    <Select.Control className="report-select-control" style={{ display: 'inline-flex', minWidth: '12rem' }}>
                      <Select.Trigger className="report-select-trigger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8125rem' }}>
                        <Select.ValueText placeholder={t('moderation.detail.assignSelectPlaceholder')} />
                        <Select.Indicator className="report-select-indicator">
                          <Icon name="chevronDown" size="xs" />
                        </Select.Indicator>
                      </Select.Trigger>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content className="report-select-content">
                          {moderatorCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item} className="report-select-item">
                              <Select.ItemText>{item.label}</Select.ItemText>
                              <Select.ItemIndicator className="report-select-item-indicator">
                                <Icon name="check" size="xs" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                )}
              </span>
            )}
          </dd>
        </dl>

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

        {report.reporterReason && (
          <div style={{ marginTop: '1rem' }}>
            <strong>{t('moderation.detail.reporterReason')}</strong>
            <p style={{ margin: '0.25rem 0', fontStyle: 'italic' }}>{report.reporterReason}</p>
          </div>
        )}
      </div>

      {/* Tabs: Evidence | Target History | Reporter History */}
      <div className="admin-card">
        <Tabs defaultTab="evidence">
          <TabList>
            <TabTrigger value="evidence">{t('moderation.detail.tabEvidence')}</TabTrigger>
            <TabTrigger value="target-history">{t('moderation.detail.tabTargetHistory')}</TabTrigger>
            <TabTrigger value="reporter-history">{t('moderation.detail.tabReporterHistory')}</TabTrigger>
            <TabTrigger value="timeline">{t('moderation.detail.tabTimeline')}</TabTrigger>
          </TabList>

          {/* Evidence tab */}
          <TabContent value="evidence">
            {hasScanEvidenceSession && <ReportModerationScanEvidence reportId={report.id} api={api} />}

            {/* Message evidence */}
            {report.evidence?.type === 'message' && report.evidence.messageEvidence && messageEvidenceSplit && (
              <>
                <h3 className="admin-card-title">{t('moderation.detail.evidenceMessages')}</h3>
                {report.evidence.contextMessageCount != null && (
                  <p style={{ fontSize: '0.75rem', opacity: 0.65, marginBottom: '0.75rem' }}>
                    {t('moderation.detail.contextWindowLabel', { count: report.evidence.contextMessageCount })}
                  </p>
                )}
                <div className="moderation-evidence-messages">
                  {messageEvidenceSplit.fallbackFlat ? (
                    report.evidence.messageEvidence.map((msg) => (
                      <ModerationEvidenceMessageRow key={msg.messageId} msg={msg} fmtId={fmtId} />
                    ))
                  ) : (
                    <>
                      {messageEvidenceSplit.olderContext.length > 0 && (
                        <AccordionRoot
                          className="moderation-evidence-extra-accordion"
                          collapsible
                          defaultValue={[]}
                        >
                          <AccordionItem value="older-extra" className="moderation-evidence-accordion-item">
                            <AccordionItemTrigger
                              className="moderation-evidence-accordion-trigger"
                              type="button"
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                marginBottom: '0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
                                background: 'var(--color-surface-alt, rgba(0,0,0,0.03))',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                              }}
                            >
                              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                {t('moderation.detail.evidenceOlderExpand', {
                                  count: messageEvidenceSplit.olderContext.length,
                                })}
                              </span>
                              <AccordionItemIndicator>
                                <Icon name="chevronDown" size="xs" />
                              </AccordionItemIndicator>
                            </AccordionItemTrigger>
                            <AccordionItemContent>
                              {messageEvidenceSplit.olderContext.map((msg) => (
                                <ModerationEvidenceMessageRow key={msg.messageId} msg={msg} fmtId={fmtId} />
                              ))}
                            </AccordionItemContent>
                          </AccordionItem>
                        </AccordionRoot>
                      )}
                      {messageEvidenceSplit.primaryBefore.map((msg) => (
                        <ModerationEvidenceMessageRow key={msg.messageId} msg={msg} fmtId={fmtId} />
                      ))}
                      {messageEvidenceSplit.target && (
                        <ModerationEvidenceMessageRow
                          key={messageEvidenceSplit.target.messageId}
                          msg={messageEvidenceSplit.target}
                          fmtId={fmtId}
                        />
                      )}
                      {messageEvidenceSplit.primaryAfter.map((msg) => (
                        <ModerationEvidenceMessageRow key={msg.messageId} msg={msg} fmtId={fmtId} />
                      ))}
                      {messageEvidenceSplit.newerContext.length > 0 && (
                        <AccordionRoot
                          className="moderation-evidence-extra-accordion"
                          collapsible
                          defaultValue={[]}
                        >
                          <AccordionItem value="newer-extra" className="moderation-evidence-accordion-item">
                            <AccordionItemTrigger
                              className="moderation-evidence-accordion-trigger"
                              type="button"
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '0.5rem 0.75rem',
                                marginTop: '0.25rem',
                                marginBottom: '0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--color-border-subtle, rgba(0,0,0,0.1))',
                                background: 'var(--color-surface-alt, rgba(0,0,0,0.03))',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.5rem',
                              }}
                            >
                              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                {t('moderation.detail.evidenceNewerExpand', {
                                  count: messageEvidenceSplit.newerContext.length,
                                })}
                              </span>
                              <AccordionItemIndicator>
                                <Icon name="chevronDown" size="xs" />
                              </AccordionItemIndicator>
                            </AccordionItemTrigger>
                            <AccordionItemContent>
                              {messageEvidenceSplit.newerContext.map((msg) => (
                                <ModerationEvidenceMessageRow key={msg.messageId} msg={msg} fmtId={fmtId} />
                              ))}
                            </AccordionItemContent>
                          </AccordionItem>
                        </AccordionRoot>
                      )}
                    </>
                  )}
                </div>
              </>
            )}

            {/* Profile evidence */}
            {report.evidence?.type === 'profile' && report.evidence.profileEvidence && (
              <>
                <h3 className="admin-card-title">{t('moderation.detail.evidenceProfile')}</h3>
                <p style={{ fontSize: '0.75rem', opacity: 0.6, marginBottom: '0.5rem' }}>
                  {t('moderation.detail.profileSnapshot')}
                </p>
                <dl className="moderation-detail-grid">
                  <dt>Display Name</dt>
                  <dd>{report.evidence.profileEvidence.displayName}</dd>
                  <dt>Username</dt>
                  <dd>@{report.evidence.profileEvidence.username}</dd>
                  {report.evidence.profileEvidence.bio && (
                    <>
                      <dt>Bio</dt>
                      <dd>{report.evidence.profileEvidence.bio}</dd>
                    </>
                  )}
                  {report.evidence.profileEvidence.avatarUrl && (
                    <>
                      <dt>Avatar</dt>
                      <dd>
                        <img
                          src={report.evidence.profileEvidence.avatarUrl}
                          alt="avatar"
                          style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      </dd>
                    </>
                  )}
                  {report.evidence.profileEvidence.bannerUrl && (
                    <>
                      <dt>Banner</dt>
                      <dd>
                        <img
                          src={report.evidence.profileEvidence.bannerUrl}
                          alt="banner"
                          style={{ width: 256, height: 64, borderRadius: '0.5rem', objectFit: 'cover' }}
                        />
                      </dd>
                    </>
                  )}
                  <dt>Snapshot At</dt>
                  <dd>{new Date(report.evidence.profileEvidence.snapshotAt).toLocaleString()}</dd>
                </dl>
              </>
            )}

            {/* No structured evidence (e.g. manual report without message/profile payload) */}
            {!report.evidence && !hasScanEvidenceSession && (
              <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{t('moderation.detail.noEvents')}</p>
            )}
          </TabContent>

          {/* Target History tab */}
          <TabContent value="target-history">
            <ReportHistoryTab
              identityId={report.targetIdentityId}
              currentReportId={report.id}
              filterKey="targetIdentityId"
            />
          </TabContent>

          {/* Reporter History tab */}
          <TabContent value="reporter-history">
            <ReportHistoryTab
              identityId={report.reporterIdentityId}
              currentReportId={report.id}
              filterKey="reporterIdentityId"
            />
          </TabContent>

          {/* Timeline tab */}
          <TabContent value="timeline">
            {events.length === 0 && (
              <p style={{ opacity: 0.6, fontSize: '0.875rem' }}>{t('moderation.detail.noEvents')}</p>
            )}
            <div className="moderation-timeline">
              {events.map((ev) => {
                const meta = ev.metadata as Record<string, unknown> | undefined;
                let metaDetail: string | null = null;
                if (meta) {
                  if (ev.eventType === 'status_change' && meta.from && meta.to) {
                    const fromLabel = t(`moderation.reports.status.${meta.from as string}`, meta.from as string);
                    const toLabel = t(`moderation.reports.status.${meta.to as string}`, meta.to as string);
                    metaDetail = t('moderation.detail.eventMeta.statusTransition', { from: fromLabel, to: toLabel });
                  } else if (ev.eventType === 'assignment_change') {
                    const assignedTo = meta.assignedTo as string | null | undefined;
                    const fromIdentity = meta.from as string | null | undefined;
                    if (assignedTo && fromIdentity) {
                      metaDetail = t('moderation.detail.eventMeta.reassigned', {
                        from: fmtId(fromIdentity),
                        to: fmtId(assignedTo),
                      });
                    } else if (assignedTo) {
                      metaDetail = t('moderation.detail.eventMeta.assignedTo', { user: fmtId(assignedTo) });
                    } else {
                      metaDetail = t('moderation.detail.eventMeta.unassigned');
                    }
                  } else if (ev.eventType === 'category_change' && meta.from && meta.to) {
                    const fromCat = t(`moderation.reports.category.${meta.from as string}`, meta.from as string);
                    const toCat = t(`moderation.reports.category.${meta.to as string}`, meta.to as string);
                    metaDetail = t('moderation.detail.eventMeta.categoryChanged', { from: fromCat, to: toCat });
                  }
                }

                return (
                  <div key={ev.id} className={`moderation-timeline-event moderation-event-${ev.eventType}`}>
                    <div className="moderation-timeline-meta">
                      <span className="moderation-timeline-type">
                        {t(`moderation.detail.eventType.${ev.eventType}`, ev.eventType)}
                        {metaDetail && (
                          <span style={{ fontWeight: 'normal', marginLeft: '0.5rem', opacity: 0.7 }}>
                            ({metaDetail})
                          </span>
                        )}
                        {ev.actorIdentityId && (
                          <span style={{ fontWeight: 'normal', marginLeft: '0.5rem', opacity: 0.7 }}>
                            — {fmtId(ev.actorIdentityId)}
                          </span>
                        )}
                      </span>
                      <span className="moderation-timeline-date">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {ev.body && <p className="moderation-timeline-body">{ev.body}</p>}
                  </div>
                );
              })}
            </div>
          </TabContent>
        </Tabs>
      </div>

      {/* Resolution info */}
      {report.resolution && (
        <div className="admin-card">
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--color-surface-alt, rgba(0,0,0,0.05))' }}>
            <strong>{t('moderation.detail.resolution')}</strong>
            <p style={{ margin: '0.25rem 0' }}>{report.resolution.reason}</p>
            <small style={{ opacity: 0.6 }}>
              {t('moderation.detail.resolvedBy')}: {fmtId(report.resolution.resolvedByIdentityId)} &mdash; {new Date(report.resolution.resolvedAt).toLocaleString()}
            </small>
          </div>
        </div>
      )}

      {report.closureReason && (
        <div className="admin-card">
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--color-surface-alt, rgba(0,0,0,0.05))' }}>
            <strong>{t('moderation.detail.closedLabel')}</strong>
            <p style={{ margin: '0.25rem 0' }}>{report.closureReason}</p>
            <small style={{ opacity: 0.6 }}>
              {t('moderation.detail.closedByLabel')}: {fmtId(report.closedByIdentityId)} &mdash; {report.closedAt ? new Date(report.closedAt).toLocaleString() : ''}
            </small>
          </div>
        </div>
      )}

      {/* Reopen action (resolved / closed reports) */}
      {isReopenable && (
        <div className="admin-card">
          <h2 className="admin-card-title">{t('moderation.detail.actions')}</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button variant="primary" size="sm" onClick={() => setShowReopen(!showReopen)} disabled={actionLoading}>
              {t('moderation.detail.reopen')}
            </Button>
          </div>
          {showReopen && (
            <div className="moderation-action-form">
              <h3>{t('moderation.detail.reopenTitle')}</h3>
              <div className="input-wrapper">
                <textarea
                  className="input"
                  rows={2}
                  placeholder={t('moderation.detail.reopenReasonPlaceholder')}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                <Button variant="primary" size="sm" onClick={handleReopen} disabled={actionLoading}>
                  {t('moderation.detail.confirmReopen')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowReopen(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions (open / escalated reports) */}
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

          {showResolve && (
            <div className="moderation-action-form">
              <h3>{t('moderation.detail.resolveTitle')}</h3>
              <div className="input-wrapper">
                <textarea
                  className="input"
                  rows={3}
                  placeholder={t('moderation.detail.reasonPlaceholder')}
                  value={resolveReason}
                  onChange={(e) => setResolveReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
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

          {showClose && (
            <div className="moderation-action-form">
              <h3>{t('moderation.detail.closeTitle')}</h3>
              <div className="input-wrapper">
                <textarea
                  className="input"
                  rows={3}
                  placeholder={t('moderation.detail.closeReasonPlaceholder')}
                  value={closeReason}
                  onChange={(e) => setCloseReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
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

      {/* Law Enforcement report action */}
      {canManageEscalated && report.status !== 'closed' && (
        <div className="admin-card">
          <h2 className="admin-card-title">{t('moderation.detail.leReport')}</h2>
          {report.ncmecStatus === 'submitted' ? (
            <div style={{ fontSize: '0.875rem' }}>
              <p style={{ opacity: 0.7, margin: 0 }}>
                {t('moderation.detail.leReportAlreadyFiled')}
              </p>
              {report.ncmecReportId && (
                <p style={{ margin: '0.25rem 0 0' }}>
                  {t('moderation.detail.ncmecReportId')}: <strong>{report.ncmecReportId}</strong>
                </p>
              )}
            </div>
          ) : (
            <>
              {report.ncmecStatus === 'failed' && (
                <p className="le-report-failed-badge" style={{ margin: '0 0 0.75rem', display: 'inline-block' }}>
                  {t('moderation.detail.ncmecSubmitFailed')}
                  {report.ncmecError ? (
                    <span style={{ display: 'block', marginTop: '0.25rem', fontWeight: 400 }}>
                      {report.ncmecError}
                    </span>
                  ) : null}
                </p>
              )}
            <Button
              variant="primary"
              className="btn-danger"
              size="sm"
              onClick={() => setShowLeReport(true)}
              disabled={actionLoading}
            >
              {report.ncmecStatus === 'failed'
                ? t('moderation.detail.leReportRetry')
                : t('moderation.detail.leReport')}
            </Button>
            </>
          )}
        </div>
      )}

      <LeReportModal
        open={showLeReport}
        onOpenChange={setShowLeReport}
        onSubmit={handleFileLeReport}
        loading={leReportLoading}
        defaultCategory="csam"
      />

      {/* Comment form */}
      <div className="admin-card">
        <h2 className="admin-card-title">{t('moderation.detail.addComment')}</h2>
        <div className="input-wrapper">
          <textarea
            className="input"
            rows={2}
            placeholder={t('moderation.detail.commentPlaceholder')}
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>
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

    </div>
  );
}
