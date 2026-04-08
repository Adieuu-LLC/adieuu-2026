/**
 * Identity-level Notification settings page.
 *
 * All notification preferences (system notifications, sound, volume, etc.)
 * are client-side / localStorage and therefore device-scoped, but they live
 * under the Identity menu for organisational clarity.
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Alert';
import { NotificationSoundSelect } from '../../components/NotificationSoundSelect';
import { usePlatformCapabilities, usePlatformFeatures } from '../../config';
import { useToast } from '../../components/Toast';
import { useIdentity } from '../../hooks/useIdentity';
import {
  useNativeNotificationsPreference,
  setNativeNotificationsEnabled,
} from '../../hooks/useNativeNotificationsPreference';
import {
  BUILTIN_NOTIFICATION_SOUNDS,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
} from '../../constants/builtinNotificationSounds';
import {
  useNotificationSoundPreference,
  setNotificationSoundEnabled,
  setNotificationSoundId,
  setNotificationSoundCustomPath,
  setNotificationSoundSuppressWhenFocused,
  setNotificationSoundVolume,
  MAX_NOTIFICATION_GAIN,
  type NotificationSoundId,
} from '../../hooks/useNotificationSoundPreference';
import {
  previewNotificationSound,
  invalidateNotificationSoundCustomCache,
  ensureAudioContextRunning,
} from '../../utils/notificationSound';

function basenameFromPath(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] ?? p;
}

export function IdentityNotifications() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: identityStatus } = useIdentity();
  const { notifications, audio } = usePlatformCapabilities();
  const { hasCustomSoundPicker } = usePlatformFeatures();
  const nativeEnabled = useNativeNotificationsPreference();
  const soundPref = useNotificationSoundPreference();
  const [busy, setBusy] = useState(false);
  const [soundBrowseBusy, setSoundBrowseBusy] = useState(false);
  const [customSoundMissing, setCustomSoundMissing] = useState(false);

  const supportsNotifications = typeof window !== 'undefined' && 'Notification' in window;

  useEffect(() => {
    if (!hasCustomSoundPicker && soundPref.soundId === 'custom') {
      setNotificationSoundId(DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID);
    }
  }, [hasCustomSoundPicker, soundPref.soundId]);

  useEffect(() => {
    async function verifyCustom(): Promise<void> {
      if (soundPref.soundId !== 'custom' || !soundPref.customPath || !audio?.loadSoundFromPath) {
        setCustomSoundMissing(false);
        return;
      }
      const buf = await audio.loadSoundFromPath(soundPref.customPath);
      setCustomSoundMissing(!buf || buf.byteLength === 0);
    }
    void verifyCustom();
  }, [soundPref.soundId, soundPref.customPath, audio]);

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
        void ensureAudioContextRunning();
      } finally {
        setBusy(false);
      }
    },
    [notifications, supportsNotifications, t, toast]
  );

  const handleTestNotification = useCallback(async () => {
    if (!supportsNotifications || !nativeEnabled || !notifications.hasPermission()) {
      toast.error(t('account.settings.notifications.testNotificationNoPermission'));
      return;
    }
    notifications.show(
      t('account.settings.notifications.testNotificationTitle'),
      t('account.settings.notifications.testNotificationBody'),
      { tag: 'test-notification' }
    );
    if (soundPref.enabled && soundPref.soundId !== 'none') {
      await previewNotificationSound({
        soundId: soundPref.soundId,
        customPath: soundPref.customPath,
        loadCustomSound: audio?.loadSoundFromPath,
        volume: soundPref.volume,
      });
    }
    toast.success(t('account.settings.notifications.testNotificationSuccess'));
  }, [audio, nativeEnabled, notifications, soundPref, supportsNotifications, t, toast]);

  const handleSoundEnabledChange = useCallback((checked: boolean) => {
    setNotificationSoundEnabled(checked);
    if (checked) {
      void ensureAudioContextRunning();
    }
  }, []);

  const handleSoundIdChange = useCallback(
    (value: string) => {
      const id = value as NotificationSoundId;
      setNotificationSoundId(id);
      if (id !== 'custom') {
        invalidateNotificationSoundCustomCache();
      }
    },
    []
  );

  const handleSuppressFocusedChange = useCallback((checked: boolean) => {
    setNotificationSoundSuppressWhenFocused(checked);
  }, []);

  const handleBrowseCustomSound = useCallback(async () => {
    if (!audio?.pickSoundFile) return;
    setSoundBrowseBusy(true);
    try {
      const picked = await audio.pickSoundFile();
      if (!picked) return;
      setNotificationSoundCustomPath(picked.path);
      setNotificationSoundId('custom');
      invalidateNotificationSoundCustomCache();
      setCustomSoundMissing(false);
    } finally {
      setSoundBrowseBusy(false);
    }
  }, [audio]);

  const handlePreviewSound = useCallback(async () => {
    await previewNotificationSound({
      soundId: soundPref.soundId,
      customPath: soundPref.customPath,
      loadCustomSound: audio?.loadSoundFromPath,
      volume: soundPref.volume,
    });
  }, [audio, soundPref.customPath, soundPref.soundId, soundPref.volume]);

  const handleVolumeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNotificationSoundVolume(Number(e.target.value) / 100);
  }, []);

  const soundSelectLabels = useMemo(
    () => ({
      none: t('account.settings.notifications.soundNone'),
      custom: t('account.settings.notifications.soundCustom'),
    }),
    [t]
  );

  const builtinSoundSelectItems = useMemo(
    () =>
      BUILTIN_NOTIFICATION_SOUNDS.map((s) => ({
        value: s.id,
        label: s.displayName,
      })),
    []
  );

  if (identityStatus === 'locked') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('account.settings.title')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.sessionLocked')}</Alert>
        </div>
      </div>
    );
  }

  if (identityStatus !== 'logged_in') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('account.settings.title')}</h1>
          </div>
          <Alert variant="warning">{t('ciphers.notLoggedIn')}</Alert>
        </div>
      </div>
    );
  }

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

              <div className="app-settings-test-notification">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!nativeEnabled || !notifications.hasPermission()}
                  onClick={() => void handleTestNotification()}
                >
                  {t('account.settings.notifications.testNotification')}
                </button>
                <span className="app-settings-test-notification-hint">
                  {t('account.settings.notifications.testNotificationHint')}
                </span>
              </div>
            </>
          )}
        </Card>

        <Card variant="elevated" className="slide-up app-settings-card app-settings-card-sound">
          <h2 className="app-settings-section-title">{t('account.settings.notifications.soundSectionTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.settings.notifications.soundSectionDescription')}</p>

          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={soundPref.enabled}
              onChange={(e) => handleSoundEnabledChange(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">{t('account.settings.notifications.soundToggle')}</span>
              <span className="app-settings-toggle-hint">{t('account.settings.notifications.soundHint')}</span>
            </span>
          </label>

          <div className="app-settings-sound-row">
            <div id="notification-sound-preset-label" className="app-settings-sound-select-label">
              {t('account.settings.notifications.soundSelectLabel')}
            </div>
            <div className="app-settings-sound-row-controls">
              <NotificationSoundSelect
                value={soundPref.soundId}
                disabled={!soundPref.enabled}
                hasCustomSoundPicker={hasCustomSoundPicker}
                builtinItems={builtinSoundSelectItems}
                labels={soundSelectLabels}
                onValueChange={handleSoundIdChange}
                labelId="notification-sound-preset-label"
              />
              <button
                type="button"
                className="btn btn-secondary app-settings-sound-preview"
                disabled={
                  soundPref.soundId === 'none' ||
                  (soundPref.soundId === 'custom' &&
                    (!soundPref.customPath || !audio?.loadSoundFromPath))
                }
                onClick={() => void handlePreviewSound()}
              >
                {t('account.settings.notifications.soundPreview')}
              </button>
            </div>
          </div>

          <div className="app-settings-sound-volume">
            <label htmlFor="notification-sound-volume" className="app-settings-sound-volume-label">
              {t('account.settings.notifications.soundVolumeLabel')}
            </label>
            <div className="app-settings-sound-volume-row">
              <input
                id="notification-sound-volume"
                type="range"
                className="app-settings-sound-volume-slider"
                min={0}
                max={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                step={1}
                value={Math.round(soundPref.volume * 100)}
                disabled={soundPref.soundId === 'none'}
                onChange={handleVolumeChange}
                aria-valuemin={0}
                aria-valuemax={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                aria-valuenow={Math.round(soundPref.volume * 100)}
                aria-valuetext={`${Math.round(soundPref.volume * 100)}%`}
              />
              <span className="app-settings-sound-volume-value" aria-hidden>
                {Math.round(soundPref.volume * 100)}%
              </span>
            </div>
            <p className="app-settings-sound-volume-hint">{t('account.settings.notifications.soundVolumeHint')}</p>
          </div>

          {hasCustomSoundPicker && soundPref.soundId === 'custom' && (
            <div className="app-settings-custom-sound">
              <span className="app-settings-custom-sound-label">
                {t('account.settings.notifications.soundCustomFile')}
              </span>
              <div className="app-settings-custom-sound-row">
                <span className="app-settings-custom-sound-name" title={soundPref.customPath ?? ''}>
                  {soundPref.customPath ? basenameFromPath(soundPref.customPath) : '—'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!soundPref.enabled || soundBrowseBusy}
                  onClick={() => void handleBrowseCustomSound()}
                >
                  {t('account.settings.notifications.soundBrowse')}
                </button>
              </div>
              {customSoundMissing && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.soundFileMissing')}
                </Alert>
              )}
            </div>
          )}

          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={soundPref.suppressWhenFocused}
              disabled={!soundPref.enabled}
              onChange={(e) => handleSuppressFocusedChange(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('account.settings.notifications.soundSuppressFocused')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('account.settings.notifications.soundSuppressFocusedHint')}
              </span>
            </span>
          </label>
        </Card>
      </div>
    </div>
  );
}
