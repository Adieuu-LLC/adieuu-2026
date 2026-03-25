/**
 * Theme cache layer backed by localStorage.
 *
 * Provides synchronous read/write of the active theme so it can be applied
 * before React mounts, eliminating colour flashes. The bootstrap script in
 * each app's index.html reads CACHE_KEY_ACTIVE and applies its colours
 * before the first paint.
 *
 * Cache keys:
 * - adieuu.theme.account  - resolved ThemeDefinition for the account default
 * - adieuu.theme.identity - resolved ThemeDefinition for the active identity override
 * - adieuu.theme.active   - the currently-applied theme (identity if set, else account)
 *
 * @module utils/themeCache
 */

import { TOKEN_TO_CSS_VAR, THEME_TOKEN_KEYS, type ThemeDefinition, type ThemeColorTokens } from '@adieuu/shared';

export const CACHE_KEY_ACCOUNT = 'adieuu.theme.account';
export const CACHE_KEY_IDENTITY = 'adieuu.theme.identity';
export const CACHE_KEY_ACTIVE = 'adieuu.theme.active';

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or unavailable -- silently degrade
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function parseTheme(raw: string | null): ThemeDefinition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.colors) {
      return parsed as ThemeDefinition;
    }
  } catch {
    // Corrupted cache entry
  }
  return null;
}

export function getCachedAccountTheme(): ThemeDefinition | null {
  return parseTheme(safeGetItem(CACHE_KEY_ACCOUNT));
}

export function getCachedIdentityTheme(): ThemeDefinition | null {
  return parseTheme(safeGetItem(CACHE_KEY_IDENTITY));
}

export function getCachedActiveTheme(): ThemeDefinition | null {
  return parseTheme(safeGetItem(CACHE_KEY_ACTIVE));
}

export function setCachedAccountTheme(theme: ThemeDefinition): void {
  const json = JSON.stringify(theme);
  safeSetItem(CACHE_KEY_ACCOUNT, json);
  if (!getCachedIdentityTheme()) {
    safeSetItem(CACHE_KEY_ACTIVE, json);
  }
}

export function setCachedIdentityTheme(theme: ThemeDefinition): void {
  const json = JSON.stringify(theme);
  safeSetItem(CACHE_KEY_IDENTITY, json);
  safeSetItem(CACHE_KEY_ACTIVE, json);
}

export function clearCachedIdentityTheme(): void {
  safeRemoveItem(CACHE_KEY_IDENTITY);
  const account = safeGetItem(CACHE_KEY_ACCOUNT);
  if (account) {
    safeSetItem(CACHE_KEY_ACTIVE, account);
  } else {
    safeRemoveItem(CACHE_KEY_ACTIVE);
  }
}

export function clearAllThemeCache(): void {
  safeRemoveItem(CACHE_KEY_ACCOUNT);
  safeRemoveItem(CACHE_KEY_IDENTITY);
  safeRemoveItem(CACHE_KEY_ACTIVE);
}

/**
 * Apply a theme's colour tokens to the document root element.
 * Sets each CSS custom property via setProperty.
 */
export function applyThemeToDOM(colors: ThemeColorTokens): void {
  const root = document.documentElement;
  for (const key of THEME_TOKEN_KEYS) {
    const cssVar = TOKEN_TO_CSS_VAR[key];
    const value = colors[key];
    if (value) {
      root.style.setProperty(cssVar, value);
    }
  }
}

/**
 * Remove all theme overrides from the document root element,
 * allowing the SCSS :root defaults to reassert.
 */
export function clearThemeFromDOM(): void {
  const root = document.documentElement;
  for (const key of THEME_TOKEN_KEYS) {
    root.style.removeProperty(TOKEN_TO_CSS_VAR[key]);
  }
}
