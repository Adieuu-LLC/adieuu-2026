import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { usePlatform } from '../hooks/usePlatform';
import { useUpdateContext } from '../hooks/useUpdateContext';

/**
 * Self-contained panel for desktop app update management.
 * Shows current version, update status/actions, and the auto-download toggle.
 * Returns null on non-desktop platforms.
 */
export function DesktopAppUpdatesPanel() {
  const { t } = useTranslation();
  const platform = usePlatform();
  const {
    status: updateStatus,
    newVersion,
    errorMessage: updateErrorMessage,
    checkForUpdates,
    applyUpdate,
    downloadUpdate,
  } = useUpdateContext();

  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;
    if (!electron) return;

    electron.invoke('get-update-preferences').then((prefs) => {
      const p = prefs as { autoDownloadEnabled?: boolean } | undefined;
      if (p && typeof p.autoDownloadEnabled === 'boolean') {
        setAutoDownloadEnabled(p.autoDownloadEnabled);
      }
      setPrefsLoaded(true);
    }).catch(() => {
      setPrefsLoaded(true);
    });
  }, [platform]);

  const handleAutoDownloadToggle = useCallback((checked: boolean) => {
    setAutoDownloadEnabled(checked);

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;
    if (!electron) return;

    electron.invoke('set-update-preferences', { autoDownloadEnabled: checked }).catch(() => {
      setAutoDownloadEnabled(!checked);
    });
  }, []);

  if (platform !== 'desktop') return null;

  return (
    <Card variant="elevated" className="slide-up">
      <div className="account-overview">
        <div className="account-details">
          <div className="account-detail-row">
            <span className="account-detail-label">{t('account.overview.updates')}</span>
            <div className="account-detail-content">
              <div className="account-update-section">
                <div className="account-update-version">
                  <span className="account-detail-label">{t('account.overview.currentVersion')}</span>
                  <span className="account-detail-value">
                    {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '—'}
                  </span>
                </div>

                {newVersion && (updateStatus === 'available' || updateStatus === 'downloading' || updateStatus === 'ready') && (
                  <div className="account-update-version">
                    <span className="account-detail-label">{t('account.overview.newVersionAvailable')}</span>
                    <span className="account-detail-value">{newVersion}</span>
                  </div>
                )}

                {updateStatus === 'up-to-date' && (
                  <p className="account-update-message account-status-good">{t('account.overview.upToDate')}</p>
                )}
                {updateStatus === 'available' && (
                  <p className="account-update-message">
                    {newVersion
                      ? t('account.overview.updateAvailableVersion', { version: newVersion })
                      : t('account.overview.updateAvailable')}
                  </p>
                )}
                {updateStatus === 'downloading' && (
                  <p className="account-update-message">{t('account.overview.downloading')}</p>
                )}
                {updateStatus === 'ready' && (
                  <p className="account-update-message">{t('account.overview.updateReady')}</p>
                )}
                {updateStatus === 'error' && (
                  <p className="account-update-message account-status-error">
                    {t('account.overview.updateError')}
                    {updateErrorMessage && (
                      <span className="account-update-error-detail"> ({updateErrorMessage})</span>
                    )}
                  </p>
                )}

                <div className="account-update-actions">
                  {updateStatus === 'available' && (
                    <Button onClick={downloadUpdate} className="btn btn-primary btn-sm">
                      {t('account.overview.downloadUpdate')}
                    </Button>
                  )}
                  {updateStatus === 'ready' && (
                    <Button onClick={applyUpdate} className="btn btn-primary btn-sm">
                      {t('account.overview.restartToUpdate')}
                    </Button>
                  )}
                  {updateStatus !== 'available' && updateStatus !== 'ready' && (
                    <Button
                      onClick={checkForUpdates}
                      className="btn btn-secondary btn-sm"
                      disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                    >
                      {updateStatus === 'checking' ? (
                        <><Spinner size="sm" /> {t('account.overview.checking')}</>
                      ) : updateStatus === 'downloading' ? (
                        <><Spinner size="sm" /> {t('account.overview.downloading')}</>
                      ) : (
                        t('account.overview.checkForUpdates')
                      )}
                    </Button>
                  )}
                </div>

                {prefsLoaded && (
                  <label className="app-settings-toggle" style={{ marginTop: 'var(--spacing-md)' }}>
                    <input
                      type="checkbox"
                      checked={autoDownloadEnabled}
                      onChange={(e) => handleAutoDownloadToggle(e.target.checked)}
                    />
                    <span className="app-settings-toggle-label">
                      <span className="app-settings-toggle-title">
                        {t('account.overview.autoDownload')}
                      </span>
                      <span className="app-settings-toggle-hint">
                        {t('account.overview.autoDownloadDescription')}
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
