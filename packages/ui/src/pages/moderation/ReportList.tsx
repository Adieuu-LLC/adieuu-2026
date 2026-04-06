import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createApiClient, type PublicReport } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';

const STATUS_OPTIONS = ['open', 'escalated', 'resolved', 'closed'] as const;
const ASSIGNED_OPTIONS = ['all', 'me', 'unassigned'] as const;

export function ReportList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const statusFilter = searchParams.get('status') ?? 'open,escalated';
  const assignedFilter = searchParams.get('assigned') ?? 'all';

  const [reports, setReports] = useState<PublicReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, string> = {
      page: String(currentPage),
      limit: String(limit),
    };
    if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
    if (assignedFilter && assignedFilter !== 'all') params.assigned = assignedFilter;

    const res = await api.moderation.listReports(params as Parameters<typeof api.moderation.listReports>[0]);
    if (res.success && res.data) {
      setReports(res.data.reports);
      setTotal(res.data.total);
    } else {
      setError(t('moderation.reports.loadError'));
    }
    setLoading(false);
  }, [api, currentPage, statusFilter, assignedFilter, t]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    next.set('page', '1');
    setSearchParams(next);
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('moderation.reports.title')}</h1>
        <p className="admin-page-subtitle">{t('moderation.reports.subtitle')}</p>
      </div>

      {/* Filters */}
      <div className="admin-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.75rem 1rem' }}>
        <label className="moderation-filter-label">
          <span>{t('moderation.reports.filterStatus')}</span>
          <select
            value={statusFilter}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="moderation-filter-select"
          >
            <option value="open,escalated">{t('moderation.reports.statusOpenEscalated')}</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`moderation.reports.status.${s}`)}
              </option>
            ))}
            <option value="all">{t('moderation.reports.statusAll')}</option>
          </select>
        </label>

        <label className="moderation-filter-label">
          <span>{t('moderation.reports.filterAssigned')}</span>
          <select
            value={assignedFilter}
            onChange={(e) => updateFilter('assigned', e.target.value)}
            className="moderation-filter-select"
          >
            {ASSIGNED_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`moderation.reports.assigned.${a}`)}
              </option>
            ))}
          </select>
        </label>

        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          {t('moderation.reports.refresh')}
        </Button>
      </div>

      {/* Error */}
      {error && <div className="admin-card" style={{ color: 'var(--color-danger)' }}>{error}</div>}

      {/* Loading */}
      {loading && (
        <div className="admin-card" style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <span className="spinner spinner-lg" />
        </div>
      )}

      {/* Report Table */}
      {!loading && reports.length > 0 && (
        <div className="admin-card" style={{ overflow: 'auto', padding: 0 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('moderation.reports.col.status')}</th>
                <th>{t('moderation.reports.col.category')}</th>
                <th>{t('moderation.reports.col.source')}</th>
                <th>{t('moderation.reports.col.target')}</th>
                <th>{t('moderation.reports.col.created')}</th>
                <th>{t('moderation.reports.col.assigned')}</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={report.id}
                  className="moderation-report-row"
                  onClick={() => navigate(`/moderation/reports/${report.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <span className={`moderation-status-badge moderation-status-${report.status}`}>
                      {t(`moderation.reports.status.${report.status}`)}
                    </span>
                  </td>
                  <td>{t(`moderation.reports.category.${report.category}`, report.category)}</td>
                  <td>{report.source === 'automated_rekognition' ? t('moderation.reports.sourceAuto') : t('moderation.reports.sourceManual')}</td>
                  <td className="moderation-cell-mono">{report.targetRef.type}:{report.targetRef.id.slice(0, 8)}</td>
                  <td>{new Date(report.createdAt).toLocaleDateString()}</td>
                  <td>{report.assignedTo ? report.assignedTo.slice(0, 8) + '...' : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && !error && (
        <div className="admin-card" style={{ textAlign: 'center', padding: '2rem' }}>
          {t('moderation.reports.empty')}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            {t('moderation.reports.prev')}
          </Button>
          <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem', opacity: 0.7 }}>
            {t('moderation.reports.pageOf', { current: currentPage, total: totalPages })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            {t('moderation.reports.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
