import { useMemo } from 'react';
import type { ConversationFolder, ConversationPreferences } from '@adieuu/shared';
import type { DecryptedConversation } from '../../hooks/useConversations';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';
import type { SortMode, TypeFilter } from './conversationSidebarTypes';

export interface ConversationSidebarListItem {
  conversation: DecryptedConversation;
  displayName: string;
  pref: ConversationPreferences | undefined;
}

export interface UseConversationSidebarListParams {
  conversations: DecryptedConversation[];
  identityId: string | undefined;
  participantProfiles: Record<string, { displayName?: string; username?: string }>;
  preferences: Record<string, ConversationPreferences | undefined>;
  typeFilter: TypeFilter;
  sortMode: SortMode;
  showArchived: boolean;
  folderedConversationIds: Set<string>;
  folders: ConversationFolder[];
}

export interface UseConversationSidebarListResult {
  isFiltered: boolean;
  favoritesList: ConversationSidebarListItem[];
  mainList: ConversationSidebarListItem[];
  favoritedFolders: ConversationFolder[];
  mainFolders: ConversationFolder[];
}

/**
 * Derives filtered/sorted conversation and folder lists for the sidebar,
 * excluding conversations already in a folder.
 */
export function useConversationSidebarList(
  params: UseConversationSidebarListParams,
): UseConversationSidebarListResult {
  const {
    conversations,
    identityId,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    folderedConversationIds,
    folders,
  } = params;

  const isFiltered = typeFilter !== 'all' || sortMode !== 'recent' || showArchived;

  const { favoritesList, mainList, favoritedFolders, mainFolders } = useMemo(() => {
    const withNames = conversations
      .filter((c) => !folderedConversationIds.has(c.id))
      .map((c) => ({
        conversation: c,
        displayName: resolveConversationDisplayName(
          c,
          identityId,
          participantProfiles,
        ),
        pref: preferences[c.id],
      }));

    // Apply type filter
    let filtered = withNames;
    if (typeFilter === 'dm') {
      filtered = filtered.filter((x) => x.conversation.type === 'dm');
    } else if (typeFilter === 'group') {
      filtered = filtered.filter((x) => x.conversation.type === 'group');
    }

    // Apply archive filter
    if (!showArchived) {
      filtered = filtered.filter((x) => !x.pref?.archived);
    }

    // Sort
    if (sortMode === 'alpha') {
      filtered.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );
    }

    // Split folders into favorited/main
    const favFolders = folders.filter((f) => f.favorited);
    const restFolders = folders.filter((f) => !f.favorited);

    // Split conversations into favorites and the rest (only when no active filters)
    if (!isFiltered) {
      const favs = filtered.filter((x) => x.pref?.favorited);
      const rest = filtered.filter((x) => !x.pref?.favorited);
      return {
        favoritesList: favs,
        mainList: rest,
        favoritedFolders: favFolders,
        mainFolders: restFolders,
      };
    }

    return {
      favoritesList: [],
      mainList: filtered,
      favoritedFolders: [],
      mainFolders: typeFilter === 'all' ? folders : [],
    };
  }, [
    conversations,
    identityId,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    isFiltered,
    folderedConversationIds,
    folders,
  ]);

  return { isFiltered, favoritesList, mainList, favoritedFolders, mainFolders };
}
