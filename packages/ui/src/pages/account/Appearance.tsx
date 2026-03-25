/**
 * Appearance / Theme settings page.
 *
 * Allows users to select preset themes, customise colours with pickers,
 * save custom themes, and import/export theme files.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
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

export function AccountAppearance() {
  const { t } = useTranslation();
  const toast = useToast();
  const {
    activeTheme,
    accountThemeId,
    identityThemeId,
    builtinThemes,
    setAccountTheme,
    previewTheme,
    cancelPreview,
    saveCustomTheme,
    removeCustomTheme,
    customThemes,
  } = useTheme();

  const [editMode, setEditMode] = useState(false);
  const [editColors, setEditColors] = useState<ThemeColorTokens | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentThemeId = accountThemeId ?? DEFAULT_THEME_ID;
  const hasIdentityOverride = identityThemeId !== null;

  const accountTheme = useMemo(() => {
    const id = currentThemeId;
    const builtin = builtinThemes.find((b) => b.theme.id === id);
    if (builtin) return builtin.theme;
    return customThemes.find((ct) => ct.id === id) ?? null;
  }, [currentThemeId, builtinThemes, customThemes]);

  const startEditing = useCallback(() => {
    const base = accountTheme ?? activeTheme;
    if (base) {
      setEditColors({ ...base.colors });
      setSaveName(base.name);
      setSaveDesc(base.description);
    }
    setEditMode(true);
  }, [accountTheme, activeTheme]);

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
    await setAccountTheme(theme);
    setEditMode(false);
    setEditColors(null);
    toast.success(t('account.appearance.themeSaved'));
  }, [editColors, saveName, saveDesc, saveCustomTheme, setAccountTheme, toast, t]);

  const handleSelectPreset = useCallback(async (themeId: string) => {
    await setAccountTheme(themeId);
    toast.success(t('account.appearance.themeApplied'));
  }, [setAccountTheme, toast, t]);

  const handleSelectCustom = useCallback(async (theme: ThemeDefinition) => {
    await setAccountTheme(theme);
    toast.success(t('account.appearance.themeApplied'));
  }, [setAccountTheme, toast, t]);

  const handleDeleteCustom = useCallback(async (themeId: string) => {
    await removeCustomTheme(themeId);
    if (currentThemeId === themeId) {
      await setAccountTheme(DEFAULT_THEME_ID);
    }
    toast.success(t('account.appearance.themeDeleted'));
  }, [removeCustomTheme, currentThemeId, setAccountTheme, toast, t]);

  // ---- Export ----
  const handleExport = useCallback(() => {
    const theme = accountTheme ?? activeTheme;
    if (!theme) return;
    const json = JSON.stringify(theme, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.name.toLowerCase().replace(/\s+/g, '-')}.adieuu-theme.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [accountTheme, activeTheme]);

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
        toast.error(`${t('account.appearance.importFailed')}: ${result.error}`);
        return;
      }

      const imported = { ...result.theme, id: generateThemeId() };
      await saveCustomTheme(imported);
      await setAccountTheme(imported);
      toast.success(t('account.appearance.importSuccess'));
    } catch {
      toast.error(t('account.appearance.importFailed'));
    }
  }, [saveCustomTheme, setAccountTheme, toast, t]);

  const fieldsByCategory = useMemo(() => {
    const map = new Map<ColorCategory, ColorField[]>();
    for (const cat of CATEGORIES) {
      map.set(cat, COLOR_FIELDS.filter((f) => f.category === cat));
    }
    return map;
  }, []);

  return (
    <div className="page-content">
      <div className="container">
        <div className="page-header">
          <div className="page-header-content">
            <div>
              <h1 className="page-title">{t('account.appearance.title')}</h1>
              <p className="page-subtitle">{t('account.appearance.subtitle')}</p>
              <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>
                <Trans
                  i18nKey="account.appearance.aliasOverrideHint"
                  components={{ aliasLink: <Link to="/identity/appearance" /> }}
                />
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

        {hasIdentityOverride && (
          <Alert variant="info" className="slide-up" style={{ marginBottom: '1.5rem' }}>
            <Trans
              i18nKey="account.appearance.identityOverrideNotice"
              components={{ aliasLink: <Link to="/identity/appearance" /> }}
            />
          </Alert>
        )}

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
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={!accountTheme && !activeTheme}>
              <ExportIcon />
              {t('account.appearance.exportTheme')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleImport}>
              <ImportIcon />
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

      </div>
    </div>
  );
}

function ExportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.375rem', flexShrink: 0 }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
