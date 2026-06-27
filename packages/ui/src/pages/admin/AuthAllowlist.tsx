import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createApiClient, PLATFORM_SETTING_KEYS, type PublicPlatformSetting } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';

function settingMap(settings: PublicPlatformSetting[]): Map<string, PublicPlatformSetting> {
  return new Map(settings.map((s) => [s.key, s]));
}

export function AdminAuthAllowlist() {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [enforced, setEnforced] = useState(false);
  const [emailText, setEmailText] = useState('');
  const [phoneText, setPhoneText] = useState('');
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
      setLoadError(t('admin.authAllowlist.loadError'));
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    const map = settingMap(res.data);
    const enforcedDoc = map.get(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED);
    const emailDoc = map.get(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL);
    const phoneDoc = map.get(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE);

    setEnforced(enforcedDoc?.valueType === 'boolean' ? Boolean(enforcedDoc.value) : false);

    const emails =
      emailDoc?.valueType === 'stringArray' && Array.isArray(emailDoc.value)
        ? (emailDoc.value as string[]).filter((x) => typeof x === 'string')
        : [];
    const phones =
      phoneDoc?.valueType === 'stringArray' && Array.isArray(phoneDoc.value)
        ? (phoneDoc.value as string[]).filter((x) => typeof x === 'string')
        : [];

    setEmailText(emails.join('\n'));
    setPhoneText(phones.join('\n'));
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

    const emailLines = emailText
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);
    const phoneLines = phoneText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const r1 = await api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_ENFORCED, {
      valueType: 'boolean',
      value: enforced,
      description: 'Whether sign-in OTP is restricted to the email/phone allowlists',
    });
    const r2 = await api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_EMAIL, {
      valueType: 'stringArray',
      value: emailLines,
      description: 'Email addresses allowed to sign in when allowlist is enforced',
    });
    const r3 = await api.admin.putPlatformSetting(PLATFORM_SETTING_KEYS.AUTH_ALLOWLIST_PHONE, {
      valueType: 'stringArray',
      value: phoneLines,
      description: 'E.164 phone numbers allowed to sign in when allowlist is enforced',
    });

    if (r1.success && r2.success && r3.success) {
      await load({ silent: true });
    } else {
      setSaveError(t('admin.authAllowlist.saveError'));
    }
    setSaving(false);
  };

  return (
    <div className="page-content admin-page">
      <div className="page-header">
        <h1 className="page-title">{t('admin.authAllowlist.title')}</h1>
        <p className="page-subtitle">{t('admin.authAllowlist.subtitle')}</p>
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
                checked={enforced}
                onChange={(e) => setEnforced(e.target.checked)}
              />
              <span>{t('admin.authAllowlist.enforced')}</span>
            </label>
            <p className="admin-hint">{t('admin.authAllowlist.enforcedHint')}</p>
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-allowlist-email">
              {t('admin.authAllowlist.emailList')}
            </label>
            <p className="admin-hint">{t('admin.authAllowlist.emailHint')}</p>
            <textarea
              id="admin-allowlist-email"
              className="admin-textarea"
              rows={8}
              value={emailText}
              onChange={(e) => setEmailText(e.target.value)}
              spellCheck={false}
            />
          </Card>

          <Card className="admin-card">
            <label className="admin-field-label" htmlFor="admin-allowlist-phone">
              {t('admin.authAllowlist.phoneList')}
            </label>
            <p className="admin-hint">{t('admin.authAllowlist.phoneHint')}</p>
            <textarea
              id="admin-allowlist-phone"
              className="admin-textarea"
              rows={8}
              value={phoneText}
              onChange={(e) => setPhoneText(e.target.value)}
              spellCheck={false}
            />
          </Card>

          {saveError && <p className="admin-inline-error">{saveError}</p>}

          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {t('admin.authAllowlist.save')}
          </Button>
        </>
      )}
    </div>
  );
}
