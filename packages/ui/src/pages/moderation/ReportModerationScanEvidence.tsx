/**
 * Loads presigned scan-copy URLs for automated hash-check reports (conv_scan cleartext).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModerationScanEvidenceResponse } from '@adieuu/shared';
import type { createApiClient } from '@adieuu/shared';
import { Button } from '../../components/Button';

type Api = ReturnType<typeof createApiClient>;

export function ReportModerationScanEvidence({ reportId, api }: { reportId: string; api: Api }) {
  const { t } = useTranslation();
  const [data, setData] = useState<ModerationScanEvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.moderation.getReportScanEvidence(reportId);
    if (res.success && res.data) {
      setData(res.data);
    } else {
      setData(null);
      setError(
        (!res.success && 'error' in res ? res.error?.message : null) ??
          t('moderation.detail.scanEvidenceLoadError')
      );
    }
    setLoading(false);
  }, [api, reportId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
        <span className="spinner spinner-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="admin-card"
        style={{
          padding: '1rem',
          marginBottom: '1rem',
          borderColor: 'var(--color-danger-muted, rgba(220, 53, 69, 0.35))',
          color: 'var(--color-danger, #c62828)',
          fontSize: '0.875rem',
        }}
      >
        {error}
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div
        className="admin-card"
        style={{
          padding: '1rem',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          opacity: 0.75,
        }}
      >
        <p style={{ margin: 0 }}>{t('moderation.detail.scanEvidenceEmpty')}</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <h3 className="admin-card-title" style={{ margin: 0 }}>
          {t('moderation.detail.scanEvidenceTitle')}
        </h3>
        <Button variant="ghost" size="sm" type="button" onClick={() => void load()}>
          {t('moderation.detail.scanEvidenceRefresh')}
        </Button>
      </div>
      <p style={{ fontSize: '0.75rem', opacity: 0.65, margin: '0 0 0.75rem' }}>
        {t('moderation.detail.scanEvidenceExpiresHint', { minutes: Math.round(data.expiresInSeconds / 60) })}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
          gap: '1rem',
        }}
      >
        {data.items.map((item, index) => (
          <div
            key={item.mediaId}
            className="admin-card"
            style={{
              padding: '0.75rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ fontSize: '0.7rem', opacity: 0.6, marginBottom: '0.5rem', wordBreak: 'break-all' }}>
              {t('moderation.detail.scanEvidencePartLabel', { index: index + 1 })} · {item.mediaId} ·{' '}
              {item.contentType}
            </div>
            {item.contentType.startsWith('video/') ? (
              <video
                src={item.downloadUrl}
                controls
                playsInline
                preload="metadata"
                style={{
                  width: '100%',
                  maxHeight: 'min(50vh, 360px)',
                  borderRadius: '0.375rem',
                  background: 'var(--color-surface-inverse-muted, #111)',
                }}
              >
                {t('moderation.detail.scanEvidenceVideoUnsupported')}
              </video>
            ) : (
              <img
                src={item.downloadUrl}
                alt=""
                loading="lazy"
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: 'min(50vh, 420px)',
                  objectFit: 'contain',
                  borderRadius: '0.375rem',
                  display: 'block',
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
