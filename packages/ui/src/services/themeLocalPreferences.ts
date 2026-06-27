import type { ThemeDefinition } from '@adieuu/shared';

export const LS_ACCOUNT_THEME_ID = 'adieuu.theme.accountId';
export const LS_IDENTITY_THEME_PREFIX = 'adieuu.theme.identity.';
export const LS_CUSTOM_THEMES = 'adieuu.theme.customThemes';

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // noop
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // noop
  }
}

export function loadCustomThemes(): ThemeDefinition[] {
  const raw = lsGet(LS_CUSTOM_THEMES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
