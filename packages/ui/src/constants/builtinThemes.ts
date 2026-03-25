/**
 * Built-in preset themes shipped with Adieuu.
 *
 * Each preset defines the full set of ThemeColorTokens. The "Midnight" preset
 * matches the current default :root values in styles.scss. The others provide
 * alternative palettes.
 *
 * @module constants/builtinThemes
 */

import type { ThemeDefinition, ThemeLabel } from '@adieuu/shared';

export interface BuiltinTheme {
  theme: ThemeDefinition;
  label: ThemeLabel;
  description: string;
}

export const BUILTIN_THEMES: readonly BuiltinTheme[] = [
  {
    label: 'official',
    description: 'The default dark theme with cyan/teal accents.',
    theme: {
      id: 'midnight',
      name: 'Midnight',
      description: 'The default dark theme with cyan/teal accents.',
      version: 1,
      colors: {
        bgPrimary: '#0d1117',
        bgSecondary: '#161b22',
        bgTertiary: '#21262d',
        bgElevated: '#1c2128',
        bgHover: 'rgba(56, 189, 248, 0.08)',
        bgActive: 'rgba(56, 189, 248, 0.12)',

        textPrimary: '#e6edf3',
        textSecondary: '#8b949e',
        textMuted: '#6e7681',
        textInverse: '#0d1117',

        accentPrimary: '#22d3ee',
        accentPrimaryHover: '#06b6d4',
        accentPrimaryActive: '#0891b2',
        accentSecondary: '#38bdf8',
        accentGlow: 'rgba(34, 211, 238, 0.15)',

        border: '#30363d',
        borderMuted: '#21262d',
        borderFocus: '#38bdf8',

        success: '#22c55e',
        successBg: 'rgba(34, 197, 94, 0.12)',
        warning: '#f59e0b',
        warningBg: 'rgba(245, 158, 11, 0.12)',
        error: '#ef4444',
        errorBg: 'rgba(239, 68, 68, 0.12)',
        info: '#38bdf8',
        infoBg: 'rgba(56, 189, 248, 0.12)',
        danger: '#ef4444',

        logoPrimary: '#22d3ee',
        logoSecondary: '#38bdf8',
      },
    },
  },
  {
    label: 'official',
    description: 'A clean light theme with blue accents.',
    theme: {
      id: 'daylight',
      name: 'Daylight',
      description: 'A clean light theme with blue accents.',
      version: 1,
      colors: {
        bgPrimary: '#ffffff',
        bgSecondary: '#f6f8fa',
        bgTertiary: '#eaeef2',
        bgElevated: '#ffffff',
        bgHover: 'rgba(59, 130, 246, 0.06)',
        bgActive: 'rgba(59, 130, 246, 0.10)',

        textPrimary: '#1f2328',
        textSecondary: '#656d76',
        textMuted: '#8b949e',
        textInverse: '#ffffff',

        accentPrimary: '#2563eb',
        accentPrimaryHover: '#1d4ed8',
        accentPrimaryActive: '#1e40af',
        accentSecondary: '#3b82f6',
        accentGlow: 'rgba(37, 99, 235, 0.12)',

        border: '#d0d7de',
        borderMuted: '#eaeef2',
        borderFocus: '#2563eb',

        success: '#16a34a',
        successBg: 'rgba(22, 163, 74, 0.08)',
        warning: '#d97706',
        warningBg: 'rgba(217, 119, 6, 0.08)',
        error: '#dc2626',
        errorBg: 'rgba(220, 38, 38, 0.08)',
        info: '#2563eb',
        infoBg: 'rgba(37, 99, 235, 0.08)',
        danger: '#dc2626',

        logoPrimary: '#2563eb',
        logoSecondary: '#3b82f6',
      },
    },
  },
  {
    label: 'official',
    description: 'A warm dark theme with amber and orange accents.',
    theme: {
      id: 'ember',
      name: 'Ember',
      description: 'A warm dark theme with amber and orange accents.',
      version: 1,
      colors: {
        bgPrimary: '#1a1210',
        bgSecondary: '#231a17',
        bgTertiary: '#2e2320',
        bgElevated: '#271e1b',
        bgHover: 'rgba(251, 146, 60, 0.08)',
        bgActive: 'rgba(251, 146, 60, 0.12)',

        textPrimary: '#f5e6d3',
        textSecondary: '#a89585',
        textMuted: '#7a6b5d',
        textInverse: '#1a1210',

        accentPrimary: '#f59e0b',
        accentPrimaryHover: '#d97706',
        accentPrimaryActive: '#b45309',
        accentSecondary: '#fb923c',
        accentGlow: 'rgba(245, 158, 11, 0.15)',

        border: '#3d3028',
        borderMuted: '#2e2320',
        borderFocus: '#f59e0b',

        success: '#22c55e',
        successBg: 'rgba(34, 197, 94, 0.12)',
        warning: '#fbbf24',
        warningBg: 'rgba(251, 191, 36, 0.12)',
        error: '#ef4444',
        errorBg: 'rgba(239, 68, 68, 0.12)',
        info: '#fb923c',
        infoBg: 'rgba(251, 146, 60, 0.12)',
        danger: '#ef4444',

        logoPrimary: '#f59e0b',
        logoSecondary: '#fb923c',
      },
    },
  },
  {
    label: 'official',
    description: 'A forest-inspired dark theme with green accents.',
    theme: {
      id: 'verdant',
      name: 'Verdant',
      description: 'A forest-inspired dark theme with green accents.',
      version: 1,
      colors: {
        bgPrimary: '#0f1512',
        bgSecondary: '#151d18',
        bgTertiary: '#1c2820',
        bgElevated: '#19221c',
        bgHover: 'rgba(34, 197, 94, 0.08)',
        bgActive: 'rgba(34, 197, 94, 0.12)',

        textPrimary: '#dce8e0',
        textSecondary: '#8b9e91',
        textMuted: '#657a6c',
        textInverse: '#0f1512',

        accentPrimary: '#22c55e',
        accentPrimaryHover: '#16a34a',
        accentPrimaryActive: '#15803d',
        accentSecondary: '#4ade80',
        accentGlow: 'rgba(34, 197, 94, 0.15)',

        border: '#2a3d30',
        borderMuted: '#1c2820',
        borderFocus: '#22c55e',

        success: '#4ade80',
        successBg: 'rgba(74, 222, 128, 0.12)',
        warning: '#facc15',
        warningBg: 'rgba(250, 204, 21, 0.12)',
        error: '#f87171',
        errorBg: 'rgba(248, 113, 113, 0.12)',
        info: '#34d399',
        infoBg: 'rgba(52, 211, 153, 0.12)',
        danger: '#f87171',

        logoPrimary: '#22c55e',
        logoSecondary: '#4ade80',
      },
    },
  },
  {
    label: 'official',
    description: 'A regal dark theme with deep purple and gold accents.',
    theme: {
      id: 'royal',
      name: 'Royal',
      description: 'A regal dark theme with deep purple and gold accents.',
      version: 1,
      colors: {
        bgPrimary: '#110e1a',
        bgSecondary: '#1a1525',
        bgTertiary: '#231d30',
        bgElevated: '#1e1829',
        bgHover: 'rgba(168, 85, 247, 0.08)',
        bgActive: 'rgba(168, 85, 247, 0.12)',

        textPrimary: '#e8e0f0',
        textSecondary: '#9b8fb0',
        textMuted: '#716788',
        textInverse: '#110e1a',

        accentPrimary: '#a855f7',
        accentPrimaryHover: '#9333ea',
        accentPrimaryActive: '#7e22ce',
        accentSecondary: '#c084fc',
        accentGlow: 'rgba(168, 85, 247, 0.15)',

        border: '#332b45',
        borderMuted: '#231d30',
        borderFocus: '#a855f7',

        success: '#22c55e',
        successBg: 'rgba(34, 197, 94, 0.12)',
        warning: '#eab308',
        warningBg: 'rgba(234, 179, 8, 0.12)',
        error: '#ef4444',
        errorBg: 'rgba(239, 68, 68, 0.12)',
        info: '#c084fc',
        infoBg: 'rgba(192, 132, 252, 0.12)',
        danger: '#ef4444',

        logoPrimary: '#a855f7',
        logoSecondary: '#c084fc',
      },
    },
  },
] as const;

export const DEFAULT_THEME_ID = 'midnight';

/**
 * Look up a built-in theme by its ID.
 */
export function getBuiltinTheme(id: string): BuiltinTheme | undefined {
  return BUILTIN_THEMES.find((t) => t.theme.id === id);
}

/**
 * Get the ThemeDefinition for a built-in theme by ID, or undefined if not found.
 */
export function getBuiltinThemeDefinition(id: string): ThemeDefinition | undefined {
  return getBuiltinTheme(id)?.theme;
}

/** Set of all built-in theme IDs for quick membership checks. */
export const BUILTIN_THEME_ID_SET = new Set(BUILTIN_THEMES.map((t) => t.theme.id));
