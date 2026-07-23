import { createApiClient, PLATFORM_SETTING_KEYS, type PublicPlatformSetting } from '@adieuu/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { useAppConfig } from '../../config';

function settingMap(settings: PublicPlatformSetting[]): Map<string, PublicPlatformSetting> {
  return new Map(settings.map((s) => [s.key, s]));
}

/**
 * Platform admin Spaces settings. Currently exposes the Space-creation toggle
 * (`platform-space-creation-enabled`); platform admins can always create.
 */
export function AdminSpaces() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [creationEnabled, setCreationEnabled] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setLoadError(null);
    const res = await api.admin.getPlatformSettings();
    if (!res.success || !res.data) {
      setLoadError(t('admin.spaces.loadError'));
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    const map = settingMap(res.data);
    const creationDoc = map.get(PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED);
    setCreationEnabled(
      creationDoc?.valueType === 'boolean' ? Boolean(creationDoc.value) : false,
    );
    if (!silent) {
      setLoading(false);
    }
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);

    const res = await api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.SPACE_CREATION_ENABLED, {
      valueType: 'boolean',
      value: creationEnabled,
      description:
        'Whether non-admin identities may create new Spaces (platform admins always can)',
    });

    if (res.success) {
      await load({ silent: true });
    } else {
      setSaveError(t('admin.spaces.saveError'));
    }
    setSaving(false);
  };

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('admin.spaces.title')}</h1>
        <p className="page-subtitle">{t('admin.spaces.subtitle')}</p>
      </div>

      {loadError && (
        <Card className="admin-card admin-card-error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          <Card className="admin-card">
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={creationEnabled}
                onChange={(e) => setCreationEnabled(e.target.checked)}
              />
              <span>{t('admin.spaces.creationEnabled')}</span>
            </label>
            <p className="admin-hint">{t('admin.spaces.creationEnabledHint')}</p>
          </Card>

          {saveError && <p className="admin-inline-error">{saveError}</p>}

          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {t('admin.spaces.save')}
          </Button>
        </>
      )}
    </div>
  );
}
