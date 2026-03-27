/**
 * Identity Profile page.
 *
 * Allows the logged-in identity to view and edit their profile:
 * - Banner and avatar with upload
 * - Display name and bio
 * - Profile accent colours
 * - Per-field privacy settings
 * - Live preview showing how the profile appears to others
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type ProfileVisibility,
  type ProfilePrivacySettings,
  type ProfileColors,
  type UpdateProfileParams,
} from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { AvatarUpload } from '../../components/AvatarUpload';
import { BannerUpload } from '../../components/BannerUpload';
import { ProfileColorPicker } from '../../components/ProfileColorPicker';
import { PrivacySelect } from '../../components/PrivacySelect';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';

const BIO_MAX_LENGTH = 160;

const DEFAULT_PRIVACY: ProfilePrivacySettings = {
  avatar: 'public',
  banner: 'public',
  bio: 'public',
  lastActiveAt: 'public',
  profileColors: 'public',
};

type PreviewMode = 'self' | 'friend' | 'stranger';

export function IdentityProfile() {
  const { t } = useTranslation();
  const { identity, refreshIdentitySession } = useIdentity();
  const { apiBaseUrl } = useAppConfig();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarMediaId, setAvatarMediaId] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [bannerMediaId, setBannerMediaId] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [colors, setColors] = useState<ProfileColors>({});
  const [privacy, setPrivacy] = useState<ProfilePrivacySettings>({ ...DEFAULT_PRIVACY });

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('self');

  // Initialise form from identity
  useEffect(() => {
    if (identity) {
      setDisplayName(identity.displayName ?? '');
      setBio(identity.bio ?? '');
      setAvatarUrl(identity.avatarUrl ?? null);
      setBannerUrl(identity.bannerUrl ?? null);
      setColors(identity.profileColors ?? {});
      setPrivacy(identity.privacySettings ?? { ...DEFAULT_PRIVACY });
      setAvatarMediaId(null);
      setBannerMediaId(null);
      setRemoveAvatar(false);
      setRemoveBanner(false);
    }
  }, [identity]);

  const handleAvatarComplete = useCallback((mediaId: string, cdnUrl: string) => {
    setAvatarMediaId(mediaId);
    setAvatarUrl(cdnUrl);
    setRemoveAvatar(false);
  }, []);

  const handleAvatarRemove = useCallback(() => {
    setRemoveAvatar(true);
    setAvatarMediaId(null);
    setAvatarUrl(null);
  }, []);

  const handleBannerComplete = useCallback((mediaId: string, cdnUrl: string) => {
    setBannerMediaId(mediaId);
    setBannerUrl(cdnUrl);
    setRemoveBanner(false);
  }, []);

  const handleBannerRemove = useCallback(() => {
    setRemoveBanner(true);
    setBannerMediaId(null);
    setBannerUrl(null);
  }, []);

  const handleColorChange = useCallback(
    (key: keyof ProfileColors) => (value: string | null) => {
      setColors((prev) => ({ ...prev, [key]: value ?? undefined }));
    },
    []
  );

  const handlePrivacyChange = useCallback(
    (field: keyof ProfilePrivacySettings) => (value: ProfileVisibility) => {
      setPrivacy((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const hasChanges = useMemo(() => {
    if (!identity) return false;
    if (displayName !== (identity.displayName ?? '')) return true;
    if (bio !== (identity.bio ?? '')) return true;
    if (avatarMediaId || removeAvatar) return true;
    if (bannerMediaId || removeBanner) return true;

    const origColors = identity.profileColors ?? {};
    if (
      colors.primary !== origColors.primary ||
      colors.secondary !== origColors.secondary ||
      colors.accent !== origColors.accent
    ) return true;

    const origPrivacy = identity.privacySettings ?? DEFAULT_PRIVACY;
    for (const key of Object.keys(DEFAULT_PRIVACY) as (keyof ProfilePrivacySettings)[]) {
      if (privacy[key] !== origPrivacy[key]) return true;
    }

    return false;
  }, [identity, displayName, bio, avatarMediaId, removeAvatar, bannerMediaId, removeBanner, colors, privacy]);

  const handleSave = useCallback(async () => {
    if (!identity || !hasChanges) return;

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const params: UpdateProfileParams = {};

    if (displayName !== (identity.displayName ?? '')) {
      params.displayName = displayName;
    }
    if (bio !== (identity.bio ?? '')) {
      params.bio = bio;
    }
    if (avatarMediaId) {
      params.avatarMediaId = avatarMediaId;
    } else if (removeAvatar) {
      params.removeAvatar = true;
    }
    if (bannerMediaId) {
      params.bannerMediaId = bannerMediaId;
    } else if (removeBanner) {
      params.removeBanner = true;
    }

    const origColors = identity.profileColors ?? {};
    if (
      colors.primary !== origColors.primary ||
      colors.secondary !== origColors.secondary ||
      colors.accent !== origColors.accent
    ) {
      params.profileColors = {
        primary: colors.primary ?? null,
        secondary: colors.secondary ?? null,
        accent: colors.accent ?? null,
      };
    }

    const origPrivacy = identity.privacySettings ?? DEFAULT_PRIVACY;
    const privacyDiff: Partial<ProfilePrivacySettings> = {};
    for (const key of Object.keys(DEFAULT_PRIVACY) as (keyof ProfilePrivacySettings)[]) {
      if (privacy[key] !== origPrivacy[key]) {
        privacyDiff[key] = privacy[key];
      }
    }
    if (Object.keys(privacyDiff).length > 0) {
      params.privacySettings = privacyDiff;
    }

    try {
      const res = await api.identity.updateProfile(params);

      if (res.success) {
        setSaveMessage(t('identity.profile.saved'));
        setAvatarMediaId(null);
        setBannerMediaId(null);
        setRemoveAvatar(false);
        setRemoveBanner(false);
        refreshIdentitySession?.();
      } else {
        const errMsg = !res.success && 'error' in res ? res.error?.message : 'Save failed';
        setSaveError(errMsg ?? 'Save failed');
      }
    } catch {
      setSaveError('An unexpected error occurred.');
    } finally {
      setSaving(false);
    }
  }, [identity, hasChanges, displayName, bio, avatarMediaId, removeAvatar, bannerMediaId, removeBanner, colors, privacy, api, t, refreshIdentitySession]);

  // Build preview profile
  const previewProfile = useMemo(() => {
    const base = {
      displayName,
      bio,
      avatarUrl,
      bannerUrl,
      profileColors: colors,
      lastActiveAt: identity?.lastActiveAt ?? '',
    };

    if (previewMode === 'self') return base;

    const isVisible = (setting: ProfileVisibility) => {
      if (setting === 'public') return true;
      if (setting === 'friends' && previewMode === 'friend') return true;
      return false;
    };

    return {
      ...base,
      avatarUrl: isVisible(privacy.avatar) ? base.avatarUrl : null,
      bannerUrl: isVisible(privacy.banner) ? base.bannerUrl : null,
      bio: isVisible(privacy.bio) ? base.bio : '',
      lastActiveAt: isVisible(privacy.lastActiveAt) ? base.lastActiveAt : '',
      profileColors: isVisible(privacy.profileColors) ? base.profileColors : {},
    };
  }, [displayName, bio, avatarUrl, bannerUrl, colors, privacy, previewMode, identity]);

  if (!identity) {
    return (
      <div className="page-content">
        <div className="container">
          <Card variant="elevated">
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {t('identity.notLoggedIn')}
            </p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.profile.title')}</h1>
          <p className="page-subtitle">{t('identity.profile.subtitle')}</p>
        </div>

        <div className="profile-editor">
          {/* Banner */}
          <Card variant="elevated" className="slide-up profile-section">
            <h3 className="profile-section-title">{t('identity.profile.banner')}</h3>
            <BannerUpload
              currentUrl={bannerUrl}
              onUploadComplete={handleBannerComplete}
              onRemove={handleBannerRemove}
              disabled={saving}
            />
          </Card>

          {/* Avatar */}
          <Card variant="elevated" className="slide-up profile-section">
            <h3 className="profile-section-title">{t('identity.profile.avatar')}</h3>
            <div className="profile-avatar-row">
              <AvatarUpload
                currentUrl={avatarUrl}
                onUploadComplete={handleAvatarComplete}
                onRemove={handleAvatarRemove}
                disabled={saving}
              />
              <div className="profile-avatar-info">
                <p className="profile-avatar-name">{displayName || identity.username}</p>
                <p className="profile-avatar-username">@{identity.username}</p>
              </div>
            </div>
          </Card>

          {/* Display Name and Bio */}
          <Card variant="elevated" className="slide-up profile-section">
            <div className="profile-field">
              <label className="profile-field-label" htmlFor="profile-display-name">
                {t('identity.profile.displayName')}
              </label>
              <input
                id="profile-display-name"
                type="text"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('identity.profile.displayNamePlaceholder')}
                maxLength={50}
                disabled={saving}
              />
            </div>

            <div className="profile-field">
              <label className="profile-field-label" htmlFor="profile-bio">
                {t('identity.profile.bio')}
              </label>
              <textarea
                id="profile-bio"
                className="input profile-bio-input"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
                placeholder={t('identity.profile.bioPlaceholder')}
                maxLength={BIO_MAX_LENGTH}
                rows={3}
                disabled={saving}
              />
              <span className="profile-bio-count">
                {t('identity.profile.bioCharCount', { count: bio.length, max: BIO_MAX_LENGTH })}
              </span>
            </div>
          </Card>

          {/* Profile Colours */}
          <Card variant="elevated" className="slide-up profile-section">
            <h3 className="profile-section-title">{t('identity.profile.profileColors')}</h3>
            <div className="profile-colors-grid">
              <ProfileColorPicker
                label={t('identity.profile.colorPrimary')}
                value={colors.primary}
                onChange={handleColorChange('primary')}
                disabled={saving}
              />
              <ProfileColorPicker
                label={t('identity.profile.colorSecondary')}
                value={colors.secondary}
                onChange={handleColorChange('secondary')}
                disabled={saving}
              />
              <ProfileColorPicker
                label={t('identity.profile.colorAccent')}
                value={colors.accent}
                onChange={handleColorChange('accent')}
                disabled={saving}
              />
            </div>
          </Card>

          {/* Privacy Settings */}
          <Card variant="elevated" className="slide-up profile-section">
            <h3 className="profile-section-title">{t('identity.profile.privacySettings')}</h3>
            <div className="profile-privacy-grid">
              {(
                [
                  { field: 'avatar' as const, label: t('identity.profile.avatar') },
                  { field: 'banner' as const, label: t('identity.profile.banner') },
                  { field: 'bio' as const, label: t('identity.profile.bio') },
                  { field: 'lastActiveAt' as const, label: 'Last active' },
                  { field: 'profileColors' as const, label: t('identity.profile.profileColors') },
                ] as const
              ).map(({ field, label }) => (
                <div key={field} className="profile-privacy-row">
                  <span className="profile-privacy-field-label">{label}</span>
                  <PrivacySelect
                    value={privacy[field]}
                    onChange={handlePrivacyChange(field)}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Preview */}
          <Card variant="elevated" className="slide-up profile-section">
            <div className="profile-preview-header">
              <h3 className="profile-section-title">{t('identity.profile.preview')}</h3>
              <div className="profile-preview-tabs">
                {(['self', 'friend', 'stranger'] as PreviewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`profile-preview-tab ${previewMode === mode ? 'profile-preview-tab--active' : ''}`}
                    onClick={() => setPreviewMode(mode)}
                  >
                    {t(`identity.profile.preview${mode.charAt(0).toUpperCase() + mode.slice(1)}` as 'identity.profile.previewSelf')}
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-preview-card">
              <div
                className="profile-preview-banner"
                style={{
                  backgroundImage: previewProfile.bannerUrl
                    ? `url(${previewProfile.bannerUrl})`
                    : undefined,
                  backgroundColor: previewProfile.profileColors?.primary || 'var(--color-bg-tertiary)',
                }}
              />
              <div className="profile-preview-body">
                <div className="profile-preview-avatar-wrapper">
                  {previewProfile.avatarUrl ? (
                    <img
                      src={previewProfile.avatarUrl}
                      alt=""
                      className="profile-preview-avatar"
                    />
                  ) : (
                    <div className="profile-preview-avatar profile-preview-avatar--placeholder" />
                  )}
                </div>
                <h4
                  className="profile-preview-name"
                  style={{ color: previewProfile.profileColors?.accent || undefined }}
                >
                  {previewProfile.displayName || identity.username}
                </h4>
                <p className="profile-preview-username">@{identity.username}</p>
                {previewProfile.bio && (
                  <p className="profile-preview-bio">{previewProfile.bio}</p>
                )}
                {previewProfile.lastActiveAt && (
                  <p className="profile-preview-meta">
                    Last active: {new Date(previewProfile.lastActiveAt).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Save */}
          <div className="profile-save-bar">
            {saveMessage && (
              <span className="profile-save-message profile-save-message--success">
                {saveMessage}
              </span>
            )}
            {saveError && (
              <span className="profile-save-message profile-save-message--error">
                {saveError}
              </span>
            )}
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              {saving ? t('identity.profile.saving') : t('identity.profile.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
