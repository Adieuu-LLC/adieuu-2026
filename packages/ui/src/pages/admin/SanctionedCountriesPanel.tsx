import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type AdminSanctionedCountry,
  type SanctionedCountrySeedMode,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Button } from '../../components/Button';

const EMPTY_FORM = {
  countryCode: '',
  countryName: '',
  program: 'OFAC',
  active: true,
};

export function SanctionedCountriesPanel() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [countries, setCountries] = useState<AdminSanctionedCountry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [seedMode, setSeedMode] = useState<SanctionedCountrySeedMode>('additive');
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedSuccess, setSeedSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const res = await api.admin.getSanctionedCountries();
    if (res.success && res.data) {
      setCountries(res.data.countries);
    } else {
      setLoadError(t('compliance.admin.sanctionedCountriesLoadError'));
      setCountries([]);
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
    setSaveSuccess(null);
  };

  const startEdit = (row: AdminSanctionedCountry) => {
    setEditingCode(row.countryCode);
    setForm({
      countryCode: row.countryCode,
      countryName: row.countryName,
      program: row.program ?? 'OFAC',
      active: row.active,
    });
    setSaveError(null);
    setSaveSuccess(null);
  };

  const saveCountry = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const code = form.countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      setSaveError(t('compliance.admin.sanctionedCountriesInvalidCode'));
      setSaving(false);
      return;
    }

    const res = await api.admin.upsertSanctionedCountry(code, {
      countryName: form.countryName.trim(),
      program: form.program.trim() || undefined,
      active: form.active,
    });

    if (res.success && res.data) {
      setSaveSuccess(t('compliance.admin.sanctionedCountriesSaveSuccess'));
      resetForm();
      await load();
    } else {
      setSaveError(t('compliance.admin.sanctionedCountriesSaveError'));
    }
    setSaving(false);
  };

  const runSeed = async () => {
    if (
      seedMode === 'clobber' &&
      !window.confirm(t('compliance.admin.sanctionedCountriesSeedClobberConfirm'))
    ) {
      return;
    }

    setSeeding(true);
    setSeedError(null);
    setSeedSuccess(null);

    const res = await api.admin.runSanctionedCountriesSeed(seedMode);
    if (res.success && res.data) {
      setCountries(res.data.countries);
      setSeedSuccess(
        t('compliance.admin.sanctionedCountriesSeedSuccess', {
          upserted: res.data.result.upserted,
          deactivated: res.data.result.deactivated,
        }),
      );
      resetForm();
    } else {
      setSeedError(t('compliance.admin.sanctionedCountriesSeedError'));
    }
    setSeeding(false);
  };

  const activeCount = countries.filter((row) => row.active).length;

  return (
    <div className="admin-sanctioned-countries">
      <div className="admin-sanctioned-countries__header">
        <div>
          <h2 className="admin-sanctioned-countries__title">
            {t('compliance.admin.sanctionedCountriesTitle')}
          </h2>
          <p className="admin-hint">{t('compliance.admin.sanctionedCountriesDescription')}</p>
          <p className="admin-sanctioned-countries__warning" role="note">
            {t('compliance.admin.sanctionedCountriesPermabanWarning')}
          </p>
        </div>
        {!loading && (
          <span className="admin-sanctioned-countries__count">
            {t('compliance.admin.sanctionedCountriesCount', {
              active: activeCount,
              total: countries.length,
            })}
          </span>
        )}
      </div>

      {loadError && (
        <div className="admin-sanctioned-countries__message admin-sanctioned-countries__message--error">
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
          {countries.length === 0 ? (
            <p className="admin-hint">{t('compliance.admin.sanctionedCountriesEmpty')}</p>
          ) : (
            <div className="admin-table-wrap admin-sanctioned-countries__table-wrap">
              <table className="admin-table admin-sanctioned-countries__table">
                <thead>
                  <tr>
                    <th>{t('compliance.admin.sanctionedCountriesCodeHeader')}</th>
                    <th>{t('compliance.admin.sanctionedCountriesNameHeader')}</th>
                    <th>{t('compliance.admin.sanctionedCountriesProgramHeader')}</th>
                    <th>{t('compliance.admin.sanctionedCountriesActiveHeader')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {countries.map((row) => (
                    <tr key={row.countryCode} className={row.active ? undefined : 'admin-sanctioned-countries__inactive-row'}>
                      <td className="admin-mono">{row.countryCode}</td>
                      <td>{row.countryName}</td>
                      <td>{row.program ?? '—'}</td>
                      <td>
                        {row.active
                          ? t('compliance.admin.sanctionedCountriesActiveYes')
                          : t('compliance.admin.sanctionedCountriesActiveNo')}
                      </td>
                      <td>
                        <Button variant="secondary" size="sm" onClick={() => startEdit(row)}>
                          {t('compliance.admin.sanctionedCountriesEdit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-sanctioned-countries__form">
            <h3 className="admin-sanctioned-countries__subtitle">
              {editingCode
                ? t('compliance.admin.sanctionedCountriesEditTitle', { code: editingCode })
                : t('compliance.admin.sanctionedCountriesAddTitle')}
            </h3>
            <div className="admin-sanctioned-countries__form-grid">
              <label className="admin-sanctioned-countries__field">
                <span className="admin-field-label">{t('compliance.admin.sanctionedCountriesCodeLabel')}</span>
                <input
                  className="admin-input"
                  value={form.countryCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
                  disabled={editingCode !== null}
                  maxLength={2}
                  spellCheck={false}
                  placeholder="CU"
                />
              </label>
              <label className="admin-sanctioned-countries__field">
                <span className="admin-field-label">{t('compliance.admin.sanctionedCountriesNameLabel')}</span>
                <input
                  className="admin-input"
                  value={form.countryName}
                  onChange={(e) => setForm((prev) => ({ ...prev, countryName: e.target.value }))}
                  placeholder="Cuba"
                />
              </label>
              <label className="admin-sanctioned-countries__field">
                <span className="admin-field-label">{t('compliance.admin.sanctionedCountriesProgramLabel')}</span>
                <input
                  className="admin-input"
                  value={form.program}
                  onChange={(e) => setForm((prev) => ({ ...prev, program: e.target.value }))}
                  placeholder="OFAC"
                />
              </label>
              <label className="admin-toggle admin-sanctioned-countries__active-toggle">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))}
                />
                <span>{t('compliance.admin.sanctionedCountriesActiveLabel')}</span>
              </label>
            </div>
            <div className="admin-sanctioned-countries__form-actions">
              <Button variant="primary" onClick={() => void saveCountry()} disabled={saving}>
                {editingCode
                  ? t('compliance.admin.sanctionedCountriesUpdateButton')
                  : t('compliance.admin.sanctionedCountriesAddButton')}
              </Button>
              {editingCode && (
                <Button variant="secondary" onClick={resetForm} disabled={saving}>
                  {t('compliance.admin.sanctionedCountriesCancelEdit')}
                </Button>
              )}
            </div>
            {saveError && <p className="admin-inline-error">{saveError}</p>}
            {saveSuccess && <p className="admin-inline-success">{saveSuccess}</p>}
          </div>

          <div className="admin-sanctioned-countries__seed">
            <h3 className="admin-sanctioned-countries__subtitle">
              {t('compliance.admin.sanctionedCountriesSeedTitle')}
            </h3>
            <p className="admin-hint">{t('compliance.admin.sanctionedCountriesSeedDescription')}</p>
            <div className="admin-sanctioned-countries__seed-options">
              <label className="admin-sanctioned-countries__seed-option">
                <input
                  type="radio"
                  name="sanctioned-seed-mode"
                  value="additive"
                  checked={seedMode === 'additive'}
                  onChange={() => setSeedMode('additive')}
                />
                <span>{t('compliance.admin.sanctionedCountriesSeedAdditive')}</span>
              </label>
              <label className="admin-sanctioned-countries__seed-option">
                <input
                  type="radio"
                  name="sanctioned-seed-mode"
                  value="clobber"
                  checked={seedMode === 'clobber'}
                  onChange={() => setSeedMode('clobber')}
                />
                <span>{t('compliance.admin.sanctionedCountriesSeedClobber')}</span>
              </label>
            </div>
            <Button variant="secondary" onClick={() => void runSeed()} disabled={seeding}>
              {t('compliance.admin.sanctionedCountriesSeedButton')}
            </Button>
            {seedError && <p className="admin-inline-error">{seedError}</p>}
            {seedSuccess && <p className="admin-inline-success">{seedSuccess}</p>}
          </div>
        </>
      )}
    </div>
  );
}
