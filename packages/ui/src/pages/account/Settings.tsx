import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { usePlatformCapabilities } from '../../config';
import { useToast } from '../../components/Toast';
import {
  useNativeNotificationsPreference,
  setNativeNotificationsEnabled,
} from '../../hooks/useNativeNotificationsPreference';

export function AccountSettings() {
  const { t } = useTranslation();
  const toast = useToast();
  const { notifications } = usePlatformCapabilities();
  const nativeEnabled = useNativeNotificationsPreference();
  const [busy, setBusy] = useState(false);

  const supportsNotifications = typeof window !== 'undefined' && 'Notification' in window;

  const handleNativeChange = useCallback(
    async (checked: boolean) => {
      if (!supportsNotifications) return;

      if (!checked) {
        setNativeNotificationsEnabled(false);
        return;
      }

      const permission = notifications.getPermissionState();
      if (permission === 'denied') {
        toast.error(t('account.settings.notifications.deniedBody'));
        return;
      }

      setBusy(true);
      try {
        if (permission === 'default') {
          const granted = await notifications.requestPermission();
          if (!granted) {
            toast.error(t('account.settings.notifications.permissionDeniedToast'));
            return;
          }
        }
        setNativeNotificationsEnabled(true);
        toast.success(t('account.settings.notifications.enabledToast'));
      } finally {
        setBusy(false);
      }
    },
    [notifications, supportsNotifications, t, toast]
  );

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('account.settings.title')}</h1>
          <p className="page-subtitle">{t('account.settings.subtitle')}</p>
        </div>

        <Card variant="elevated" className="slide-up app-settings-card">
          <h2 className="app-settings-section-title">{t('account.settings.notifications.sectionTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.settings.notifications.sectionDescription')}</p>

          {!supportsNotifications ? (
            <Alert variant="warning">{t('account.settings.notifications.unsupported')}</Alert>
          ) : (
            <>
              {notifications.getPermissionState() === 'denied' && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.deniedBody')}
                </Alert>
              )}

              {nativeEnabled && !notifications.hasPermission() && notifications.getPermissionState() !== 'denied' && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.permissionResetBody')}
                </Alert>
              )}

              <label className="app-settings-toggle">
                <input
                  type="checkbox"
                  checked={nativeEnabled}
                  disabled={busy}
                  onChange={(e) => void handleNativeChange(e.target.checked)}
                />
                <span className="app-settings-toggle-label">
                  <span className="app-settings-toggle-title">
                    {t('account.settings.notifications.systemToggle')}
                  </span>
                  <span className="app-settings-toggle-hint">
                    {t('account.settings.notifications.systemHint')}
                  </span>
                </span>
              </label>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
