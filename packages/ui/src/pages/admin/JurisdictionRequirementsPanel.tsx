import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type AdminJurisdictionRequirement,
  type JurisdictionRequirementSeedMode,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';

const EMPTY_FORM = {
  jurisdiction: '',
  jurisdictionName: '',
  region: '',
  vmyBusinessSettingsId: '',
};

export function JurisdictionRequirementsPanel() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [jurisdictions, setJurisdictions] = useState<AdminJurisdictionRequirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [seedMode, setSeedMode] = useState<JurisdictionRequirementSeedMode>('additive');
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.admin.getJurisdictionRequirements();
    if (res.success && res.data) {
      setJurisdictions(res.data.jurisdictions);
    } else {
      setLoadError(t('compliance.admin.jurisdictionRequirementsLoadError'));
      setJurisdictions([]);
    }
    setLoading(false);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingCode(null);
    setSaveError(null);
  };

  const startEdit = (row: AdminJurisdictionRequirement) => {
    setEditingCode(row.jurisdiction);
    setForm({
      jurisdiction: row.jurisdiction,
      jurisdictionName: row.jurisdictionName,
      region: row.region,
      vmyBusinessSettingsId: row.verificationConfig?.vmyBusinessSettingsId ?? '',
    });
    setSaveError(null);
    setSaveSuccess(null);
  };

  const saveJurisdiction = async () => {
    if (!editingCode) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const trimmedId = form.vmyBusinessSettingsId.trim();
    const res = await api.admin.updateJurisdictionVerificationConfig(editingCode, {
      vmyBusinessSettingsId: trimmedId || undefined,
    });

    if (res.success && res.data) {
      setSaveSuccess(t('compliance.admin.jurisdictionRequirementsSaveSuccess'));
      resetForm();
      await load();
    } else {
      setSaveError(t('compliance.admin.jurisdictionRequirementsSaveError'));
    }
    setSaving(false);
  };

  const runSeed = async () => {
    if (
      seedMode === 'clobber' &&
      !window.confirm(t('compliance.admin.jurisdictionRequirementsSeedClobberConfirm'))
    ) {
      return;
    }

    setSeeding(true);
    setSeedError(null);
    setSeedSuccess(null);

    const res = await api.admin.runJurisdictionRequirementsSeed(seedMode);
    if (res.success && res.data) {
      setJurisdictions(res.data.jurisdictions);
      setSeedSuccess(
        t('compliance.admin.jurisdictionRequirementsSeedSuccess', {
          upserted: res.data.result.upserted,
        }),
      );
      resetForm();
    } else {
      setSeedError(t('compliance.admin.jurisdictionRequirementsSeedError'));
    }
    setSeeding(false);
  };

  const configuredCount = jurisdictions.filter(
    (row) => row.verificationConfig?.vmyBusinessSettingsId,
  ).length;

  return (
    <div className="admin-jurisdiction-requirements">
      <div className="admin-jurisdiction-requirements__header">
        <div>
          <h2 className="admin-jurisdiction-requirements__title">
            {t('compliance.admin.jurisdictionRequirementsTitle')}
          </h2>
          <p className="admin-hint">{t('compliance.admin.jurisdictionRequirementsDescription')}</p>
        </div>
        {!loading && (
          <span className="admin-jurisdiction-requirements__count">
            {t('compliance.admin.jurisdictionRequirementsCount', {
              configured: configuredCount,
              total: jurisdictions.length,
            })}
          </span>
        )}
      </div>

      {loadError && (
        <div className="admin-jurisdiction-requirements__message admin-jurisdiction-requirements__message--error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="admin-loading">
          <div className="spinner spinner-lg" />
        </div>
      ) : (
        <>
          {jurisdictions.length === 0 ? (
            <p className="admin-hint">{t('compliance.admin.jurisdictionRequirementsEmpty')}</p>
          ) : (
            <div className="admin-table-wrap admin-jurisdiction-requirements__table-wrap">
              <table className="admin-table admin-jurisdiction-requirements__table">
                <thead>
                  <tr>
                    <th>{t('compliance.admin.jurisdictionRequirementsCodeHeader')}</th>
                    <th>{t('compliance.admin.jurisdictionRequirementsNameHeader')}</th>
                    <th>{t('compliance.admin.jurisdictionRequirementsRegionHeader')}</th>
                    <th>{t('compliance.admin.jurisdictionRequirementsBusinessIdHeader')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {jurisdictions.map((row) => (
                    <tr key={row.jurisdiction}>
                      <td className="admin-mono">{row.jurisdiction}</td>
                      <td>{row.jurisdictionName}</td>
                      <td>{row.region}</td>
                      <td className="admin-mono">
                        {row.verificationConfig?.vmyBusinessSettingsId ?? '—'}
                      </td>
                      <td>
                        <Button variant="secondary" size="sm" onClick={() => startEdit(row)}>
                          {t('compliance.admin.jurisdictionRequirementsEdit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {editingCode && (
            <div className="admin-jurisdiction-requirements__form">
              <h3 className="admin-jurisdiction-requirements__subtitle">
                {t('compliance.admin.jurisdictionRequirementsEditTitle', { code: editingCode })}
              </h3>
              <div className="admin-jurisdiction-requirements__form-grid">
                <label className="admin-jurisdiction-requirements__field">
                  <span className="admin-field-label">
                    {t('compliance.admin.jurisdictionRequirementsCodeLabel')}
                  </span>
                  <input className="admin-input" value={form.jurisdiction} disabled spellCheck={false} />
                </label>
                <label className="admin-jurisdiction-requirements__field">
                  <span className="admin-field-label">
                    {t('compliance.admin.jurisdictionRequirementsNameLabel')}
                  </span>
                  <input className="admin-input" value={form.jurisdictionName} disabled />
                </label>
                <label className="admin-jurisdiction-requirements__field">
                  <span className="admin-field-label">
                    {t('compliance.admin.jurisdictionRequirementsRegionLabel')}
                  </span>
                  <input className="admin-input" value={form.region} disabled />
                </label>
                <label className="admin-jurisdiction-requirements__field admin-jurisdiction-requirements__field--wide">
                  <span className="admin-field-label">
                    {t('compliance.admin.jurisdictionRequirementsBusinessIdLabel')}
                  </span>
                  <input
                    className="admin-input"
                    value={form.vmyBusinessSettingsId}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, vmyBusinessSettingsId: e.target.value }))
                    }
                    maxLength={128}
                    spellCheck={false}
                    placeholder={t('compliance.admin.jurisdictionRequirementsBusinessIdPlaceholder')}
                  />
                </label>
              </div>
              <p className="admin-hint">{t('compliance.admin.jurisdictionRequirementsBusinessIdHint')}</p>
              <div className="admin-jurisdiction-requirements__form-actions">
                <Button variant="primary" onClick={() => void saveJurisdiction()} disabled={saving}>
                  {t('compliance.admin.jurisdictionRequirementsUpdateButton')}
                </Button>
                <Button variant="secondary" onClick={resetForm} disabled={saving}>
                  {t('compliance.admin.jurisdictionRequirementsCancelEdit')}
                </Button>
              </div>
              {saveError && <p className="admin-inline-error">{saveError}</p>}
            </div>
          )}

          {saveSuccess && <p className="admin-inline-success">{saveSuccess}</p>}

          <div className="admin-jurisdiction-requirements__seed">
            <h3 className="admin-jurisdiction-requirements__subtitle">
              {t('compliance.admin.jurisdictionRequirementsSeedTitle')}
            </h3>
            <p className="admin-hint">{t('compliance.admin.jurisdictionRequirementsSeedDescription')}</p>
            <div className="admin-jurisdiction-requirements__seed-options">
              <label className="admin-jurisdiction-requirements__seed-option">
                <input
                  type="radio"
                  name="jurisdiction-seed-mode"
                  value="additive"
                  checked={seedMode === 'additive'}
                  onChange={() => setSeedMode('additive')}
                />
                <span>{t('compliance.admin.jurisdictionRequirementsSeedAdditive')}</span>
              </label>
              <label className="admin-jurisdiction-requirements__seed-option">
                <input
                  type="radio"
                  name="jurisdiction-seed-mode"
                  value="clobber"
                  checked={seedMode === 'clobber'}
                  onChange={() => setSeedMode('clobber')}
                />
                <span>{t('compliance.admin.jurisdictionRequirementsSeedClobber')}</span>
              </label>
            </div>
            <Button variant="secondary" onClick={() => void runSeed()} disabled={seeding}>
              {t('compliance.admin.jurisdictionRequirementsSeedButton')}
            </Button>
            {seedError && <p className="admin-inline-error">{seedError}</p>}
            {seedSuccess && <p className="admin-inline-success">{seedSuccess}</p>}
          </div>
        </>
      )}
    </div>
  );
}
