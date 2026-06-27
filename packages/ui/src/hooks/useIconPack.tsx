/**
 * Icon-pack preference hook and provider.
 *
 * Follows the same localStorage + server-sync pattern used by ThemeProvider.
 * The selected pack ID is persisted locally for instant restore and synced
 * to the server when the user is authenticated.
 *
 * @module hooks/useIconPack
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createApiClient } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useAuth } from './useAuth';
import { DEFAULT_ICON_PACK_ID, ICON_PACKS } from '../icons/packs';
import type { IconPackId } from '../icons/packs';

// ============================================================================
// Types
// ============================================================================

export interface IconPackContextValue {
  packId: IconPackId;
  setIconPack: (id: IconPackId) => Promise<void>;
}

export interface IconPackProviderProps {
  children: ReactNode;
}

// ============================================================================
// Context
// ============================================================================

const IconPackContext = createContext<IconPackContextValue | null>(null);

export function useIconPack(): IconPackContextValue {
  const ctx = useContext(IconPackContext);
  if (!ctx) {
    throw new Error('useIconPack must be used within an IconPackProvider');
  }
  return ctx;
}

// ============================================================================
// localStorage helpers
// ============================================================================

const LS_ICON_PACK = 'adieuu.iconPack';

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}

function isValidPackId(id: string): id is IconPackId {
  return ICON_PACKS.some((p) => p.id === id);
}

// ============================================================================
// Provider
// ============================================================================

export function IconPackProvider({ children }: IconPackProviderProps) {
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus } = useAuth();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const [packId, setPackIdState] = useState<IconPackId>(() => {
    const stored = lsGet(LS_ICON_PACK);
    if (stored && isValidPackId(stored)) return stored;
    return DEFAULT_ICON_PACK_ID;
  });

  const setIconPack = useCallback(async (id: IconPackId) => {
    if (!isValidPackId(id)) return;

    setPackIdState(id);
    lsSet(LS_ICON_PACK, id);

    if (authStatus === 'authenticated') {
      try {
        await api.users.updatePreferences({ iconPackId: id });
      } catch {
        // Server sync failed; local state is still correct
      }
    }
  }, [api, authStatus]);

  // NOTE: No server `getPreferences` sync here. Only a single icon pack ships
  // today, so the persisted `iconPackId` can never resolve to anything other
  // than the default — fetching it would be a redundant request (the theme
  // sync in useTheme already pulls user preferences once on auth).

  const value = useMemo<IconPackContextValue>(() => ({
    packId,
    setIconPack,
  }), [packId, setIconPack]);

  return (
    <IconPackContext.Provider value={value}>
      {children}
    </IconPackContext.Provider>
  );
}
