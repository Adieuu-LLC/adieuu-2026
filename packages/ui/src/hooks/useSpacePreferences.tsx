/**
 * Space Preferences Hook
 *
 * Manages per-identity Space preferences (favorites) with optimistic
 * updates and server synchronisation.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import {
  createApiClient,
  type SpacePreferences,
  type SpacePreferencesPatch,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useToast } from '../components/Toast';

type PreferencesMap = Record<string, SpacePreferences>;

interface SpacePreferencesContextValue {
  preferences: PreferencesMap;
  loading: boolean;
  toggleFavorite: (spaceId: string, favorited: boolean) => Promise<void>;
}

const SpacePreferencesContext = createContext<SpacePreferencesContextValue | null>(null);

interface SpacePreferencesProviderProps {
  children: ReactNode;
}

export function SpacePreferencesProvider({ children }: SpacePreferencesProviderProps) {
  const { status: identityStatus } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { t } = useTranslation();
  const toast = useToast();

  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const isLoggedIn = identityStatus === 'logged_in';

  const [preferences, setPreferences] = useState<PreferencesMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setPreferences({});
      return;
    }

    let cancelled = false;
    setLoading(true);

    api.spaces
      .listPreferences()
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          const map: PreferencesMap = {};
          for (const pref of res.data) {
            map[pref.spaceId] = pref;
          }
          setPreferences(map);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, api]);

  const applyOptimistic = useCallback((spaceId: string, patch: SpacePreferencesPatch) => {
    setPreferences((prev) => {
      const existing = prev[spaceId];
      return {
        ...prev,
        [spaceId]: {
          id: existing?.id ?? '',
          spaceId,
          favorited: patch.favorited ?? existing?.favorited ?? false,
        },
      };
    });
  }, []);

  const toggleFavorite = useCallback(
    async (spaceId: string, favorited: boolean) => {
      const prev = preferences[spaceId];
      applyOptimistic(spaceId, { favorited });

      try {
        const res = await api.spaces.updatePreferences(spaceId, { favorited });
        if (res.data) {
          setPreferences((p) => ({
            ...p,
            [spaceId]: res.data!,
          }));
        }
        toast.success(
          favorited
            ? t('spaces.favoriteAddedToast', 'Added to Favourites')
            : t('spaces.favoriteRemovedToast', 'Removed from Favourites'),
        );
      } catch {
        if (prev) {
          setPreferences((p) => ({ ...p, [spaceId]: prev }));
        } else {
          setPreferences((p) => {
            const next = { ...p };
            delete next[spaceId];
            return next;
          });
        }
      }
    },
    [preferences, api, applyOptimistic, toast, t],
  );

  const value = useMemo<SpacePreferencesContextValue>(
    () => ({
      preferences,
      loading,
      toggleFavorite,
    }),
    [preferences, loading, toggleFavorite],
  );

  return (
    <SpacePreferencesContext.Provider value={value}>{children}</SpacePreferencesContext.Provider>
  );
}

export function useSpacePreferences(): SpacePreferencesContextValue {
  const ctx = useContext(SpacePreferencesContext);
  if (!ctx) {
    throw new Error('useSpacePreferences must be used within a SpacePreferencesProvider');
  }
  return ctx;
}
