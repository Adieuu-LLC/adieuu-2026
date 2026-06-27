import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { createApiClient, type AdminMetrics } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

export function AdminDashboard() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuth();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.admin.getMetrics();
    if (res.success && res.data) {
      setMetrics(res.data);
    } else {
      setError(t('admin.dashboard.loadError'));
      setMetrics(null);
    }
    setLoading(false);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: t('admin.dashboard.chartUsers'), value: metrics.totalUsers },
      { name: t('admin.dashboard.chartIdentities'), value: metrics.totalIdentities },
      { name: t('admin.dashboard.chartActive15m'), value: metrics.activeIdentities15m },
      { name: t('admin.dashboard.chartActive24h'), value: metrics.activeIdentities24h },
    ];
  }, [metrics, t]);

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('admin.dashboard.title')}</h1>
        <p className="page-subtitle">{t('admin.dashboard.subtitle')}</p>
      </div>

      {error && (
        <Card className="admin-card admin-card-error">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {loading && !metrics && !error && (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      )}

      {metrics && (
        <>
          <div className="admin-stat-grid">
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('admin.dashboard.stats.totalUsers')}</div>
              <div className="admin-stat-value">{metrics.totalUsers}</div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('admin.dashboard.stats.totalIdentities')}</div>
              <div className="admin-stat-value">{metrics.totalIdentities}</div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('admin.dashboard.stats.active15m')}</div>
              <div className="admin-stat-value">{metrics.activeIdentities15m}</div>
            </Card>
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('admin.dashboard.stats.active24h')}</div>
              <div className="admin-stat-value">{metrics.activeIdentities24h}</div>
            </Card>
          </div>

          {session?.geo && (
            <Card className="admin-stat-card">
              <div className="admin-stat-label">{t('admin.dashboard.geoLabel')}</div>
              <div className="admin-stat-value">{session.geo.jurisdiction}</div>
              <div className="admin-stat-label" style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                {t('admin.dashboard.geoCheckedAt', {
                  date: new Date(session.geo.checkedAt).toLocaleDateString(),
                })}
              </div>
            </Card>
          )}

          <Card className="admin-chart-card">
            <h2 className="admin-section-title">{t('admin.dashboard.chartTitle')}</h2>
            <div className="admin-chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--color-text-muted)" />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface-elevated)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                  <Bar dataKey="value" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
