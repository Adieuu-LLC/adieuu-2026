/**
 * Appearance / Theme settings page.
 *
 * Allows users to select preset themes, customise colours with pickers,
 * save custom themes, and import/export theme files.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { RadioGroup } from '@ark-ui/react';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Alert } from '../../components/Alert';
import { useToast } from '../../components/Toast';
import { useTheme } from '../../hooks/useTheme';
import { useIconPack } from '../../hooks/useIconPack';
import { useMessageLayoutPreference, setMessageLayout, type MessageLayout } from '../../hooks/useMessageLayoutPreference';
import { DEFAULT_THEME_ID } from '../../constants/builtinThemes';
import { sanitizeImportedTheme } from '../../utils/themeSanitizer';
import { Icon } from '../../icons/Icon';
import { ICON_PACKS, DEFAULT_ICON_PACK_ID } from '../../icons/packs';
import type { IconPackId } from '../../icons/packs';
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

  const { packId, setIconPack } = useIconPack();
  const messageLayout = useMessageLayoutPreference();

  const [editMode, setEditMode] = useState(false);
  const [editColors, setEditColors] = useState<ThemeColorTokens | null>(null);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [iconPackOpen, setIconPackOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLanguageChange = useCallback((code: LanguageCode) => {
    void i18n.changeLanguage(code);
  }, []);

  const handleMessageLayoutChange = useCallback((details: { value: string | null }) => {
    if (!details.value) return;
    const next = details.value as MessageLayout;
    setMessageLayout(next);
    toast.success(t('account.appearance.messageLayoutApplied'));
  }, [toast, t]);

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

  const handleSelectIconPack = useCallback(async (id: IconPackId) => {
    await setIconPack(id);
    toast.success(t('account.appearance.iconPackApplied'));
  }, [setIconPack, toast, t]);

  const iconPackFamilies = useMemo(() => {
    const families = new Map<string, typeof ICON_PACKS>();
    const order = ['Sharp', 'Classic', 'DuoTone', 'Sharp DuoTone', 'Curated'];
    for (const pack of ICON_PACKS) {
      const list = families.get(pack.family) ?? [];
      list.push(pack);
      families.set(pack.family, list);
    }
    const sorted = new Map<string, typeof ICON_PACKS>();
    for (const key of order) {
      const packs = families.get(key);
      if (packs) sorted.set(key, packs);
    }
    for (const [key, packs] of families) {
      if (!sorted.has(key)) sorted.set(key, packs);
    }
    return sorted;
  }, []);

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
            <div className="page-header-actions" data-tour="appearance-community-link">
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

        {/* Language */}
        <Card variant="elevated" className="slide-up app-settings-card">
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
              components={{ mailLink: <a href="mailto:say@adieuu.com" /> }}
            />
          </p>
        </Card>

        {/* Message Layout */}
        <Card variant="elevated" className="slide-up app-settings-card">
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

        {/* Preset Themes */}
        <Card variant="elevated" className="slide-up app-settings-card" data-tour="appearance-presets">
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

        {/* Icon Pack (collapsible) */}
        <Card variant="elevated" className="slide-up app-settings-card">
          <button
            type="button"
            className="app-settings-section-header app-settings-section-header--collapsible"
            onClick={() => setIconPackOpen((prev) => !prev)}
            aria-expanded={iconPackOpen}
          >
            <div>
              <h2 className="app-settings-section-title">{t('account.appearance.iconPackTitle')}</h2>
              <p className="app-settings-section-desc">{t('account.appearance.iconPackDescription')}</p>
            </div>
            <Icon
              name={iconPackOpen ? 'chevronUp' : 'chevronDown'}
              className="app-settings-section-chevron"
            />
          </button>

          {iconPackOpen && (
            <div className="icon-pack-families">
              {Array.from(iconPackFamilies.entries()).map(([family, packs]) => (
                <div key={family} className="icon-pack-family">
                  <h3 className="icon-pack-family-name">{family}</h3>
                  <div className="icon-pack-grid">
                    {packs.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        className={`icon-pack-card${packId === pack.id ? ' icon-pack-card--active' : ''}`}
                        onClick={() => void handleSelectIconPack(pack.id as IconPackId)}
                      >
                        <span className="icon-pack-card-label">
                          {family === 'Curated' ? pack.label : pack.weight}
                          {pack.id === DEFAULT_ICON_PACK_ID && (
                            <span className="icon-pack-card-default">{t('account.appearance.iconPackDefault')}</span>
                          )}
                        </span>
                        <div className="icon-pack-card-preview">
                          <Icon name="home" packOverride={pack.id} />
                          <Icon name="message" packOverride={pack.id} />
                          <Icon name="settings" packOverride={pack.id} />
                          <Icon name="search" packOverride={pack.id} />
                          <Icon name="bell" packOverride={pack.id} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Import / Export */}
        <Card variant="elevated" className="slide-up app-settings-card">
          <h2 className="app-settings-section-title">{t('account.appearance.importExportTitle')}</h2>
          <p className="app-settings-section-desc">{t('account.appearance.importExportDescription')}</p>
          <div className="theme-import-export-row">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={!accountTheme && !activeTheme}>
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

      </div>
    </div>
  );
}

