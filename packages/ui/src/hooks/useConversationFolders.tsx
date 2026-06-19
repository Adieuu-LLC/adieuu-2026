/**
 * Conversation Folders Hook
 *
 * Manages per-identity conversation folders with optimistic updates
 * and server synchronisation.
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
  type ConversationFolder,
  type CreateConversationFolderParams,
  type UpdateConversationFolderParams,
} from '@adieuu/shared';
import { useTranslation } from 'react-i18next';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useToast } from '../components/Toast';

interface ConversationFoldersContextValue {
  folders: ConversationFolder[];
  loading: boolean;

  createFolder: (params: CreateConversationFolderParams) => Promise<ConversationFolder | null>;
  updateFolder: (folderId: string, params: UpdateConversationFolderParams) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  addConversationToFolder: (folderId: string, conversationId: string) => Promise<void>;
  removeConversationFromFolder: (folderId: string, conversationId: string) => Promise<void>;
  toggleFolderFavorite: (folderId: string, favorited: boolean) => Promise<void>;

  /** Returns the folder that contains this conversation, or undefined. */
  getFolderForConversation: (conversationId: string) => ConversationFolder | undefined;

  /** Set of all conversation IDs that belong to any folder. */
  folderedConversationIds: Set<string>;
}

const ConversationFoldersContext =
  createContext<ConversationFoldersContextValue | null>(null);

export function ConversationFoldersProvider({ children }: { children: ReactNode }) {
  const { status: identityStatus } = useIdentity();
  const { apiBaseUrl } = useAppConfig();
  const { t } = useTranslation();
  const toast = useToast();

  const api = useMemo(
    () => createApiClient({ baseUrl: apiBaseUrl }),
    [apiBaseUrl],
  );

  const isLoggedIn = identityStatus === 'logged_in';

  const [folders, setFolders] = useState<ConversationFolder[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setFolders([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    api.conversationFolders
      .list()
      .then((res) => {
        if (cancelled) return;
        if (res.data) setFolders(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, api]);

  const folderedConversationIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of folders) {
      for (const cid of f.conversationIds) ids.add(cid);
    }
    return ids;
  }, [folders]);

  const getFolderForConversation = useCallback(
    (conversationId: string): ConversationFolder | undefined => {
      return folders.find((f) => f.conversationIds.includes(conversationId));
    },
    [folders],
  );

  const createFolder = useCallback(
    async (params: CreateConversationFolderParams): Promise<ConversationFolder | null> => {
      try {
        const res = await api.conversationFolders.create(params);
        if (res.data) {
          setFolders((prev) => [...prev, res.data!]);
          toast.success(t('conversations.folders.folderCreatedToast'));
          return res.data;
        }
      } catch {
        // silent
      }
      return null;
    },
    [api, toast, t],
  );

  const updateFolder = useCallback(
    async (folderId: string, params: UpdateConversationFolderParams) => {
      const prev = folders.find((f) => f.id === folderId);
      if (!prev) return;

      // Optimistic update
      setFolders((list) =>
        list.map((f) =>
          f.id === folderId
            ? {
                ...f,
                ...(params.name !== undefined ? { name: params.name } : {}),
                ...(params.iconType !== undefined ? { iconType: params.iconType } : {}),
                ...(params.iconName !== undefined ? { iconName: params.iconName } : {}),
                ...(params.iconColor !== undefined
                  ? { iconColor: params.iconColor ?? undefined }
                  : {}),
                ...(params.favorited !== undefined ? { favorited: params.favorited } : {}),
              }
            : f,
        ),
      );

      try {
        const res = await api.conversationFolders.update(folderId, params);
        if (res.data) {
          setFolders((list) =>
            list.map((f) => (f.id === folderId ? res.data! : f)),
          );
        }
        toast.success(t('conversations.folders.folderUpdatedToast'));
      } catch {
        setFolders((list) =>
          list.map((f) => (f.id === folderId ? prev : f)),
        );
      }
    },
    [folders, api, toast, t],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const prev = folders;
      setFolders((list) => list.filter((f) => f.id !== folderId));

      try {
        await api.conversationFolders.delete(folderId);
        toast.success(t('conversations.folders.folderDeletedToast'));
      } catch {
        setFolders(prev);
      }
    },
    [folders, api, toast, t],
  );

  const addConversationToFolder = useCallback(
    async (folderId: string, conversationId: string) => {
      // Optimistic
      setFolders((list) =>
        list.map((f) =>
          f.id === folderId && !f.conversationIds.includes(conversationId)
            ? { ...f, conversationIds: [...f.conversationIds, conversationId] }
            : f,
        ),
      );

      try {
        const res = await api.conversationFolders.addConversation(folderId, conversationId);
        if (res.data) {
          setFolders((list) =>
            list.map((f) => (f.id === folderId ? res.data! : f)),
          );
        }
      } catch {
        setFolders((list) =>
          list.map((f) =>
            f.id === folderId
              ? { ...f, conversationIds: f.conversationIds.filter((id) => id !== conversationId) }
              : f,
          ),
        );
      }
    },
    [api],
  );

  const removeConversationFromFolder = useCallback(
    async (folderId: string, conversationId: string) => {
      const prevFolder = folders.find((f) => f.id === folderId);
      if (!prevFolder) return;

      setFolders((list) =>
        list.map((f) =>
          f.id === folderId
            ? { ...f, conversationIds: f.conversationIds.filter((id) => id !== conversationId) }
            : f,
        ),
      );

      try {
        const res = await api.conversationFolders.removeConversation(folderId, conversationId);
        if (res.data) {
          setFolders((list) =>
            list.map((f) => (f.id === folderId ? res.data! : f)),
          );
        }
      } catch {
        setFolders((list) =>
          list.map((f) => (f.id === folderId ? prevFolder : f)),
        );
      }
    },
    [folders, api],
  );

  const toggleFolderFavorite = useCallback(
    async (folderId: string, favorited: boolean) => {
      const prev = folders.find((f) => f.id === folderId);
      if (!prev) return;

      setFolders((list) =>
        list.map((f) => (f.id === folderId ? { ...f, favorited } : f)),
      );

      try {
        const res = await api.conversationFolders.update(folderId, { favorited });
        if (res.data) {
          setFolders((list) =>
            list.map((f) => (f.id === folderId ? res.data! : f)),
          );
        }
        toast.success(
          favorited
            ? t('conversations.folders.favoriteAddedToast')
            : t('conversations.folders.favoriteRemovedToast'),
        );
      } catch {
        setFolders((list) =>
          list.map((f) => (f.id === folderId ? prev : f)),
        );
      }
    },
    [folders, api, toast, t],
  );

  const value = useMemo<ConversationFoldersContextValue>(
    () => ({
      folders,
      loading,
      createFolder,
      updateFolder,
      deleteFolder,
      addConversationToFolder,
      removeConversationFromFolder,
      toggleFolderFavorite,
      getFolderForConversation,
      folderedConversationIds,
    }),
    [
      folders,
      loading,
      createFolder,
      updateFolder,
      deleteFolder,
      addConversationToFolder,
      removeConversationFromFolder,
      toggleFolderFavorite,
      getFolderForConversation,
      folderedConversationIds,
    ],
  );

  return (
    <ConversationFoldersContext.Provider value={value}>
      {children}
    </ConversationFoldersContext.Provider>
  );
}

export function useConversationFolders(): ConversationFoldersContextValue {
  const ctx = useContext(ConversationFoldersContext);
  if (!ctx) {
    throw new Error(
      'useConversationFolders must be used within a ConversationFoldersProvider',
    );
  }
  return ctx;
}
