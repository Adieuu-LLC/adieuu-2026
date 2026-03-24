import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, type PlatformAdminRow } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function AdminPlatformAdmins() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.admin.listPlatformAdmins();
    if (res.success && res.data) {
      setAdmins(res.data.admins);
    } else {
      setLoadError(t('admin.platformAdmins.loadError'));
      setAdmins([]);
    }
    setLoading(false);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    const trimmed = identifier.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    const res = await api.admin.addPlatformAdmin({ identifier: trimmed });
    if (res.success && res.data) {
      setAdmins(res.data.admins);
      setIdentifier('');
    } else {
      setAddError(t('admin.platformAdmins.addError'));
    }
    setAdding(false);
  };

  const confirmRemove = async () => {
    if (!removeId) return;
    setRemoving(true);
    const res = await api.admin.removePlatformAdmin(removeId);
    if (res.success && res.data) {
      setAdmins(res.data.admins);
    } else {
      setLoadError(t('admin.platformAdmins.removeError'));
    }
    setRemoving(false);
    setRemoveId(null);
  };

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('admin.platformAdmins.title')}</h1>
        <p className="page-subtitle">{t('admin.platformAdmins.subtitle')}</p>
      </div>

      {loadError && (
        <Card className="admin-card admin-card-error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      <Card className="admin-card">
        <div className="admin-add-row">
          <input
            type="text"
            className="admin-input"
            placeholder={t('admin.platformAdmins.identifierPlaceholder')}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={adding}
            aria-label={t('admin.platformAdmins.identifierPlaceholder')}
          />
          <Button variant="primary" onClick={() => void handleAdd()} disabled={adding || !identifier.trim()}>
            {t('admin.platformAdmins.add')}
          </Button>
        </div>
        {addError && <p className="admin-inline-error">{addError}</p>}
      </Card>

      {loading ? (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <Card className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.platformAdmins.table.displayName')}</th>
                  <th>{t('admin.platformAdmins.table.email')}</th>
                  <th>{t('admin.platformAdmins.table.phone')}</th>
                  <th>{t('admin.platformAdmins.table.userId')}</th>
                  <th>{t('admin.platformAdmins.table.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((row) => (
                  <tr key={row.userId}>
                    <td>
                      {row.stale ? (
                        <span className="admin-stale">{t('admin.platformAdmins.table.stale')}</span>
                      ) : (
                        row.displayName ?? '—'
                      )}
                    </td>
                    <td>{row.email ?? '—'}</td>
                    <td>{row.phone ?? '—'}</td>
                    <td>
                      <code className="admin-mono">{row.userId}</code>
                    </td>
                    <td>
                      <Button variant="ghost" size="sm" onClick={() => setRemoveId(row.userId)}>
                        {t('admin.platformAdmins.table.remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
        title={t('common.confirm')}
        description={t('admin.platformAdmins.removeConfirm')}
        confirmLabel={t('common.remove')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={removing}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
