/**
 * Identity-level Appearance / Theme settings page.
 *
 * Provides a toggle for per-identity theme overrides. When enabled,
 * the full theme selection UI (presets, custom themes, colour editor,
 * import/export) is shown -- mirroring the account-level page but
 * persisting selections against the active identity.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
import { useIdentity } from '../../hooks/useIdentity';
import { DEFAULT_THEME_ID } from '../../constants/builtinThemes';
import { sanitizeImportedTheme } from '../../utils/themeSanitizer';
import type { ThemeDefinition, ThemeColorTokens } from '@adieuu/shared';
import { TOKEN_TO_CSS_VAR } from '@adieuu/shared';

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
    accountThemeId,
    identityThemeId,
    builtinThemes,
    setIdentityTheme,
    previewTheme,
    cancelPreview,
    saveCustomTheme,
    removeCustomTheme,
    customThemes,
  } = useTheme();
  const { status: identityStatus, identity } = useIdentity();

  const overrideEnabled = identityThemeId !== null;
  const currentThemeId = identityThemeId ?? accountThemeId ?? DEFAULT_THEME_ID;

  const [editMode, setEditMode] = useState(false);
  const [editColors, setEditColors] = useState<ThemeColorTokens | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Override toggle ----

  const handleEnableOverride = useCallback(async () => {
    if (activeTheme) {
      await setIdentityTheme(activeTheme.id);
      toast.success(t('identity.appearance.overrideEnabled'));
    }
  }, [activeTheme, setIdentityTheme, toast, t]);

  const handleDisableOverride = useCallback(async () => {
    await setIdentityTheme(null);
    stopEditing();
    toast.success(t('identity.appearance.overrideDisabled'));
  }, [setIdentityTheme, toast, t]);

  // ---- Editor ----

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
    toast.success(t('identity.appearance.themeSaved'));
  }, [editColors, saveName, saveDesc, saveCustomTheme, setIdentityTheme, toast, t]);

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
            <div className="page-header-actions">
              <Link to="/account/appearance/community" style={{ textDecoration: 'none' }}>
                <Button variant="secondary" size="sm">
                  {t('account.appearance.communityTitle')}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Override Toggle */}
        <Card variant="elevated" className="slide-up app-settings-card">
          <div className="app-settings-section-header">
            <div>
              <h2 className="app-settings-section-title">{t('identity.appearance.overrideTitle')}</h2>
              <p className="app-settings-section-desc">{t('identity.appearance.overrideDescription')}</p>
            </div>
            <div className="page-header-actions">
              {overrideEnabled ? (
                <Button variant="secondary" size="sm" onClick={() => void handleDisableOverride()}>
                  {t('identity.appearance.disableOverride')}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => void handleEnableOverride()}>
                  {t('identity.appearance.enableOverride')}
                </Button>
              )}
            </div>
          </div>
          {!overrideEnabled && (
            <p className="theme-identity-inheriting">
              <Trans
                i18nKey="identity.appearance.inheriting"
                components={{ accountLink: <Link to="/account/appearance" /> }}
              />
            </p>
          )}
        </Card>

        {overrideEnabled && (
          <>
            {/* Preset Themes */}
            <Card variant="elevated" className="slide-up app-settings-card">
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
              <Card variant="elevated" className="slide-up app-settings-card">
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
                  ))}
                </div>
              </Card>
            )}

            {/* Theme Editor */}
            <Card variant="elevated" className="slide-up app-settings-card">
              <div className="app-settings-section-header">
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
            <Card variant="elevated" className="slide-up app-settings-card">
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
          </>
        )}
      </div>
    </div>
  );
}
