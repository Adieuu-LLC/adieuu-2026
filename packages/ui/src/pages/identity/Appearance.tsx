/**
 * Identity-level Appearance / Theme settings page.
 *
 * This is now the primary appearance page. All visual preferences — theme
 * selection, colour editor, language, message layout, icon packs,
 * import/export, and per-identity display toggles — live here.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RadioGroup } from '@ark-ui/react';
import { AppearanceSectionNav, type AppearanceSection } from './AppearanceSectionNav';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
import { useIdentity } from '../../hooks/useIdentity';
import { useMessageLayoutPreference, setMessageLayout, type MessageLayout } from '../../hooks/useMessageLayoutPreference';
import { DEFAULT_THEME_ID } from '../../constants/builtinThemes';
import { sanitizeImportedTheme } from '../../utils/themeSanitizer';
import { loadShowMessageArtifacts, saveShowMessageArtifacts } from '../../services/preKeyService';
import { loadReactionNotificationsEnabled, saveReactionNotificationsEnabled } from '../../hooks/useReactionNotificationPreference';
import { useEmbedPreference, type EmbedVisibilityMode, type EmbedPreference, type EmbedMaxWidth } from '../../hooks/useEmbedPreference';
import { useClaimAchievement } from '../../hooks/useClaimAchievement';
import { useMySharedThemeChecksums } from '../../hooks/useMySharedThemeChecksums';
import { CustomThemeShareButton } from '../../components/CustomThemeShareButton';
import { ComposerControlsEditor } from '../../components/ComposerControlsEditor';
import type { ThemeDefinition, ThemeColorTokens } from '@adieuu/shared';
import { TOKEN_TO_CSS_VAR } from '@adieuu/shared';
import { i18n, availableLanguages } from '../../i18n';
import type { LanguageCode } from '../../i18n';

type ColorCategory = 'backgrounds' | 'text' | 'accents' | 'borders' | 'status' | 'branding';

interface ColorField {
  key: keyof ThemeColorTokens;
  label: string;
  category: ColorCategory;
}

const COLOR_FIELDS: ColorField[] = [
  { key: 'bgPrimary', label: 'Primary Background', category: 'backgrounds' },
  { key: 'bgSecondary', label: 'Secondary Background', category: 'backgrounds' },
  { key: 'bgTertiary', label: 'Tertiary Background', category: 'backgrounds' },
  { key: 'bgElevated', label: 'Elevated Background', category: 'backgrounds' },

  { key: 'textPrimary', label: 'Primary Text', category: 'text' },
  { key: 'textSecondary', label: 'Secondary Text', category: 'text' },
  { key: 'textMuted', label: 'Muted Text', category: 'text' },
  { key: 'textInverse', label: 'Inverse Text', category: 'text' },

  { key: 'accentPrimary', label: 'Primary Accent', category: 'accents' },
  { key: 'accentPrimaryHover', label: 'Accent Hover', category: 'accents' },
  { key: 'accentPrimaryActive', label: 'Accent Active', category: 'accents' },
  { key: 'accentSecondary', label: 'Secondary Accent', category: 'accents' },

  { key: 'border', label: 'Border', category: 'borders' },
  { key: 'borderMuted', label: 'Muted Border', category: 'borders' },
  { key: 'borderFocus', label: 'Focus Ring', category: 'borders' },

  { key: 'success', label: 'Success', category: 'status' },
  { key: 'warning', label: 'Warning', category: 'status' },
  { key: 'error', label: 'Error', category: 'status' },
  { key: 'info', label: 'Info', category: 'status' },

  { key: 'logoPrimary', label: 'Logo Primary', category: 'branding' },
  { key: 'logoSecondary', label: 'Logo Secondary', category: 'branding' },
];

const CATEGORY_LABELS: Record<ColorCategory, string> = {
  backgrounds: 'Backgrounds',
  text: 'Text',
  accents: 'Accents',
  borders: 'Borders',
  status: 'Status',
  branding: 'Branding',
};

const CATEGORIES: ColorCategory[] = ['backgrounds', 'text', 'accents', 'borders', 'status', 'branding'];

function hexFromCssColor(value: string): string {
  if (value.startsWith('#') && (value.length === 7 || value.length === 4)) {
    return value;
  }
  return '#888888';
}

function generateThemeId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function IdentityAppearance() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    activeTheme,
    identityThemeId,
    accountThemeId,
    builtinThemes,
    setIdentityTheme,
    previewTheme,
    cancelPreview,
    saveCustomTheme,
    removeCustomTheme,
    customThemes,
  } = useTheme();
  const { status: identityStatus, identity } = useIdentity();
  const messageLayout = useMessageLayoutPreference();
  const claimAchievement = useClaimAchievement();
  const { sharedChecksums, refresh: refreshSharedThemeChecksums } = useMySharedThemeChecksums();

  const currentThemeId = identityThemeId ?? accountThemeId ?? DEFAULT_THEME_ID;

  const [showArtifacts, setShowArtifacts] = useState(
    () => identity ? loadShowMessageArtifacts(identity.id) : false
  );

  const [reactionNotifications, setReactionNotifications] = useState(
    () => identity ? loadReactionNotificationsEnabled(identity.id) : true
  );

  const [embedPref, setEmbedPref] = useEmbedPreference(identity?.id ?? '');
  const [allowlistInput, setAllowlistInput] = useState('');

  const handleEmbedModeChange = useCallback((details: { value: string | null }) => {
    const mode = details.value as EmbedVisibilityMode | null;
    if (mode) setEmbedPref({ ...embedPref, mode });
  }, [embedPref, setEmbedPref]);

  const handleAddAllowlistEntry = useCallback(() => {
    const entry = allowlistInput.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (!entry || embedPref.allowlist.includes(entry)) {
      setAllowlistInput('');
      return;
    }
    setEmbedPref({ ...embedPref, allowlist: [...embedPref.allowlist, entry] });
    setAllowlistInput('');
  }, [allowlistInput, embedPref, setEmbedPref]);

  const handleRemoveAllowlistEntry = useCallback((entry: string) => {
    setEmbedPref({ ...embedPref, allowlist: embedPref.allowlist.filter((e) => e !== entry) });
  }, [embedPref, setEmbedPref]);

  const handleEmbedMaxWidthChange = useCallback((details: { value: string | null }) => {
    const val = Number(details.value) as EmbedMaxWidth;
    if (details.value !== null) setEmbedPref({ ...embedPref, maxWidth: val });
  }, [embedPref, setEmbedPref]);

  const handleArtifactsToggle = useCallback((enabled: boolean) => {
    setShowArtifacts(enabled);
    if (identity) {
      saveShowMessageArtifacts(identity.id, enabled);
    }
    if (enabled) claimAchievement('show_message_artifacts_enabled');
  }, [identity, claimAchievement]);

  const handleReactionNotificationsToggle = useCallback((enabled: boolean) => {
    setReactionNotifications(enabled);
    if (identity) {
      saveReactionNotificationsEnabled(identity.id, enabled);
    }
  }, [identity]);

  const [editMode, setEditMode] = useState(false);
  const [editColors, setEditColors] = useState<ThemeColorTokens | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  const sections: AppearanceSection[] = useMemo(() => {
    const list: AppearanceSection[] = [
      { id: 'language', label: t('account.appearance.languageTitle') },
      { id: 'message-layout', label: t('account.appearance.messageLayoutTitle') },
      { id: 'composer-controls', label: t('composerControls.title', 'Composer controls') },
      { id: 'preset-themes', label: t('account.appearance.presetsTitle') },
    ];
    if (customThemes.length > 0) {
      list.push({ id: 'custom-themes', label: t('account.appearance.customThemesTitle') });
    }
    list.push(
      { id: 'theme-editor', label: t('account.appearance.editorTitle') },
      { id: 'import-export', label: t('account.appearance.importExportTitle') },
      { id: 'message-display', label: t('identity.appearance.messageDisplayTitle', 'Message Display') },
    );
    return list;
  }, [t, customThemes.length]);

  const setSectionRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) {
      sectionRefs.current.set(id, el);
    } else {
      sectionRefs.current.delete(id);
    }
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const timer = window.setTimeout(() => {
      sectionRefs.current.get(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    return () => window.clearTimeout(timer);
  }, []);

  const handleLanguageChange = useCallback((code: LanguageCode) => {
    void i18n.changeLanguage(code);
  }, []);

  const handleMessageLayoutChange = useCallback((details: { value: string | null }) => {
    if (!details.value) return;
    const next = details.value as MessageLayout;
    setMessageLayout(next);
    toast.success(t('account.appearance.messageLayoutApplied'));
  }, [toast, t]);

  // ---- Theme selection & editor ----

  const startEditing = useCallback(() => {
    if (activeTheme) {
      setEditColors({ ...activeTheme.colors });
      setSaveName(activeTheme.name);
      setSaveDesc(activeTheme.description);
    }
    setEditMode(true);
  }, [activeTheme]);

  const stopEditing = useCallback(() => {
    setEditMode(false);
    setEditColors(null);
    cancelPreview();
  }, [cancelPreview]);

  const handleColorChange = useCallback((key: keyof ThemeColorTokens, value: string) => {
    setEditColors((prev: ThemeColorTokens | null) => {
      if (!prev) return prev;
      const updated = { ...prev, [key]: value };
      previewTheme({
        id: 'preview',
        name: 'Preview',
        description: '',
        version: 1,
        colors: updated,
      });
      return updated;
    });
  }, [previewTheme]);

  const handleSaveCustom = useCallback(async () => {
    if (!editColors || !saveName.trim()) return;

    const theme: ThemeDefinition = {
      id: generateThemeId(),
      name: saveName.trim(),
      description: saveDesc.trim(),
      version: 1,
      colors: editColors,
    };

    await saveCustomTheme(theme);
    await setIdentityTheme(theme);
    setEditMode(false);
    setEditColors(null);
    claimAchievement('theme_saved');
    toast.success(t('identity.appearance.themeSaved'));
  }, [editColors, saveName, saveDesc, saveCustomTheme, setIdentityTheme, claimAchievement, toast, t]);

  const handleSelectPreset = useCallback(async (themeId: string) => {
    await setIdentityTheme(themeId);
    toast.success(t('identity.appearance.themeApplied'));
  }, [setIdentityTheme, toast, t]);

  const handleSelectCustom = useCallback(async (theme: ThemeDefinition) => {
    await setIdentityTheme(theme);
    toast.success(t('identity.appearance.themeApplied'));
  }, [setIdentityTheme, toast, t]);

  const handleDeleteCustom = useCallback(async (themeId: string) => {
    await removeCustomTheme(themeId);
    if (currentThemeId === themeId) {
      await setIdentityTheme(DEFAULT_THEME_ID);
    }
    toast.success(t('identity.appearance.themeDeleted'));
  }, [removeCustomTheme, currentThemeId, setIdentityTheme, toast, t]);

  // ---- Export ----
  const handleExport = useCallback(() => {
    if (!activeTheme) return;
    const json = JSON.stringify(activeTheme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTheme.name.toLowerCase().replace(/\s+/g, '-')}.adieuu-theme.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeTheme]);

  // ---- Import ----
  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    try {
      const text = await file.text();
      const result = sanitizeImportedTheme(text);
      if (!result.ok) {
        toast.error(`${t('identity.appearance.importFailed')}: ${result.error}`);
        return;
      }

      const imported = { ...result.theme, id: generateThemeId() };
      await saveCustomTheme(imported);
      await setIdentityTheme(imported);
      toast.success(t('identity.appearance.importSuccess'));
    } catch {
      toast.error(t('identity.appearance.importFailed'));
    }
  }, [saveCustomTheme, setIdentityTheme, toast, t]);

  const fieldsByCategory = useMemo(() => {
    const map = new Map<ColorCategory, ColorField[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, COLOR_FIELDS.filter((f) => f.category === cat));
    }
    return map;
  }, []);

  // ---- Gate on identity status ----

  if (identityStatus === 'locked') {
    return (
      <div className="page-content">
        <div className="container">
          <div className="page-header">
            <h1 className="page-title">{t('identity.appearance.title')}</h1>
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
            <h1 className="page-title">{t('identity.appearance.title')}</h1>
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
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('identity.appearance.title')}</h1>
              <p className="page-subtitle">
                {t('identity.appearance.subtitle', { alias: identity?.displayName })}
              </p>
            </div>
            <div className="page-header-actions" data-tour="appearance-community-link">
              <Link to="/identity/appearance/community" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm">
                  {t('account.appearance.communityTitle')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="appearance-layout">
          <AppearanceSectionNav sections={sections} sectionRefs={sectionRefs} ariaLabel={t('identity.appearance.title')} />

          <div className="appearance-sections">
            {/* Language */}
            <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('language', el)} data-section="language">
          <h2 className="app-settings-section-title">{t('account.appearance.languageTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.appearance.languageDescription')}</p>
          <div className="app-settings-language-row">
            <label htmlFor="language-select" className="app-settings-language-label">
              {t('account.appearance.languageLabel')}
            </label>
            <select
              id="language-select"
              className="app-settings-language-select"
              value={i18n.language}
              onChange={(e) => handleLanguageChange(e.target.value as LanguageCode)}
            >
              {availableLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>
          <p className="app-settings-section-hint">
            <Trans
              i18nKey="account.appearance.languageContributeHint"
              components={{ mailLink: /* biome-ignore lint/a11y/useAnchorContent: Trans provides children at runtime */ <a href="mailto:say@adieuu.com" /> }}
            />
          </p>
        </Card>

        {/* Message Layout */}
        <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('message-layout', el)} data-section="message-layout">
          <h2 className="app-settings-section-title">{t('account.appearance.messageLayoutTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.appearance.messageLayoutDescription')}</p>

          <RadioGroup.Root
            value={messageLayout}
            onValueChange={handleMessageLayoutChange}
            className="activity-radio-group"
          >
            <RadioGroup.Item value="linear" className="activity-radio-item">
              <RadioGroup.ItemControl className="activity-radio-control" />
              <RadioGroup.ItemText className="activity-radio-text">
                <span className="activity-radio-title">
                  {t('account.appearance.messageLayoutLinear')}
                </span>
                <span className="activity-radio-description">
                  {t('account.appearance.messageLayoutLinearDesc')}
                </span>
              </RadioGroup.ItemText>
              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>

            <RadioGroup.Item value="bubble" className="activity-radio-item">
              <RadioGroup.ItemControl className="activity-radio-control" />
              <RadioGroup.ItemText className="activity-radio-text">
                <span className="activity-radio-title">
                  {t('account.appearance.messageLayoutBubble')}
                </span>
                <span className="activity-radio-description">
                  {t('account.appearance.messageLayoutBubbleDesc')}
                </span>
              </RadioGroup.ItemText>
              <RadioGroup.ItemHiddenInput />
            </RadioGroup.Item>
          </RadioGroup.Root>
        </Card>

        {/* Composer Controls */}
        <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('composer-controls', el)} data-section="composer-controls">
          <h2 className="app-settings-section-title">{t('composerControls.title', 'Composer controls')}</h2>
          <p className="app-settings-section-desc">
            {t(
              'composerControls.description',
              'Customize which controls appear in the message composer, where they sit, and in what order.',
            )}
          </p>
          <ComposerControlsEditor />
        </Card>

        {/* Preset Themes */}
        <Card variant="elevated" className="slide-up app-settings-card" data-tour="appearance-presets" ref={(el) => setSectionRef('preset-themes', el)} data-section="preset-themes">
          <h2 className="app-settings-section-title">{t('account.appearance.presetsTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.appearance.presetsDescription')}</p>

          <div className="theme-preset-grid">
            {builtinThemes.map((preset) => (
              <button
                key={preset.theme.id}
                type="button"
                className={`theme-preset-card${currentThemeId === preset.theme.id ? ' theme-preset-card--active' : ''}`}
                onClick={() => void handleSelectPreset(preset.theme.id)}
              >
                <div className="theme-preset-swatches">
                  <span className="theme-swatch" style={{ background: preset.theme.colors.bgPrimary }} />
                  <span className="theme-swatch" style={{ background: preset.theme.colors.accentPrimary }} />
                  <span className="theme-swatch" style={{ background: preset.theme.colors.textPrimary }} />
                  <span className="theme-swatch" style={{ background: preset.theme.colors.bgSecondary }} />
                </div>
                <span className="theme-preset-name">{preset.theme.name}</span>
                <span className="theme-preset-label">{t('account.appearance.official')}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* Custom Themes */}
        {customThemes.length > 0 && (
          <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('custom-themes', el)} data-section="custom-themes">
            <h2 className="app-settings-section-title">{t('account.appearance.customThemesTitle')}</h2>
            <div className="theme-preset-grid">
              {customThemes.map((ct) => (
                <div key={ct.id} className={`theme-preset-card${currentThemeId === ct.id ? ' theme-preset-card--active' : ''}`}>
                  <button
                    type="button"
                    className="theme-preset-card-inner"
                    onClick={() => void handleSelectCustom(ct)}
                  >
                    <div className="theme-preset-swatches">
                      <span className="theme-swatch" style={{ background: ct.colors.bgPrimary }} />
                      <span className="theme-swatch" style={{ background: ct.colors.accentPrimary }} />
                      <span className="theme-swatch" style={{ background: ct.colors.textPrimary }} />
                      <span className="theme-swatch" style={{ background: ct.colors.bgSecondary }} />
                    </div>
                    <span className="theme-preset-name">{ct.name}</span>
                    {ct.author && (
                      <span className="theme-preset-meta">
                        {t('account.appearance.authorLabel', { author: ct.author })}
                      </span>
                    )}
                  </button>
                  <div className="theme-preset-card-actions">
                    <CustomThemeShareButton
                      theme={ct}
                      sharedChecksums={sharedChecksums}
                      onShared={refreshSharedThemeChecksums}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="theme-preset-delete"
                      onClick={() => void handleDeleteCustom(ct.id)}
                      title={t('account.appearance.deleteTheme')}
                    >
                      x
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Theme Editor */}
        <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('theme-editor', el)} data-section="theme-editor">
          <div className="app-settings-section-header" data-tour="appearance-editor">
            <div>
              <h2 className="app-settings-section-title">{t('account.appearance.editorTitle')}</h2>
              <p className="app-settings-section-desc">{t('account.appearance.editorDescription')}</p>
            </div>
            <div className="page-header-actions">
              {!editMode ? (
                <Button variant="primary" size="sm" onClick={startEditing}>
                  {t('account.appearance.customise')}
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={stopEditing}>
                  {t('account.appearance.cancel')}
                </Button>
              )}
            </div>
          </div>

          {editMode && editColors && (
            <div className="theme-editor">
              {CATEGORIES.map((cat) => (
                <div key={cat} className="theme-editor-category">
                  <h3 className="theme-editor-category-title">{CATEGORY_LABELS[cat]}</h3>
                  <div className="theme-editor-fields">
                    {fieldsByCategory.get(cat)?.map((field) => (
                      <label key={String(field.key)} className="theme-editor-field">
                        <span className="theme-editor-field-label">{field.label}</span>
                        <div className="theme-editor-field-controls">
                          <input
                            type="color"
                            className="theme-editor-color-input"
                            value={hexFromCssColor(editColors[field.key])}
                            onChange={(e) => handleColorChange(field.key, e.target.value)}
                          />
                          <input
                            type="text"
                            className="theme-editor-text-input"
                            value={editColors[field.key]}
                            onChange={(e) => handleColorChange(field.key, e.target.value)}
                            spellCheck={false}
                          />
                        </div>
                        <span className="theme-editor-field-hint">{TOKEN_TO_CSS_VAR[field.key]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="theme-editor-save">
                <input
                  type="text"
                  className="theme-editor-name-input"
                  placeholder={t('account.appearance.themeName')}
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  maxLength={50}
                />
                <input
                  type="text"
                  className="theme-editor-desc-input"
                  placeholder={t('account.appearance.themeDescription')}
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  maxLength={200}
                />
                <Button
                  variant="primary"
                  size="md"
                  disabled={!saveName.trim()}
                  onClick={() => void handleSaveCustom()}
                >
                  {t('account.appearance.saveTheme')}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Import / Export */}
        <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('import-export', el)} data-section="import-export">
          <h2 className="app-settings-section-title">{t('account.appearance.importExportTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.appearance.importExportDescription')}</p>
          <div className="theme-import-export-row">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={!activeTheme}>
              <Icon name="fileExport" style={{ marginRight: '0.375rem', flexShrink: 0 }} />
              {t('account.appearance.exportTheme')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleImport}>
              <Icon name="fileImport" style={{ marginRight: '0.375rem', flexShrink: 0 }} />
              {t('account.appearance.importTheme')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => void handleFileSelected(e)}
            />
          </div>
        </Card>

        {/* Message Display Preferences */}
        <Card variant="elevated" className="slide-up app-settings-card" ref={(el) => setSectionRef('message-display', el)} data-section="message-display">
          <h2 className="app-settings-section-title">
            {t('identity.appearance.messageDisplayTitle', 'Message Display')}
          </h2>
          <p className="app-settings-section-desc">
            {t('identity.appearance.messageDisplayDescription', 'Control how messages are displayed in your conversations.')}
          </p>
          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={showArtifacts}
              onChange={(e) => handleArtifactsToggle(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('identity.appearance.showArtifactsTitle', 'Show Message Artifacts')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('identity.appearance.showArtifactsHint', 'When enabled, deleted messages, expired forward secrecy messages, and messages that could not be decrypted are shown in conversations. When disabled, these artifacts are hidden for a cleaner view. This is a local display preference only and does not affect message storage.')}
              </span>
            </span>
          </label>
          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={reactionNotifications}
              onChange={(e) => handleReactionNotificationsToggle(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('identity.appearance.reactionNotificationsTitle', 'Reaction Notifications')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('identity.appearance.reactionNotificationsHint', 'When enabled, you will receive notifications and unread indicators when someone reacts to your messages. This only applies to reactions on messages you sent.')}
              </span>
            </span>
          </label>

          <div className="app-settings-embed-visibility">
            <span className="app-settings-toggle-title">
              {t('identity.appearance.embedVisibilityTitle', 'Link Embeds')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('identity.appearance.embedVisibilityHint', 'Control whether link previews and video embeds are shown in messages.')}
            </span>
            <RadioGroup.Root
              value={embedPref.mode}
              onValueChange={handleEmbedModeChange}
              className="app-settings-radio-group"
            >
              <RadioGroup.Item value="none" className="app-settings-radio-item">
                <RadioGroup.ItemControl className="app-settings-radio-control" />
                <RadioGroup.ItemText>{t('identity.appearance.embedNone', 'None')}</RadioGroup.ItemText>
                <RadioGroup.ItemHiddenInput />
              </RadioGroup.Item>
              <RadioGroup.Item value="all" className="app-settings-radio-item">
                <RadioGroup.ItemControl className="app-settings-radio-control" />
                <RadioGroup.ItemText>{t('identity.appearance.embedAll', 'All')}</RadioGroup.ItemText>
                <RadioGroup.ItemHiddenInput />
              </RadioGroup.Item>
              <RadioGroup.Item value="allowlist" className="app-settings-radio-item">
                <RadioGroup.ItemControl className="app-settings-radio-control" />
                <RadioGroup.ItemText>{t('identity.appearance.embedAllowlist', 'Allowlist')}</RadioGroup.ItemText>
                <RadioGroup.ItemHiddenInput />
              </RadioGroup.Item>
            </RadioGroup.Root>

            {embedPref.mode === 'allowlist' && (
              <div className="app-settings-embed-allowlist">
                <div className="app-settings-embed-allowlist-input-row">
                  <input
                    type="text"
                    className="app-settings-embed-allowlist-input"
                    placeholder={t('identity.appearance.embedAllowlistPlaceholder', 'e.g. youtube.com')}
                    value={allowlistInput}
                    onChange={(e) => setAllowlistInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddAllowlistEntry();
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAddAllowlistEntry}
                    disabled={!allowlistInput.trim()}
                  >
                    {t('common.add', 'Add')}
                  </Button>
                </div>
                {embedPref.allowlist.length > 0 && (
                  <div className="app-settings-embed-allowlist-tags">
                    {embedPref.allowlist.map((entry) => (
                      <span key={entry} className="app-settings-embed-allowlist-tag">
                        {entry}
                        <button
                          type="button"
                          className="app-settings-embed-allowlist-tag-remove"
                          onClick={() => handleRemoveAllowlistEntry(entry)}
                          aria-label={t('common.remove', 'Remove')}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="app-settings-embed-max-width">
              <span className="app-settings-toggle-title">
                {t('identity.appearance.embedMaxWidthTitle', 'Max Embed Width')}
              </span>
              <RadioGroup.Root
                value={String(embedPref.maxWidth)}
                onValueChange={handleEmbedMaxWidthChange}
                className="app-settings-radio-group"
              >
                <RadioGroup.Item value="0" className="app-settings-radio-item">
                  <RadioGroup.ItemControl className="app-settings-radio-control" />
                  <RadioGroup.ItemText>{t('identity.appearance.embedMaxWidthNone', 'No max')}</RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>
                <RadioGroup.Item value="100" className="app-settings-radio-item">
                  <RadioGroup.ItemControl className="app-settings-radio-control" />
                  <RadioGroup.ItemText>100px</RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>
                <RadioGroup.Item value="300" className="app-settings-radio-item">
                  <RadioGroup.ItemControl className="app-settings-radio-control" />
                  <RadioGroup.ItemText>300px</RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>
                <RadioGroup.Item value="500" className="app-settings-radio-item">
                  <RadioGroup.ItemControl className="app-settings-radio-control" />
                  <RadioGroup.ItemText>500px</RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>
              </RadioGroup.Root>
            </div>
          </div>
        </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
