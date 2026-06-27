import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  PLATFORM_SETTING_KEYS,
  type PublicJurisdictionRequirement,
  type PublicPlatformSetting,
} from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { EffectiveAvJurisdictionsPanel } from './EffectiveAvJurisdictionsPanel';
import { JurisdictionRequirementsPanel } from './JurisdictionRequirementsPanel';
import { SanctionedCountriesPanel } from './SanctionedCountriesPanel';

function settingMap(settings: PublicPlatformSetting[]): Map<string, PublicPlatformSetting> {
  return new Map(settings.map((s) => [s.key, s]));
}

function toLines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

export function AdminAgeVerification() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [enabled, setEnabled] = useState(false);
  const [autoEmailBackgroundCheck, setAutoEmailBackgroundCheck] = useState(false);
  const [provider, setProvider] = useState('verifymy');
  const [environment, setEnvironment] = useState('sandbox');
  const [defaultBusinessSettingsId, setDefaultBusinessSettingsId] = useState('');
  const [ncmecEnvironment, setNcmecEnvironment] = useState('test');
  const [requiredMode, setRequiredMode] = useState('jurisdictions');
  const [requiredJurisdictions, setRequiredJurisdictions] = useState('');
  const [blockedJurisdictions, setBlockedJurisdictions] = useState('');
  const [lawLinks, setLawLinks] = useState('');

  const [catalogRows, setCatalogRows] = useState<PublicJurisdictionRequirement[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [enrichedOverrideRows, setEnrichedOverrideRows] = useState<PublicJurisdictionRequirement[]>([]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    setLoadError(null);
    setCatalogLoading(true);
    setCatalogError(false);

    const [settingsRes, catalogRes] = await Promise.all([
      api.admin.getPlatformSettings(),
      api.geo.getJurisdictionRequirementsCatalog(),
    ]);

    if (!settingsRes.success || !settingsRes.data) {
      setLoadError(t('compliance.admin.loadError'));
      if (!silent) setLoading(false);
      setCatalogLoading(false);
      return;
    }

    if (catalogRes.success && catalogRes.data) {
      setCatalogRows(catalogRes.data);
      setCatalogError(false);
    } else {
      setCatalogRows([]);
      setCatalogError(true);
    }
    setCatalogLoading(false);

    const map = settingMap(settingsRes.data);

    const e = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ENABLED);
    setEnabled(e?.valueType === 'boolean' ? Boolean(e.value) : false);

    const autoBg = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_AUTO_EMAIL_CHECK);
    setAutoEmailBackgroundCheck(autoBg?.valueType === 'boolean' ? Boolean(autoBg.value) : false);

    const p = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER);
    setProvider(p?.valueType === 'string' ? String(p.value) : 'verifymy');

    const env = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_ENV);
    setEnvironment(env?.valueType === 'string' ? String(env.value) : 'sandbox');

    const defaultBsId = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID);
    setDefaultBusinessSettingsId(
      defaultBsId?.valueType === 'string' ? String(defaultBsId.value) : '',
    );

    const ncmecEnv = map.get(PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV);
    setNcmecEnvironment(
      ncmecEnv?.valueType === 'string' && (ncmecEnv.value === 'test' || ncmecEnv.value === 'production')
        ? String(ncmecEnv.value)
        : 'test',
    );

    const mode = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE);
    setRequiredMode(mode?.valueType === 'string' ? String(mode.value) : 'jurisdictions');

    const rj = map.get(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS);
    setRequiredJurisdictions(
      rj?.valueType === 'stringArray' && Array.isArray(rj.value)
        ? (rj.value as string[]).join('\n')
        : '',
    );

    const bj = map.get(PLATFORM_SETTING_KEYS.GEOFENCE_BLOCKED_JURISDICTIONS);
    setBlockedJurisdictions(
      bj?.valueType === 'stringArray' && Array.isArray(bj.value)
        ? (bj.value as string[]).join('\n')
        : '',
    );

    const ll = map.get(PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS);
    setLawLinks(
      ll?.valueType === 'stringArray' && Array.isArray(ll.value)
        ? (ll.value as string[]).join('\n')
        : '',
    );

    if (!silent) setLoading(false);
  }, [api, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const adminOverrideCodes = useMemo(() => toLines(requiredJurisdictions), [requiredJurisdictions]);

  const catalogCodeSet = useMemo(
    () => new Set(catalogRows.map((row) => row.jurisdiction.trim().toUpperCase())),
    [catalogRows],
  );

  const overrideCodesNeedingLookup = useMemo(
    () =>
      adminOverrideCodes.filter((code) => !catalogCodeSet.has(code.trim().toUpperCase())),
    [adminOverrideCodes, catalogCodeSet],
  );

  useEffect(() => {
    if (overrideCodesNeedingLookup.length === 0) {
      setEnrichedOverrideRows([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      const res = await api.geo.getJurisdictionRequirements(overrideCodesNeedingLookup);
      if (cancelled) return;
      setEnrichedOverrideRows(res.success && res.data ? res.data : []);
    })();

    return () => {
      cancelled = true;
    };
  }, [api, overrideCodesNeedingLookup]);

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    const puts = [
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ENABLED, {
        valueType: 'boolean',
        value: enabled,
        description: 'Whether age verification enforcement is active',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_AUTO_EMAIL_CHECK, {
        valueType: 'boolean',
        value: autoEmailBackgroundCheck,
        description:
          'Automatically start silent email background age verification after checkout (requires enforcement enabled)',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_ACTIVE_PROVIDER, {
        valueType: 'string',
        value: provider,
        description: 'Active age verification provider id',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_ENV, {
        valueType: 'string',
        value: environment,
        description: 'VerifyMy environment (sandbox or production)',
      }),
      api.admin.putPlatformSetting(
        PLATFORM_SETTING_KEYS.AGE_VERIFICATION_VERIFYMY_DEFAULT_BUSINESS_SETTINGS_ID,
        {
          valueType: 'string',
          value: defaultBusinessSettingsId.trim(),
          description: 'Default VerifyMy business_settings_id when jurisdiction has none configured',
        },
      ),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.NCMEC_CYBERTIPLINE_ENV, {
        valueType: 'string',
        value: ncmecEnvironment,
        description: 'NCMEC CyberTipline environment (test or production)',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_MODE, {
        valueType: 'string',
        value: requiredMode,
        description: 'Enforcement mode: jurisdictions or all',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AGE_VERIFICATION_REQUIRED_JURISDICTIONS, {
        valueType: 'stringArray',
        value: toLines(requiredJurisdictions),
        description: 'Additional jurisdictions requiring age verification (additive)',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.GEOFENCE_BLOCKED_JURISDICTIONS, {
        valueType: 'stringArray',
        value: toLines(blockedJurisdictions),
        description: 'Jurisdictions where the service is entirely blocked',
      }),
      api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.GEOFENCE_LAW_LINKS, {
        valueType: 'stringArray',
        value: toLines(lawLinks),
        description: 'Jurisdiction-to-law-URL pairs (format: jurisdiction|url)',
      }),
    ];

    const results = await Promise.all(puts);

    if (results.every((r) => r.success)) {
      setSaveSuccess(t('compliance.admin.saveSuccess'));
      await load({ silent: true });
    } else {
      setSaveError(t('compliance.admin.saveError'));
    }
    setSaving(false);
  };

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('compliance.admin.title')}</h1>
        <p className="page-subtitle">{t('compliance.admin.subtitle')}</p>
      </div>

      {loadError && (
        <Card className="admin-card admin-card-error">
          <p>{loadError}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
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
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>{t('compliance.admin.enabledLabel')}</span>
            </label>
            <p className="admin-hint">{t('compliance.admin.enabledDescription')}</p>
          </Card>

          <Card className="admin-card">
            <label className="admin-toggle">
              <input
                type="checkbox"
                checked={autoEmailBackgroundCheck}
                onChange={(e) => setAutoEmailBackgroundCheck(e.target.checked)}
              />
              <span>{t('compliance.admin.autoEmailBgLabel')}</span>
            </label>
            <p className="admin-hint">{t('compliance.admin.autoEmailBgDescription')}</p>
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-provider">
              {t('compliance.admin.providerLabel')}
            </label>
            <input
              id="admin-av-provider"
              className="admin-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            />
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-env">
              {t('compliance.admin.environmentLabel')}
            </label>
            <select
              id="admin-av-env"
              className="admin-select"
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-default-business-id">
              {t('compliance.admin.defaultBusinessSettingsIdLabel')}
            </label>
            <input
              id="admin-av-default-business-id"
              className="admin-input"
              value={defaultBusinessSettingsId}
              onChange={(e) => setDefaultBusinessSettingsId(e.target.value)}
              spellCheck={false}
              placeholder={t('compliance.admin.defaultBusinessSettingsIdPlaceholder')}
            />
            <p className="admin-hint">{t('compliance.admin.defaultBusinessSettingsIdDescription')}</p>
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-ncmec-env">
              {t('compliance.admin.ncmecEnvironmentLabel')}
            </label>
            <select
              id="admin-ncmec-env"
              className="admin-select"
              value={ncmecEnvironment}
              onChange={(e) => setNcmecEnvironment(e.target.value)}
            >
              <option value="test">{t('compliance.admin.ncmecEnvironmentTest')}</option>
              <option value="production">{t('compliance.admin.ncmecEnvironmentProduction')}</option>
            </select>
            <p className="admin-hint">{t('compliance.admin.ncmecEnvironmentDescription')}</p>
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-mode">
              {t('compliance.admin.modeLabel')}
            </label>
            <select
              id="admin-av-mode"
              className="admin-select"
              value={requiredMode}
              onChange={(e) => setRequiredMode(e.target.value)}
            >
              <option value="jurisdictions">{t('compliance.admin.modeJurisdictions')}</option>
              <option value="all">{t('compliance.admin.modeAll')}</option>
            </select>
          </Card>

          <Card className="admin-card">
            <EffectiveAvJurisdictionsPanel
              requiredMode={requiredMode}
              adminOverrides={adminOverrideCodes}
              catalogRows={catalogRows}
              enrichedOverrideRows={enrichedOverrideRows}
              loading={catalogLoading}
              error={catalogError}
            />
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-jurisdictions">
              {t('compliance.admin.jurisdictionsLabel')}
            </label>
            <textarea
              id="admin-av-jurisdictions"
              className="admin-textarea"
              rows={4}
              value={requiredJurisdictions}
              onChange={(e) => setRequiredJurisdictions(e.target.value)}
              placeholder={t('compliance.admin.jurisdictionsPlaceholder')}
              spellCheck={false}
            />
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-blocked">
              {t('compliance.admin.blockedLabel')}
            </label>
            <textarea
              id="admin-av-blocked"
              className="admin-textarea"
              rows={4}
              value={blockedJurisdictions}
              onChange={(e) => setBlockedJurisdictions(e.target.value)}
              placeholder={t('compliance.admin.blockedPlaceholder')}
              spellCheck={false}
            />
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-av-lawlinks">
              {t('compliance.admin.lawLinksLabel')}
            </label>
            <textarea
              id="admin-av-lawlinks"
              className="admin-textarea"
              rows={4}
              value={lawLinks}
              onChange={(e) => setLawLinks(e.target.value)}
              placeholder={t('compliance.admin.lawLinksPlaceholder')}
              spellCheck={false}
            />
          </Card>

          <Card className="admin-card">
            <JurisdictionRequirementsPanel />
          </Card>

          <Card className="admin-card">
            <SanctionedCountriesPanel />
          </Card>

          {saveError && <p className="admin-inline-error">{saveError}</p>}
          {saveSuccess && <p className="admin-inline-success">{saveSuccess}</p>}

          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {t('compliance.admin.saveButton')}
          </Button>
        </>
      )}
    </div>
  );
}
