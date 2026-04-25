import { useState, useEffect, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Card } from './Card';
import { Button } from './Button';
import { Spinner } from './Spinner';
import { useToast } from './Toast';
import { usePlatform } from '../hooks/usePlatform';
import { useUpdateContext } from '../hooks/useUpdateContext';

/** openPath-style errors vs our { ok, error? }; avoid false toasts when `ok` is missing or payload is a string. */
function isOpenFileFromDiskFailure(result: unknown): boolean {
  if (result == null) {
    return false;
  }
  if (typeof result === 'string') {
    return result.length > 0;
  }
  if (typeof result === 'object' && result !== null && 'ok' in result) {
    return (result as { ok: boolean }).ok === false;
  }
  return false;
}

function openFileFromDiskErrorMessage(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result && typeof result === 'object' && 'error' in result) {
    const e = (result as { error?: string }).error;
    return typeof e === 'string' ? e : '';
  }
  return '';
}

/**
 * Self-contained panel for desktop app update management.
 * Shows current version, update status/actions, and the auto-download toggle.
 * Returns null on non-desktop platforms.
 */
export function DesktopAppUpdatesPanel() {
  const { t } = useTranslation();
  const toast = useToast();
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
  const [clearingCache, setClearingCache] = useState(false);
  const [showRestartAfterCacheClear, setShowRestartAfterCacheClear] = useState(false);
  const [inAppUpdateLogPath, setInAppUpdateLogPath] = useState<string | null>(null);

  useEffect(() => {
    if (platform !== 'desktop') return;

    const electron = (window as Window & { electron?: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    } }).electron;
    if (!electron) return;

    void electron.invoke('get-in-app-update-log-path').then((res) => {
      const p = (res as { path?: string } | null)?.path;
      if (typeof p === 'string' && p.length > 0) {
        setInAppUpdateLogPath(p);
      }
    }).catch(() => {
      // Path is optional for display; opening the log still works via main process.
    });

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

  const getElectron = useCallback(() => (window as Window & { electron?: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  } }).electron, []);

  const handleRestartApp = useCallback(() => {
    const electron = getElectron();
    if (!electron) return;
    void electron.invoke('restart-app');
  }, [getElectron]);

  const handleOpenInstallerLog = useCallback(async () => {
    const electron = getElectron();
    if (!electron) return;
    try {
      const result = await electron.invoke('open-windows-installer-log');
      if (isOpenFileFromDiskFailure(result)) {
        const err = openFileFromDiskErrorMessage(result);
        toast.error(
          `${t('account.overview.openInstallerLogError')}${err ? `: ${err}` : ''}`,
        );
      }
    } catch {
      toast.error(t('account.overview.openInstallerLogError'));
    }
  }, [getElectron, t, toast]);

  const handleOpenInAppUpdateLog = useCallback(async () => {
    const electron = getElectron();
    if (!electron) return;
    try {
      const result = await electron.invoke('open-in-app-update-log');
      if (isOpenFileFromDiskFailure(result)) {
        const err = openFileFromDiskErrorMessage(result);
        toast.error(
          `${t('account.overview.openInAppUpdateLogError')}${err ? `: ${err}` : ''}`,
        );
      }
    } catch {
      toast.error(t('account.overview.openInAppUpdateLogError'));
    }
  }, [getElectron, t, toast]);

  const handleClearInstallerCache = useCallback(async () => {
    const electron = getElectron();
    if (!electron) return;

    setClearingCache(true);
    try {
      const result = await electron.invoke('clear-installer-cache') as { ok?: boolean; error?: string };
      if (result?.ok) {
        setShowRestartAfterCacheClear(true);
        toast.toast({
          title: t('account.overview.clearInstallerCacheSuccess'),
          description: t('account.overview.clearInstallerCacheRestartHint'),
          variant: 'success',
          duration: 20_000,
          action: {
            label: t('account.overview.restartAppNow'),
            onClick: () => {
              void electron.invoke('restart-app');
            },
          },
        });
      } else {
        toast.error(
          `${t('account.overview.clearInstallerCacheError')}${result?.error ? ` ${result.error}` : ''}`,
        );
      }
    } catch {
      toast.error(t('account.overview.clearInstallerCacheError'));
    } finally {
      setClearingCache(false);
    }
  }, [t, toast, getElectron]);

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

  const isWindows = typeof window !== 'undefined' &&
    (window as Window & { electron?: { platform?: string } }).electron?.platform === 'win32';

  return (
    <Card variant="elevated" className="slide-up desktop-updates-panel">
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

                <div className="desktop-updates-cache-tools">
                  <p className="desktop-updates-cache-tools__title">
                    {t('account.overview.clearInstallerCache')}
                  </p>
                  <p className="desktop-updates-cache-tools__hint">
                    {t('account.overview.clearInstallerCacheDescription')}
                  </p>
                  <div className="account-update-actions">
                    <Button
                      type="button"
                      onClick={handleClearInstallerCache}
                      className="btn btn-secondary btn-sm"
                      disabled={clearingCache}
                    >
                      {clearingCache ? (
                        <><Spinner size="sm" /> {t('account.overview.clearingInstallerCache')}</>
                      ) : (
                        t('account.overview.clearInstallerCacheButton')
                      )}
                    </Button>
                  </div>
                  {showRestartAfterCacheClear && (
                    <div className="desktop-updates-cache-tools__post-clear">
                      <p className="account-update-message">
                        {t('account.overview.clearInstallerCacheRestartHint')}
                      </p>
                      <div className="account-update-actions" style={{ flexWrap: 'wrap' }}>
                        <Button type="button" onClick={handleRestartApp} className="btn btn-primary btn-sm">
                          {t('account.overview.restartAppNow')}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setShowRestartAfterCacheClear(false);
                          }}
                        >
                          {t('account.overview.restartHintDismiss')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="desktop-updates-logs-diagnostics">
                  {isWindows && (
                    <p className="account-update-message desktop-updates-win-log-hint">
                      <Trans
                        i18nKey="account.overview.windowsInstallLogSupport"
                        components={{
                          openLogLink: (
                            <button
                              type="button"
                              className="desktop-updates-installer-log-link"
                              onClick={handleOpenInstallerLog}
                            />
                          ),
                        }}
                      />
                    </p>
                  )}
                  <div className="account-update-message desktop-updates-in-app-log-hint">
                    <p>
                      {isWindows ? (
                        <Trans
                          i18nKey="account.overview.inAppUpdateLogSupportWindows"
                          components={{
                            openLogLink: (
                              <button
                                type="button"
                                className="desktop-updates-installer-log-link"
                                onClick={handleOpenInAppUpdateLog}
                              />
                            ),
                          }}
                        />
                      ) : (
                        <Trans
                          i18nKey="account.overview.inAppUpdateLogSupport"
                          components={{
                            openLogLink: (
                              <button
                                type="button"
                                className="desktop-updates-installer-log-link"
                                onClick={handleOpenInAppUpdateLog}
                              />
                            ),
                          }}
                        />
                      )}
                    </p>
                    {inAppUpdateLogPath && (
                      <code className="desktop-updates-log-path" title={inAppUpdateLogPath}>
                        {inAppUpdateLogPath}
                      </code>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
