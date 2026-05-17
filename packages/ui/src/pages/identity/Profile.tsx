/**
 * Identity Profile page.
 *
 * Tabbed layout for editing identity profile:
 * - Edit tab: interactive preview card with click-to-edit fields
 * - Privacy tab: per-field visibility controls
 *
 * The "viewing as" selector above tabs lets the user preview how their
 * profile appears to friends or strangers, with privacy filtering applied.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApiClient,
  type ProfileVisibility,
  type ProfilePrivacySettings,
  type ProfileColors,
  type UpdateProfileParams,
  type PublicAchievementDefinition,
  type PublicAchievement,
} from '@adieuu/shared';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Tabs, TabList, TabTrigger, TabContent } from '../../components/Tabs';
import { AvatarUpload } from '../../components/AvatarUpload';
import { BannerUpload } from '../../components/BannerUpload';
import { ProfileColorPicker } from '../../components/ProfileColorPicker';
import { PrivacySelect } from '../../components/PrivacySelect';
import { AchievementGrid } from '../../components/AchievementGrid';
import { Icon } from '../../icons/Icon';
import { useIdentity } from '../../hooks/useIdentity';
import { useAppConfig } from '../../config';
import { SessionLockedPage } from '../../components/SessionLockedPage';

const BIO_MAX_LENGTH = 160;

const DEFAULT_PRIVACY: ProfilePrivacySettings = {
  avatar: 'public',
  banner: 'public',
  bio: 'public',
  lastActiveAt: 'friends',
  profileColors: 'public',
  achievements: 'friends',
};

type PreviewMode = 'self' | 'friend' | 'stranger';
type EditingField = 'displayName' | 'bio' | null;

export function IdentityProfile() {
  const { t } = useTranslation();
  const { identity, refreshIdentitySession, status: identityStatus } = useIdentity();
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
  const [editingField, setEditingField] = useState<EditingField>(null);

  const displayNameInputRef = useRef<HTMLInputElement>(null);
  const bioInputRef = useRef<HTMLTextAreaElement>(null);

  const isEditable = previewMode === 'self';

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

  useEffect(() => {
    if (!isEditable) {
      setEditingField(null);
    }
  }, [isEditable]);

  useEffect(() => {
    if (editingField === 'displayName') {
      displayNameInputRef.current?.focus();
      displayNameInputRef.current?.select();
    } else if (editingField === 'bio') {
      bioInputRef.current?.focus();
    }
  }, [editingField]);

  // --- Achievements ---
  const [allDefinitions, setAllDefinitions] = useState<PublicAchievementDefinition[]>([]);
  const [myAchievements, setMyAchievements] = useState<PublicAchievement[]>([]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.achievements.getDefinitions(),
      api.achievements.getMine(),
    ]).then(([defsRes, mineRes]) => {
      if (cancelled) return;
      if (defsRes.success && defsRes.data) setAllDefinitions(defsRes.data.definitions);
      if (mineRes.success && mineRes.data) setMyAchievements(mineRes.data.achievements);
    });

    return () => { cancelled = true; };
  }, [api]);

  // --- Handlers ---

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

  const handleFieldKeyDown = useCallback(
    (field: EditingField) => (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && field === 'displayName') {
        e.preventDefault();
        setEditingField(null);
      } else if (e.key === 'Escape') {
        setEditingField(null);
      }
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
      colors.accent !== origColors.accent ||
      colors.cardBackground !== origColors.cardBackground ||
      colors.background !== origColors.background
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
    setEditingField(null);

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
      colors.accent !== origColors.accent ||
      colors.cardBackground !== origColors.cardBackground ||
      colors.background !== origColors.background
    ) {
      params.profileColors = {
        accent: colors.accent ?? null,
        cardBackground: colors.cardBackground ?? null,
        background: colors.background ?? null,
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

  if (identityStatus === 'locked') {
    return <SessionLockedPage titleI18nKey="identity.profile.title" />;
  }

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
    <div
      className="page-content"
      style={colors.background
        ? { backgroundColor: colors.background }
        : undefined}
    >
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">{t('identity.profile.title')}</h1>
          <p className="page-subtitle">{t('identity.profile.subtitle')}</p>
        </div>

        <div
          className="profile-editor"
          style={colors.accent
            ? { '--profile-accent': colors.accent } as React.CSSProperties
            : undefined}
        >
          {/* Save bar */}
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

          {/* Viewing-as selector */}
          <div className="profile-preview-header">
            <span className="profile-preview-viewing-label">
              {t('identity.profile.viewingAs', 'Viewing as')}
            </span>
            <div className="profile-preview-tabs">
              {(['self', 'friend', 'public'] as PreviewMode[]).map((mode) => (
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

          {/* Tabbed content */}
          <Tabs defaultTab="edit" className="slide-up">
            <TabList>
              <TabTrigger value="edit">
                {t('identity.profile.tabs.edit', 'Edit')}
              </TabTrigger>
              <TabTrigger value="privacy">
                {t('identity.profile.tabs.privacy', 'Privacy')}
              </TabTrigger>
            </TabList>

            {/* Edit tab */}
            <TabContent value="edit">
              <div
                className="profile-edit-card"
                style={previewProfile.profileColors?.cardBackground
                  ? { backgroundColor: previewProfile.profileColors.cardBackground }
                  : undefined}
              >
                {/* Banner */}
                {isEditable ? (
                  <div
                    className="profile-edit-banner"
                    style={{ '--profile-banner-bg': colors.accent || undefined } as React.CSSProperties}
                  >
                    <BannerUpload
                      currentUrl={bannerUrl}
                      onUploadComplete={handleBannerComplete}
                      onRemove={handleBannerRemove}
                      disabled={saving}
                    />
                  </div>
                ) : (
                  <div
                    className="profile-preview-banner"
                    style={{
                      backgroundImage: previewProfile.bannerUrl
                        ? `url(${previewProfile.bannerUrl})`
                        : undefined,
                      backgroundColor: previewProfile.profileColors?.accent || 'var(--color-bg-tertiary)',
                    }}
                  />
                )}

                {/* Body */}
                <div className="profile-edit-body">
                  {/* Avatar */}
                  <div className="profile-edit-avatar-wrapper">
                    {isEditable ? (
                      <AvatarUpload
                        currentUrl={avatarUrl}
                        onUploadComplete={handleAvatarComplete}
                        onRemove={handleAvatarRemove}
                        size={80}
                        disabled={saving}
                      />
                    ) : previewProfile.avatarUrl ? (
                      <img
                        src={previewProfile.avatarUrl}
                        alt=""
                        className="profile-preview-avatar"
                      />
                    ) : (
                      <div className="profile-preview-avatar profile-preview-avatar--placeholder" />
                    )}
                  </div>

                  {/* Display name */}
                  {isEditable && editingField === 'displayName' ? (
                    <div className="profile-edit-field profile-edit-field--editing">
                      <input
                        ref={displayNameInputRef}
                        type="text"
                        className="profile-edit-inline-input profile-edit-inline-input--name"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        onBlur={() => setEditingField(null)}
                        onKeyDown={handleFieldKeyDown('displayName')}
                        maxLength={50}
                        placeholder={t('identity.profile.displayNamePlaceholder')}
                      />
                    </div>
                  ) : (
                    <div
                      className={`profile-edit-field ${isEditable ? 'profile-edit-field--clickable' : ''}`}
                      onClick={isEditable ? () => setEditingField('displayName') : undefined}
                      role={isEditable ? 'button' : undefined}
                      tabIndex={isEditable ? 0 : undefined}
                      onKeyDown={isEditable ? (e) => { if (e.key === 'Enter') setEditingField('displayName'); } : undefined}
                    >
                      <h4
                        className="profile-preview-name"
                        style={{ color: previewProfile.profileColors?.accent || undefined }}
                      >
                        {previewProfile.displayName || identity.username}
                      </h4>
                      {isEditable && (
                        <span className="profile-edit-field-icon">
                          <Icon name="pen" size="xs" />
                        </span>
                      )}
                    </div>
                  )}

                  <p className="profile-preview-username">@{identity.username}</p>

                  {/* Bio */}
                  {isEditable ? (
                    editingField === 'bio' ? (
                      <div className="profile-edit-field profile-edit-field--editing">
                        <textarea
                          ref={bioInputRef}
                          className="profile-edit-inline-input profile-edit-inline-input--bio"
                          value={bio}
                          onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX_LENGTH))}
                          onBlur={() => setEditingField(null)}
                          onKeyDown={handleFieldKeyDown('bio')}
                          maxLength={BIO_MAX_LENGTH}
                          rows={3}
                          placeholder={t('identity.profile.bioPlaceholder')}
                        />
                        <span className="profile-bio-count">
                          {t('identity.profile.bioCharCount', { count: bio.length, max: BIO_MAX_LENGTH })}
                        </span>
                      </div>
                    ) : (
                      <div
                        className="profile-edit-field profile-edit-field--clickable"
                        onClick={() => setEditingField('bio')}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') setEditingField('bio'); }}
                      >
                        <p className={`profile-preview-bio ${!bio ? 'profile-preview-bio--placeholder' : ''}`}>
                          {bio || t('identity.profile.bioPlaceholder')}
                        </p>
                        <span className="profile-edit-field-icon">
                          <Icon name="pen" size="xs" />
                        </span>
                      </div>
                    )
                  ) : previewProfile.bio ? (
                    <p className="profile-preview-bio">{previewProfile.bio}</p>
                  ) : null}

                  {previewProfile.lastActiveAt && (
                    <p className="profile-preview-meta">
                      Last active: {new Date(previewProfile.lastActiveAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Profile colours */}
              {isEditable && (
                <Card variant="elevated" className="profile-section profile-edit-colors-section">
                  <h3 className="profile-section-title">{t('identity.profile.profileColors')}</h3>
                  <div className="profile-colors-grid">
                    <ProfileColorPicker
                      label={t('identity.profile.colorAccent')}
                      value={colors.accent}
                      onChange={handleColorChange('accent')}
                      disabled={saving}
                    />
                    <ProfileColorPicker
                      label={t('identity.profile.colorCardBackground')}
                      value={colors.cardBackground}
                      onChange={handleColorChange('cardBackground')}
                      disabled={saving}
                    />
                    <ProfileColorPicker
                      label={t('identity.profile.colorBackground')}
                      value={colors.background}
                      onChange={handleColorChange('background')}
                      disabled={saving}
                    />
                  </div>
                </Card>
              )}

              {/* Achievements */}
              {allDefinitions.length > 0 && (
                <Card variant="elevated" className="profile-section profile-edit-achievements-section">
                  <AchievementGrid
                    title={t('achievements.yourAchievements')}
                    definitions={allDefinitions}
                    achievements={myAchievements}
                    showStatusFilter
                  />
                </Card>
              )}
            </TabContent>

            {/* Privacy tab */}
            <TabContent value="privacy">
              <Card variant="elevated" className="profile-section">
                <h3 className="profile-section-title">{t('identity.profile.privacySettings')}</h3>
                <div className="profile-privacy-grid">
                  {(
                    [
                      { field: 'avatar' as const, label: t('identity.profile.avatar') },
                      { field: 'banner' as const, label: t('identity.profile.banner') },
                      { field: 'bio' as const, label: t('identity.profile.bio') },
                      { field: 'lastActiveAt' as const, label: 'Last active' },
                      { field: 'profileColors' as const, label: t('identity.profile.profileColors') },
                      { field: 'achievements' as const, label: t('identity.profile.achievements') },
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
            </TabContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
