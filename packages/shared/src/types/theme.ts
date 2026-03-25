/**
 * Theme type definitions for the Adieuu theme customisation system.
 *
 * Themes are pure CSS custom property overrides. Each token in
 * ThemeColorTokens maps to a CSS variable defined in the design system
 * (:root in styles.scss). The mapping is handled by TOKEN_TO_CSS_VAR.
 *
 * @module types/theme
 */

/**
 * All user-editable colour tokens. Each key maps 1:1 to a CSS custom property.
 * Values must be valid CSS colour strings (hex, rgb, hsl, oklch).
 */
export interface ThemeColorTokens {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgElevated: string;
  bgHover: string;
  bgActive: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  accentPrimary: string;
  accentPrimaryHover: string;
  accentPrimaryActive: string;
  accentSecondary: string;
  accentGlow: string;

  border: string;
  borderMuted: string;
  borderFocus: string;

  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  error: string;
  errorBg: string;
  info: string;
  infoBg: string;
  danger: string;

  logoPrimary: string;
  logoSecondary: string;
}

/**
 * Mapping from camelCase token keys to CSS custom property names.
 * Kept as a const object so both runtime and type-level code can use it.
 */
export const TOKEN_TO_CSS_VAR: Readonly<Record<keyof ThemeColorTokens, string>> = {
  bgPrimary: '--color-bg-primary',
  bgSecondary: '--color-bg-secondary',
  bgTertiary: '--color-bg-tertiary',
  bgElevated: '--color-bg-elevated',
  bgHover: '--color-bg-hover',
  bgActive: '--color-bg-active',

  textPrimary: '--color-text-primary',
  textSecondary: '--color-text-secondary',
  textMuted: '--color-text-muted',
  textInverse: '--color-text-inverse',

  accentPrimary: '--color-accent-primary',
  accentPrimaryHover: '--color-accent-primary-hover',
  accentPrimaryActive: '--color-accent-primary-active',
  accentSecondary: '--color-accent-secondary',
  accentGlow: '--color-accent-glow',

  border: '--color-border',
  borderMuted: '--color-border-muted',
  borderFocus: '--color-border-focus',

  success: '--color-success',
  successBg: '--color-success-bg',
  warning: '--color-warning',
  warningBg: '--color-warning-bg',
  error: '--color-error',
  errorBg: '--color-error-bg',
  info: '--color-info',
  infoBg: '--color-info-bg',
  danger: '--color-danger',

  logoPrimary: '--logo-primary',
  logoSecondary: '--logo-secondary',
} as const;

/** All valid token keys (typed array for iteration). */
export const THEME_TOKEN_KEYS = Object.keys(TOKEN_TO_CSS_VAR) as (keyof ThemeColorTokens)[];

/**
 * A complete theme definition: metadata + colour tokens.
 */
export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  version: number;
  colors: ThemeColorTokens;
}

/** Labels that can be applied to a theme for provenance. */
export type ThemeLabel = 'official' | 'community';

/**
 * Metadata about a theme, used in listings and galleries.
 * Does not include the full colour tokens.
 */
export interface ThemeMeta {
  id: string;
  name: string;
  description: string;
  label: ThemeLabel;
  authorIdentityId?: string;
  authorUsername?: string;
  downloads?: number;
  tags?: string[];
  createdAt: string;
}

/**
 * A community theme as returned by the API (metadata + full definition).
 */
export interface CommunityTheme extends ThemeMeta {
  theme: ThemeDefinition;
}

/**
 * User preferences stored server-side at the account level.
 */
export interface UserThemePreferences {
  themeId?: string;
  customThemes?: ThemeDefinition[];
}
