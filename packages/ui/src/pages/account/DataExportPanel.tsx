import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import { createApiClient, type AccountDataExport } from '@adieuu/shared';
import { useAppConfig } from '../../config';

export function DataExportPanel() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [data, setData] = useState<AccountDataExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const response = await api.accountData.getDataExport();
        if (!cancelled && response.success && response.data) {
          setData(response.data);
        } else if (!cancelled) {
          setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [api]);

  const handleDownload = useCallback(() => {
    if (!data) return;

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t('account.security.dataExport.fileName', 'adieuu-account-data-export.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data, t]);

  if (loading) {
    return (
      <div className="data-export-loading">
        <Spinner size="md" />
        <p>{t('account.security.dataExport.loading')}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="data-export-error">
        <p>{t('account.security.dataExport.error')}</p>
      </div>
    );
  }

  return (
    <div className="data-export-panel">
      <div className="data-export-header">
        <div>
          <h3>{t('account.security.dataExport.title')}</h3>
          <p className="data-export-description">
            {t('account.security.dataExport.description')}
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleDownload}>
          {t('account.security.dataExport.download')}
        </Button>
      </div>
      <div className="data-export-viewer">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}
