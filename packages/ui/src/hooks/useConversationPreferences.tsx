/**
 * Conversation Preferences Hook
 *
 * Manages per-identity conversation preferences (archive, favorites)
 * with optimistic updates and server synchronisation.
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
  type ConversationPreferences,
  type ConversationPreferencesPatch,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useToast } from '../components/Toast';

type PreferencesMap = Record<string, ConversationPreferences>;

interface ConversationPreferencesContextValue {
  preferences: PreferencesMap;
  loading: boolean;

  toggleArchive: (
    conversationId: string,
    archived: boolean,
    keepArchived?: boolean,
  ) => Promise<void>;

  toggleFavorite: (
    conversationId: string,
    favorited: boolean,
  ) => Promise<void>;

  /**
   * Called when a new message arrives for a conversation.
   * Handles auto-un-archive logic:
   *   - DMs always un-archive
   *   - Groups un-archive only when keepArchived is false
   */
  handleNewMessage: (
    conversationId: string,
    conversationType: 'dm' | 'group',
  ) => void;
}

const ConversationPreferencesContext =
  createContext<ConversationPreferencesContextValue | null>(null);

interface ConversationPreferencesProviderProps {
  children: ReactNode;
}

export function ConversationPreferencesProvider({
  children,
}: ConversationPreferencesProviderProps) {
  const { status: identityStatus } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { t } = useTranslation();
  const toast = useToast();

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );

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

    api.conversations
      .listPreferences()
      .then((res) => {
        if (cancelled) return;
        if (res.data) {
          const map: PreferencesMap = {};
          for (const pref of res.data) {
            map[pref.conversationId] = pref;
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

  const applyOptimistic = useCallback(
    (conversationId: string, patch: ConversationPreferencesPatch) => {
      setPreferences((prev) => {
        const existing = prev[conversationId];
        return {
          ...prev,
          [conversationId]: {
            id: existing?.id ?? '',
            conversationId,
            archived: patch.archived ?? existing?.archived ?? false,
            keepArchived: patch.keepArchived ?? existing?.keepArchived ?? false,
            favorited: patch.favorited ?? existing?.favorited ?? false,
          },
        };
      });
    },
    [],
  );

  const toggleArchive = useCallback(
    async (
      conversationId: string,
      archived: boolean,
      keepArchived?: boolean,
    ) => {
      const prev = preferences[conversationId];
      const patch: ConversationPreferencesPatch = { archived };
      if (keepArchived !== undefined) patch.keepArchived = keepArchived;

      applyOptimistic(conversationId, patch);

      try {
        const res = await api.conversations.updatePreferences(
          conversationId,
          patch,
        );
        if (res.data) {
          setPreferences((p) => ({
            ...p,
            [conversationId]: res.data!,
          }));
        }
        toast.success(
          archived
            ? t('conversations.archiveToast')
            : t('conversations.unarchiveToast'),
        );
      } catch {
        if (prev) {
          setPreferences((p) => ({ ...p, [conversationId]: prev }));
        } else {
          setPreferences((p) => {
            const next = { ...p };
            delete next[conversationId];
            return next;
          });
        }
      }
    },
    [preferences, api, applyOptimistic, toast, t],
  );

  const toggleFavorite = useCallback(
    async (conversationId: string, favorited: boolean) => {
      const prev = preferences[conversationId];
      applyOptimistic(conversationId, { favorited });

      try {
        const res = await api.conversations.updatePreferences(
          conversationId,
          { favorited },
        );
        if (res.data) {
          setPreferences((p) => ({
            ...p,
            [conversationId]: res.data!,
          }));
        }
        toast.success(
          favorited
            ? t('conversations.favoriteAddedToast')
            : t('conversations.favoriteRemovedToast'),
        );
      } catch {
        if (prev) {
          setPreferences((p) => ({ ...p, [conversationId]: prev }));
        } else {
          setPreferences((p) => {
            const next = { ...p };
            delete next[conversationId];
            return next;
          });
        }
      }
    },
    [preferences, api, applyOptimistic, toast, t],
  );

  const handleNewMessage = useCallback(
    (conversationId: string, conversationType: 'dm' | 'group') => {
      const pref = preferences[conversationId];
      if (!pref?.archived) return;

      const shouldUnarchive =
        conversationType === 'dm' || !pref.keepArchived;

      if (shouldUnarchive) {
        applyOptimistic(conversationId, { archived: false });
        api.conversations
          .updatePreferences(conversationId, { archived: false })
          .then((res) => {
            if (res.data) {
              setPreferences((p) => ({
                ...p,
                [conversationId]: res.data!,
              }));
            }
          })
          .catch(() => {
            // Restore if sync fails; user can re-archive manually
          });
      }
    },
    [preferences, api, applyOptimistic],
  );

  const value = useMemo<ConversationPreferencesContextValue>(
    () => ({
      preferences,
      loading,
      toggleArchive,
      toggleFavorite,
      handleNewMessage,
    }),
    [preferences, loading, toggleArchive, toggleFavorite, handleNewMessage],
  );

  return (
    <ConversationPreferencesContext.Provider value={value}>
      {children}
    </ConversationPreferencesContext.Provider>
  );
}

export function useConversationPreferences(): ConversationPreferencesContextValue {
  const ctx = useContext(ConversationPreferencesContext);
  if (!ctx) {
    throw new Error(
      'useConversationPreferences must be used within a ConversationPreferencesProvider',
    );
  }
  return ctx;
}
