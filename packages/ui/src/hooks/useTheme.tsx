/**
 * Theme management hook and provider.
 *
 * ThemeProvider sits inside AuthProvider + IdentityProvider and manages
 * theme state at both the account and identity levels. On mount it reads
 * from the localStorage cache (the bootstrap script has already applied
 * CSS variables, so there is no flash). In the background it reconciles
 * with the server, and when identities change it applies per-identity
 * theme overrides.
 *
 * @module hooks/useTheme
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { ThemeDefinition } from '@adieuu/shared';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import { useIdentity } from './useIdentity';
import {
  getBuiltinThemeDefinition,
  BUILTIN_THEMES,
  DEFAULT_THEME_ID,
} from '../constants/builtinThemes';
import {
  getCachedActiveTheme,
  getCachedAccountTheme,
  getCachedIdentityTheme,
  setCachedAccountTheme,
  setCachedIdentityTheme,
  clearCachedIdentityTheme,
  applyThemeToDOM,
  clearThemeFromDOM,
} from '../utils/themeCache';

// ============================================================================
// Types
// ============================================================================

export interface ThemeContextValue {
  /** The currently active theme (identity override > account default > built-in) */
  activeTheme: ThemeDefinition | null;
  /** The account-level theme ID */
  accountThemeId: string | null;
  /** The identity-level theme ID (if an identity override is set) */
  identityThemeId: string | null;
  /** All available built-in themes */
  builtinThemes: typeof BUILTIN_THEMES;
  /** Set the account-level theme by ID or full definition */
  setAccountTheme: (themeOrId: string | ThemeDefinition) => Promise<void>;
  /** Set the identity-level theme override, or null to clear */
  setIdentityTheme: (themeOrId: string | ThemeDefinition | null) => Promise<void>;
  /** Apply a theme for live preview without persisting */
  previewTheme: (theme: ThemeDefinition) => void;
  /** Revert a live preview back to the persisted active theme */
  cancelPreview: () => void;
  /** Whether a live preview is currently active */
  isPreviewing: boolean;
  /** Save a custom theme to the user's account */
  saveCustomTheme: (theme: ThemeDefinition) => Promise<void>;
  /** Remove a custom theme from the user's account */
  removeCustomTheme: (themeId: string) => Promise<void>;
  /** User's saved custom themes */
  customThemes: ThemeDefinition[];
}

export interface ThemeProviderProps {
  children: ReactNode;
}

// ============================================================================
// Context
// ============================================================================

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Access theme state and methods. Must be used within a ThemeProvider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}

// ============================================================================
// Local storage keys for preferences (before server sync exists)
// ============================================================================

const LS_ACCOUNT_THEME_ID = 'adieuu.theme.accountId';
const LS_IDENTITY_THEME_PREFIX = 'adieuu.theme.identity.';
const LS_CUSTOM_THEMES = 'adieuu.theme.customThemes';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}
function lsRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

// ============================================================================
// Helpers
// ============================================================================

function resolveTheme(themeOrId: string | ThemeDefinition, customThemes: ThemeDefinition[]): ThemeDefinition | null {
  if (typeof themeOrId === 'object') return themeOrId;
  const builtin = getBuiltinThemeDefinition(themeOrId);
  if (builtin) return builtin;
  return customThemes.find((t) => t.id === themeOrId) ?? null;
}

function loadCustomThemes(): ThemeDefinition[] {
  const raw = lsGet(LS_CUSTOM_THEMES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================================
// Provider
// ============================================================================

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus } = useAuth();
  const { status: identityStatus, identity } = useIdentity();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [activeTheme, setActiveTheme] = useState<ThemeDefinition | null>(() => {
    return getCachedActiveTheme() ?? getBuiltinThemeDefinition(DEFAULT_THEME_ID) ?? null;
  });

  const [accountThemeId, setAccountThemeIdState] = useState<string | null>(() => {
    return lsGet(LS_ACCOUNT_THEME_ID) ?? DEFAULT_THEME_ID;
  });

  const [identityThemeId, setIdentityThemeIdState] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const prePreviewThemeRef = useRef<ThemeDefinition | null>(null);
  const [customThemes, setCustomThemes] = useState<ThemeDefinition[]>(loadCustomThemes);

  const applyAndCache = useCallback((theme: ThemeDefinition, level: 'account' | 'identity') => {
    applyThemeToDOM(theme.colors);
    setActiveTheme(theme);
    if (level === 'account') {
      setCachedAccountTheme(theme);
    } else {
      setCachedIdentityTheme(theme);
    }
  }, []);

  // ---- Account theme ----

  const setAccountTheme = useCallback(async (themeOrId: string | ThemeDefinition) => {
    const theme = resolveTheme(themeOrId, customThemes);
    if (!theme) return;

    const id = typeof themeOrId === 'string' ? themeOrId : themeOrId.id;
    setAccountThemeIdState(id);
    lsSet(LS_ACCOUNT_THEME_ID, id);

    if (!identityThemeId) {
      applyAndCache(theme, 'account');
    } else {
      setCachedAccountTheme(theme);
    }

    if (authStatus === 'authenticated') {
      try {
        await api.users.updatePreferences({ themeId: id });
      } catch {
        // Server sync failed; local state is still correct
      }
    }
  }, [api, applyAndCache, authStatus, customThemes, identityThemeId]);

  // ---- Identity theme ----

  const setIdentityTheme = useCallback(async (themeOrId: string | ThemeDefinition | null) => {
    if (themeOrId === null) {
      setIdentityThemeIdState(null);
      clearCachedIdentityTheme();
      if (identity?.id) {
        lsRemove(LS_IDENTITY_THEME_PREFIX + identity.id);
      }
      const account = getCachedAccountTheme() ?? getBuiltinThemeDefinition(accountThemeId ?? DEFAULT_THEME_ID);
      if (account) {
        applyThemeToDOM(account.colors);
        setActiveTheme(account);
      } else {
        clearThemeFromDOM();
        setActiveTheme(null);
      }
      return;
    }

    const theme = resolveTheme(themeOrId, customThemes);
    if (!theme) return;

    const id = typeof themeOrId === 'string' ? themeOrId : themeOrId.id;
    setIdentityThemeIdState(id);
    if (identity?.id) {
      lsSet(LS_IDENTITY_THEME_PREFIX + identity.id, id);
    }
    applyAndCache(theme, 'identity');
  }, [accountThemeId, applyAndCache, customThemes, identity]);

  // ---- Preview (for editor) ----

  const previewTheme = useCallback((theme: ThemeDefinition) => {
    if (!isPreviewing) {
      prePreviewThemeRef.current = activeTheme;
      setIsPreviewing(true);
    }
    applyThemeToDOM(theme.colors);
    setActiveTheme(theme);
  }, [activeTheme, isPreviewing]);

  const cancelPreview = useCallback(() => {
    if (!isPreviewing) return;
    setIsPreviewing(false);
    const restore = prePreviewThemeRef.current;
    if (restore) {
      applyThemeToDOM(restore.colors);
      setActiveTheme(restore);
    } else {
      clearThemeFromDOM();
      setActiveTheme(null);
    }
    prePreviewThemeRef.current = null;
  }, [isPreviewing]);

  // ---- Custom themes ----

  const persistCustomThemes = useCallback((themes: ThemeDefinition[]) => {
    setCustomThemes(themes);
    lsSet(LS_CUSTOM_THEMES, JSON.stringify(themes));
  }, []);

  const saveCustomTheme = useCallback(async (theme: ThemeDefinition) => {
    const existing = customThemes.findIndex((t) => t.id === theme.id);
    const updated = [...customThemes];
    if (existing >= 0) {
      updated[existing] = theme;
    } else {
      updated.push(theme);
    }
    persistCustomThemes(updated);

    if (authStatus === 'authenticated') {
      try {
        await api.users.updatePreferences({ customThemes: updated });
      } catch {
        // Local state is primary; server sync is best-effort
      }
    }
  }, [api, authStatus, customThemes, persistCustomThemes]);

  const removeCustomTheme = useCallback(async (themeId: string) => {
    const updated = customThemes.filter((t) => t.id !== themeId);
    persistCustomThemes(updated);

    if (authStatus === 'authenticated') {
      try {
        await api.users.updatePreferences({ customThemes: updated });
      } catch { /* noop */ }
    }
  }, [api, authStatus, customThemes, persistCustomThemes]);

  // ---- Sync with server on auth ----

  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let cancelled = false;
    (async () => {
      try {
        const resp = await api.users.getPreferences();
        if (cancelled || !resp.success || !resp.data) return;

        const serverThemeId = resp.data.themeId;
        if (serverThemeId && serverThemeId !== accountThemeId) {
          const serverCustoms = resp.data.customThemes ?? [];
          const theme = resolveTheme(serverThemeId, serverCustoms);
          if (theme) {
            setAccountThemeIdState(serverThemeId);
            lsSet(LS_ACCOUNT_THEME_ID, serverThemeId);
            if (!identityThemeId) {
              applyAndCache(theme, 'account');
            }
          }
        }

        if (resp.data.customThemes && resp.data.customThemes.length > 0) {
          persistCustomThemes(resp.data.customThemes);
        }
      } catch {
        // Server unreachable; use cached data
      }
    })();

    return () => { cancelled = true; };
    // Only run on auth status change, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // ---- Identity switch ----

  useEffect(() => {
    if (identityStatus === 'logged_in' && identity?.id) {
      const savedId = lsGet(LS_IDENTITY_THEME_PREFIX + identity.id);
      if (savedId) {
        const theme = resolveTheme(savedId, customThemes);
        if (theme) {
          setIdentityThemeIdState(savedId);
          applyAndCache(theme, 'identity');
          return;
        }
      }
      setIdentityThemeIdState(null);
    } else if (identityStatus === 'logged_out' || identityStatus === 'no_identity') {
      if (identityThemeId) {
        setIdentityThemeIdState(null);
        clearCachedIdentityTheme();
        const account = getCachedAccountTheme() ?? getBuiltinThemeDefinition(accountThemeId ?? DEFAULT_THEME_ID);
        if (account) {
          applyThemeToDOM(account.colors);
          setActiveTheme(account);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityStatus, identity?.id]);

  // ---- Context value ----

  const value = useMemo<ThemeContextValue>(() => ({
    activeTheme,
    accountThemeId,
    identityThemeId,
    builtinThemes: BUILTIN_THEMES,
    setAccountTheme,
    setIdentityTheme,
    previewTheme,
    cancelPreview,
    isPreviewing,
    saveCustomTheme,
    removeCustomTheme,
    customThemes,
  }), [
    activeTheme,
    accountThemeId,
    identityThemeId,
    setAccountTheme,
    setIdentityTheme,
    previewTheme,
    cancelPreview,
    isPreviewing,
    saveCustomTheme,
    removeCustomTheme,
    customThemes,
  ]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
