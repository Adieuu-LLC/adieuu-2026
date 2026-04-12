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
  DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID,
  DEFAULT_BUILTIN_NOTIFICATION_SOUND_ID,
} from '../../constants/builtinNotificationSounds';
import {
  useNotificationSoundPreference,
  useTtlNotificationSoundPreference,
  useMentionNotificationSoundPreference,
  setNotificationSoundEnabled,
  setNotificationSoundId,
  setNotificationSoundCustomPath,
  setNotificationSoundSuppressWhenFocused,
  setNotificationSoundVolume,
  setTtlNotificationSoundId,
  setTtlNotificationSoundCustomPath,
  setTtlNotificationSoundVolume,
  setMentionNotificationSoundId,
  setMentionNotificationSoundCustomPath,
  setMentionNotificationSoundVolume,
  MAX_NOTIFICATION_GAIN,
  DEFAULT_TTL_NOTIFICATION_SOUND_ID,
  DEFAULT_MENTION_NOTIFICATION_SOUND_ID,
  type NotificationSoundId,
} from '../../hooks/useNotificationSoundPreference';
import {
  previewNotificationSound,
  invalidateNotificationSoundCustomCache,
  ensureAudioContextRunning,
} from '../../utils/notificationSound';
import {
  DEFAULT_ACHIEVEMENT_SOUND_VOLUME,
  loadAchievementPreferences,
  saveAchievementPopupEnabled,
  saveAchievementSoundCustomPath,
  saveAchievementSoundEnabled,
  saveAchievementSoundId,
  saveAchievementSoundVolume,
} from '../../hooks/useAchievementPreferences';
import { useClaimAchievement } from '../../hooks/useClaimAchievement';

function basenameFromPath(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts[parts.length - 1] ?? p;
}

export function IdentityNotifications() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status: identityStatus, identity: notifIdentity } = useIdentity();
  const { notifications, audio } = usePlatformCapabilities();
  const { hasCustomSoundPicker } = usePlatformFeatures();
  const nativeEnabled = useNativeNotificationsPreference();
  const soundPref = useNotificationSoundPreference();
  const ttlSoundPref = useTtlNotificationSoundPreference();
  const mentionSoundPref = useMentionNotificationSoundPreference();
  const claimAchievement = useClaimAchievement();
  const [busy, setBusy] = useState(false);
  const [soundBrowseBusy, setSoundBrowseBusy] = useState(false);
  const [customSoundMissing, setCustomSoundMissing] = useState(false);
  const [ttlSoundBrowseBusy, setTtlSoundBrowseBusy] = useState(false);
  const [ttlCustomSoundMissing, setTtlCustomSoundMissing] = useState(false);
  const [mentionSoundBrowseBusy, setMentionSoundBrowseBusy] = useState(false);
  const [mentionCustomSoundMissing, setMentionCustomSoundMissing] = useState(false);
  const [achSoundBrowseBusy, setAchSoundBrowseBusy] = useState(false);
  const [achCustomSoundMissing, setAchCustomSoundMissing] = useState(false);

  const defaultAchievementPrefs = useMemo(
    () => ({
      popupEnabled: true,
      soundEnabled: true,
      achievementSoundId: DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID as NotificationSoundId,
      achievementSoundCustomPath: null as string | null,
      achievementSoundVolume: DEFAULT_ACHIEVEMENT_SOUND_VOLUME,
    }),
    []
  );

  const achPrefs = notifIdentity?.id
    ? loadAchievementPreferences(notifIdentity.id)
    : defaultAchievementPrefs;
  const [achPopup, setAchPopup] = useState(achPrefs.popupEnabled);
  const [achSound, setAchSound] = useState(achPrefs.soundEnabled);
  const [achSoundId, setAchSoundId] = useState<NotificationSoundId>(achPrefs.achievementSoundId);
  const [achCustomPath, setAchCustomPath] = useState<string | null>(
    achPrefs.achievementSoundCustomPath
  );
  const [achSoundVolume, setAchSoundVolume] = useState(achPrefs.achievementSoundVolume);

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

  useEffect(() => {
    if (!hasCustomSoundPicker && ttlSoundPref.soundId === 'custom') {
      setTtlNotificationSoundId(DEFAULT_TTL_NOTIFICATION_SOUND_ID);
    }
  }, [hasCustomSoundPicker, ttlSoundPref.soundId]);

  useEffect(() => {
    async function verifyTtlCustom(): Promise<void> {
      if (ttlSoundPref.soundId !== 'custom' || !ttlSoundPref.customPath || !audio?.loadSoundFromPath) {
        setTtlCustomSoundMissing(false);
        return;
      }
      const buf = await audio.loadSoundFromPath(ttlSoundPref.customPath);
      setTtlCustomSoundMissing(!buf || buf.byteLength === 0);
    }
    void verifyTtlCustom();
  }, [ttlSoundPref.soundId, ttlSoundPref.customPath, audio]);

  useEffect(() => {
    if (!hasCustomSoundPicker && mentionSoundPref.soundId === 'custom') {
      setMentionNotificationSoundId(DEFAULT_MENTION_NOTIFICATION_SOUND_ID);
    }
  }, [hasCustomSoundPicker, mentionSoundPref.soundId]);

  useEffect(() => {
    async function verifyMentionCustom(): Promise<void> {
      if (mentionSoundPref.soundId !== 'custom' || !mentionSoundPref.customPath || !audio?.loadSoundFromPath) {
        setMentionCustomSoundMissing(false);
        return;
      }
      const buf = await audio.loadSoundFromPath(mentionSoundPref.customPath);
      setMentionCustomSoundMissing(!buf || buf.byteLength === 0);
    }
    void verifyMentionCustom();
  }, [mentionSoundPref.soundId, mentionSoundPref.customPath, audio]);

  useEffect(() => {
    if (!notifIdentity?.id) return;
    const p = loadAchievementPreferences(notifIdentity.id);
    setAchPopup(p.popupEnabled);
    setAchSound(p.soundEnabled);
    setAchSoundId(p.achievementSoundId);
    setAchCustomPath(p.achievementSoundCustomPath);
    setAchSoundVolume(p.achievementSoundVolume);
  }, [notifIdentity?.id]);

  useEffect(() => {
    if (!hasCustomSoundPicker && achSoundId === 'custom') {
      setAchSoundId(DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID);
      if (notifIdentity?.id) {
        saveAchievementSoundId(notifIdentity.id, DEFAULT_ACHIEVEMENT_NOTIFICATION_SOUND_ID);
      }
    }
  }, [hasCustomSoundPicker, achSoundId, notifIdentity?.id]);

  useEffect(() => {
    async function verifyAchCustom(): Promise<void> {
      if (achSoundId !== 'custom' || !achCustomPath || !audio?.loadSoundFromPath) {
        setAchCustomSoundMissing(false);
        return;
      }
      const buf = await audio.loadSoundFromPath(achCustomPath);
      setAchCustomSoundMissing(!buf || buf.byteLength === 0);
    }
    void verifyAchCustom();
  }, [achSoundId, achCustomPath, audio]);

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
    } else {
      claimAchievement('notifications_disabled');
    }
  }, [claimAchievement]);

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
    const pct = Number(e.target.value);
    setNotificationSoundVolume(pct / 100);
    if (pct >= 200) claimAchievement('notification_volume_maxed');
  }, [claimAchievement]);

  const handleTtlSoundIdChange = useCallback(
    (value: string) => {
      const id = value as NotificationSoundId;
      setTtlNotificationSoundId(id);
      if (id !== 'custom') {
        invalidateNotificationSoundCustomCache();
      }
    },
    []
  );

  const handleBrowseTtlCustomSound = useCallback(async () => {
    if (!audio?.pickSoundFile) return;
    setTtlSoundBrowseBusy(true);
    try {
      const picked = await audio.pickSoundFile();
      if (!picked) return;
      setTtlNotificationSoundCustomPath(picked.path);
      setTtlNotificationSoundId('custom');
      invalidateNotificationSoundCustomCache();
      setTtlCustomSoundMissing(false);
    } finally {
      setTtlSoundBrowseBusy(false);
    }
  }, [audio]);

  const handlePreviewTtlSound = useCallback(async () => {
    await previewNotificationSound({
      soundId: ttlSoundPref.soundId,
      customPath: ttlSoundPref.customPath,
      loadCustomSound: audio?.loadSoundFromPath,
      volume: ttlSoundPref.volume,
    });
  }, [audio, ttlSoundPref.customPath, ttlSoundPref.soundId, ttlSoundPref.volume]);

  const handleTtlVolumeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setTtlNotificationSoundVolume(pct / 100);
    if (pct >= 200) claimAchievement('notification_volume_maxed');
  }, [claimAchievement]);

  const handleMentionSoundIdChange = useCallback(
    (value: string) => {
      const id = value as NotificationSoundId;
      setMentionNotificationSoundId(id);
      if (id !== 'custom') {
        invalidateNotificationSoundCustomCache();
      }
    },
    []
  );

  const handleBrowseMentionCustomSound = useCallback(async () => {
    if (!audio?.pickSoundFile) return;
    setMentionSoundBrowseBusy(true);
    try {
      const picked = await audio.pickSoundFile();
      if (!picked) return;
      setMentionNotificationSoundCustomPath(picked.path);
      setMentionNotificationSoundId('custom');
      invalidateNotificationSoundCustomCache();
      setMentionCustomSoundMissing(false);
    } finally {
      setMentionSoundBrowseBusy(false);
    }
  }, [audio]);

  const handlePreviewMentionSound = useCallback(async () => {
    await previewNotificationSound({
      soundId: mentionSoundPref.soundId,
      customPath: mentionSoundPref.customPath,
      loadCustomSound: audio?.loadSoundFromPath,
      volume: mentionSoundPref.volume,
    });
  }, [audio, mentionSoundPref.customPath, mentionSoundPref.soundId, mentionSoundPref.volume]);

  const handleMentionVolumeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setMentionNotificationSoundVolume(pct / 100);
    if (pct >= 200) claimAchievement('notification_volume_maxed');
  }, [claimAchievement]);

  const handleAchSoundIdChange = useCallback(
    (value: string) => {
      const id = value as NotificationSoundId;
      setAchSoundId(id);
      if (notifIdentity?.id) saveAchievementSoundId(notifIdentity.id, id);
      if (id !== 'custom') {
        invalidateNotificationSoundCustomCache();
      }
    },
    [notifIdentity?.id]
  );

  const handleBrowseAchCustomSound = useCallback(async () => {
    if (!audio?.pickSoundFile) return;
    setAchSoundBrowseBusy(true);
    try {
      const picked = await audio.pickSoundFile();
      if (!picked || !notifIdentity?.id) return;
      setAchCustomPath(picked.path);
      setAchSoundId('custom');
      saveAchievementSoundCustomPath(notifIdentity.id, picked.path);
      saveAchievementSoundId(notifIdentity.id, 'custom');
      invalidateNotificationSoundCustomCache();
      setAchCustomSoundMissing(false);
    } finally {
      setAchSoundBrowseBusy(false);
    }
  }, [audio, notifIdentity?.id]);

  const handlePreviewAchSound = useCallback(async () => {
    await previewNotificationSound({
      soundId: achSoundId,
      customPath: achCustomPath,
      loadCustomSound: audio?.loadSoundFromPath,
      volume: achSoundVolume,
    });
  }, [achCustomPath, achSoundId, achSoundVolume, audio]);

  const handleAchVolumeChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    const gain = pct / 100;
    setAchSoundVolume(gain);
    if (notifIdentity?.id) saveAchievementSoundVolume(notifIdentity.id, gain);
    if (pct >= 200) claimAchievement('notification_volume_maxed');
  }, [claimAchievement, notifIdentity?.id]);

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

        <Card variant="elevated" className="slide-up app-settings-card app-settings-card-sound">
          <h2 className="app-settings-section-title">{t('account.settings.notifications.ttlSoundSectionTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.settings.notifications.ttlSoundSectionDescription')}</p>

          <div className="app-settings-sound-row">
            <div id="ttl-notification-sound-preset-label" className="app-settings-sound-select-label">
              {t('account.settings.notifications.ttlSoundSelectLabel')}
            </div>
            <div className="app-settings-sound-row-controls">
              <NotificationSoundSelect
                value={ttlSoundPref.soundId}
                disabled={!soundPref.enabled}
                hasCustomSoundPicker={hasCustomSoundPicker}
                builtinItems={builtinSoundSelectItems}
                labels={soundSelectLabels}
                onValueChange={handleTtlSoundIdChange}
                labelId="ttl-notification-sound-preset-label"
              />
              <button
                type="button"
                className="btn btn-secondary app-settings-sound-preview"
                disabled={
                  ttlSoundPref.soundId === 'none' ||
                  (ttlSoundPref.soundId === 'custom' &&
                    (!ttlSoundPref.customPath || !audio?.loadSoundFromPath))
                }
                onClick={() => void handlePreviewTtlSound()}
              >
                {t('account.settings.notifications.ttlSoundPreview')}
              </button>
            </div>
          </div>

          <div className="app-settings-sound-volume">
            <label htmlFor="ttl-notification-sound-volume" className="app-settings-sound-volume-label">
              {t('account.settings.notifications.ttlSoundVolumeLabel')}
            </label>
            <div className="app-settings-sound-volume-row">
              <input
                id="ttl-notification-sound-volume"
                type="range"
                className="app-settings-sound-volume-slider"
                min={0}
                max={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                step={1}
                value={Math.round(ttlSoundPref.volume * 100)}
                disabled={ttlSoundPref.soundId === 'none'}
                onChange={handleTtlVolumeChange}
                aria-valuemin={0}
                aria-valuemax={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                aria-valuenow={Math.round(ttlSoundPref.volume * 100)}
                aria-valuetext={`${Math.round(ttlSoundPref.volume * 100)}%`}
              />
              <span className="app-settings-sound-volume-value" aria-hidden>
                {Math.round(ttlSoundPref.volume * 100)}%
              </span>
            </div>
            <p className="app-settings-sound-volume-hint">{t('account.settings.notifications.ttlSoundVolumeHint')}</p>
          </div>

          {hasCustomSoundPicker && ttlSoundPref.soundId === 'custom' && (
            <div className="app-settings-custom-sound">
              <span className="app-settings-custom-sound-label">
                {t('account.settings.notifications.ttlSoundCustomFile')}
              </span>
              <div className="app-settings-custom-sound-row">
                <span className="app-settings-custom-sound-name" title={ttlSoundPref.customPath ?? ''}>
                  {ttlSoundPref.customPath ? basenameFromPath(ttlSoundPref.customPath) : '—'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!soundPref.enabled || ttlSoundBrowseBusy}
                  onClick={() => void handleBrowseTtlCustomSound()}
                >
                  {t('account.settings.notifications.ttlSoundBrowse')}
                </button>
              </div>
              {ttlCustomSoundMissing && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.ttlSoundFileMissing')}
                </Alert>
              )}
            </div>
          )}
        </Card>

        <Card variant="elevated" className="slide-up app-settings-card app-settings-card-sound">
          <h2 className="app-settings-section-title">{t('account.settings.notifications.mentionSoundSectionTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.settings.notifications.mentionSoundSectionDescription')}</p>

          <div className="app-settings-sound-row">
            <div id="mention-notification-sound-preset-label" className="app-settings-sound-select-label">
              {t('account.settings.notifications.mentionSoundSelectLabel')}
            </div>
            <div className="app-settings-sound-row-controls">
              <NotificationSoundSelect
                value={mentionSoundPref.soundId}
                disabled={!soundPref.enabled}
                hasCustomSoundPicker={hasCustomSoundPicker}
                builtinItems={builtinSoundSelectItems}
                labels={soundSelectLabels}
                onValueChange={handleMentionSoundIdChange}
                labelId="mention-notification-sound-preset-label"
              />
              <button
                type="button"
                className="btn btn-secondary app-settings-sound-preview"
                disabled={
                  mentionSoundPref.soundId === 'none' ||
                  (mentionSoundPref.soundId === 'custom' &&
                    (!mentionSoundPref.customPath || !audio?.loadSoundFromPath))
                }
                onClick={() => void handlePreviewMentionSound()}
              >
                {t('account.settings.notifications.mentionSoundPreview')}
              </button>
            </div>
          </div>

          <div className="app-settings-sound-volume">
            <label htmlFor="mention-notification-sound-volume" className="app-settings-sound-volume-label">
              {t('account.settings.notifications.mentionSoundVolumeLabel')}
            </label>
            <div className="app-settings-sound-volume-row">
              <input
                id="mention-notification-sound-volume"
                type="range"
                className="app-settings-sound-volume-slider"
                min={0}
                max={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                step={1}
                value={Math.round(mentionSoundPref.volume * 100)}
                disabled={mentionSoundPref.soundId === 'none'}
                onChange={handleMentionVolumeChange}
                aria-valuemin={0}
                aria-valuemax={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                aria-valuenow={Math.round(mentionSoundPref.volume * 100)}
                aria-valuetext={`${Math.round(mentionSoundPref.volume * 100)}%`}
              />
              <span className="app-settings-sound-volume-value" aria-hidden>
                {Math.round(mentionSoundPref.volume * 100)}%
              </span>
            </div>
            <p className="app-settings-sound-volume-hint">{t('account.settings.notifications.mentionSoundVolumeHint')}</p>
          </div>

          {hasCustomSoundPicker && mentionSoundPref.soundId === 'custom' && (
            <div className="app-settings-custom-sound">
              <span className="app-settings-custom-sound-label">
                {t('account.settings.notifications.mentionSoundCustomFile')}
              </span>
              <div className="app-settings-custom-sound-row">
                <span className="app-settings-custom-sound-name" title={mentionSoundPref.customPath ?? ''}>
                  {mentionSoundPref.customPath ? basenameFromPath(mentionSoundPref.customPath) : '—'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!soundPref.enabled || mentionSoundBrowseBusy}
                  onClick={() => void handleBrowseMentionCustomSound()}
                >
                  {t('account.settings.notifications.mentionSoundBrowse')}
                </button>
              </div>
              {mentionCustomSoundMissing && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.mentionSoundFileMissing')}
                </Alert>
              )}
            </div>
          )}
        </Card>

        <Card variant="elevated" className="slide-up app-settings-card app-settings-card-sound">
          <h2 className="app-settings-section-title">{t('account.settings.notifications.achievementSectionTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.settings.notifications.achievementSectionDescription')}</p>

          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={achPopup}
              onChange={(e) => {
                const val = e.target.checked;
                setAchPopup(val);
                if (notifIdentity?.id) saveAchievementPopupEnabled(notifIdentity.id, val);
              }}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('account.settings.notifications.achievementPopupToggle')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('account.settings.notifications.achievementPopupHint')}
              </span>
            </span>
          </label>

          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={achSound}
              onChange={(e) => {
                const val = e.target.checked;
                setAchSound(val);
                if (notifIdentity?.id) saveAchievementSoundEnabled(notifIdentity.id, val);
              }}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('account.settings.notifications.achievementSoundToggle')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('account.settings.notifications.achievementSoundHint')}
              </span>
            </span>
          </label>

          <div className="app-settings-sound-row">
            <div id="achievement-sound-preset-label" className="app-settings-sound-select-label">
              {t('account.settings.notifications.achievementSoundSelectLabel')}
            </div>
            <div className="app-settings-sound-row-controls">
              <NotificationSoundSelect
                value={achSoundId}
                disabled={!achSound}
                hasCustomSoundPicker={hasCustomSoundPicker}
                builtinItems={builtinSoundSelectItems}
                labels={soundSelectLabels}
                onValueChange={handleAchSoundIdChange}
                labelId="achievement-sound-preset-label"
              />
              <button
                type="button"
                className="btn btn-secondary app-settings-sound-preview"
                disabled={
                  !achSound ||
                  achSoundId === 'none' ||
                  (achSoundId === 'custom' && (!achCustomPath || !audio?.loadSoundFromPath))
                }
                onClick={() => void handlePreviewAchSound()}
              >
                {t('account.settings.notifications.achievementSoundPreview')}
              </button>
            </div>
          </div>

          <div className="app-settings-sound-volume">
            <label htmlFor="achievement-sound-volume" className="app-settings-sound-volume-label">
              {t('account.settings.notifications.achievementSoundVolumeLabel')}
            </label>
            <div className="app-settings-sound-volume-row">
              <input
                id="achievement-sound-volume"
                type="range"
                className="app-settings-sound-volume-slider"
                min={0}
                max={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                step={1}
                value={Math.round(achSoundVolume * 100)}
                disabled={!achSound || achSoundId === 'none'}
                onChange={handleAchVolumeChange}
                aria-valuemin={0}
                aria-valuemax={Math.round(MAX_NOTIFICATION_GAIN * 100)}
                aria-valuenow={Math.round(achSoundVolume * 100)}
                aria-valuetext={`${Math.round(achSoundVolume * 100)}%`}
              />
              <span className="app-settings-sound-volume-value" aria-hidden>
                {Math.round(achSoundVolume * 100)}%
              </span>
            </div>
            <p className="app-settings-sound-volume-hint">{t('account.settings.notifications.achievementSoundVolumeHint')}</p>
          </div>

          {hasCustomSoundPicker && achSoundId === 'custom' && (
            <div className="app-settings-custom-sound">
              <span className="app-settings-custom-sound-label">
                {t('account.settings.notifications.achievementSoundCustomFile')}
              </span>
              <div className="app-settings-custom-sound-row">
                <span className="app-settings-custom-sound-name" title={achCustomPath ?? ''}>
                  {achCustomPath ? basenameFromPath(achCustomPath) : '—'}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!achSound || achSoundBrowseBusy}
                  onClick={() => void handleBrowseAchCustomSound()}
                >
                  {t('account.settings.notifications.achievementSoundBrowse')}
                </button>
              </div>
              {achCustomSoundMissing && (
                <Alert variant="warning" className="app-settings-alert">
                  {t('account.settings.notifications.achievementSoundFileMissing')}
                </Alert>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
