import { useMemo } from 'react';
import type { ConversationFolder, ConversationPreferences, PublicSpace } from '@adieuu/shared';
import type { DecryptedConversation } from '../../hooks/useConversations';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';
import type { SortMode, TypeFilter } from './conversationSidebarTypes';
import type { SidebarListView } from './sidebarListView';
import { showConversationsInList, showSpacesInList } from './sidebarListView';

export interface ConversationSidebarListItem {
  conversation: DecryptedConversation;
  displayName: string;
  pref: ConversationPreferences | undefined;
}

export interface SpaceSidebarListItem {
  space: PublicSpace;
  displayName: string;
}

export interface UseConversationSidebarListParams {
  conversations: DecryptedConversation[];
  spaces: PublicSpace[];
  resolveSpaceDisplayName: (space: PublicSpace) => string;
  identityId: string | undefined;
  participantProfiles: Record<string, { displayName?: string; username?: string }>;
  preferences: Record<string, ConversationPreferences | undefined>;
  typeFilter: TypeFilter;
  sortMode: SortMode;
  showArchived: boolean;
  folderedConversationIds: Set<string>;
  folderedSpaceIds: Set<string>;
  folders: ConversationFolder[];
  listView: SidebarListView;
}

export interface UseConversationSidebarListResult {
  isFiltered: boolean;
  favoritesList: ConversationSidebarListItem[];
  mainList: ConversationSidebarListItem[];
  spaceList: SpaceSidebarListItem[];
  favoritedFolders: ConversationFolder[];
  mainFolders: ConversationFolder[];
}

/**
 * Derives filtered/sorted conversation, space, and folder lists for the sidebar,
 * excluding items already in a folder. Folders always appear when they have members.
 */
export function useConversationSidebarList(
  params: UseConversationSidebarListParams,
): UseConversationSidebarListResult {
  const {
    conversations,
    spaces,
    resolveSpaceDisplayName,
    identityId,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    folderedConversationIds,
    folderedSpaceIds,
    folders,
    listView,
  } = params;

  const isFiltered = typeFilter !== 'all' || sortMode !== 'recent' || showArchived;

  const { favoritesList, mainList, spaceList, favoritedFolders, mainFolders } = useMemo(() => {
    const includeConversations = showConversationsInList(listView);
    const includeSpaces = showSpacesInList(listView);

    const withNames = includeConversations
      ? conversations
          .filter((c) => !folderedConversationIds.has(c.id))
          .map((c) => ({
            conversation: c,
            displayName: resolveConversationDisplayName(
              c,
              identityId,
              participantProfiles,
            ),
            pref: preferences[c.id],
          }))
      : [];

    // Apply type filter (conversations only)
    let filtered = withNames;
    if (typeFilter === 'dm') {
      filtered = filtered.filter((x) => x.conversation.type === 'dm');
    } else if (typeFilter === 'group') {
      filtered = filtered.filter((x) => x.conversation.type === 'group');
    }

    // Apply archive filter (conversations only)
    if (!showArchived) {
      filtered = filtered.filter((x) => !x.pref?.archived);
    }

    // Sort conversations
    if (sortMode === 'alpha') {
      filtered.sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );
    }

    let spaceItems: SpaceSidebarListItem[] = includeSpaces
      ? spaces
          .filter((s) => !folderedSpaceIds.has(s.id))
          .map((space) => ({
            space,
            displayName: resolveSpaceDisplayName(space),
          }))
      : [];

    if (sortMode === 'alpha') {
      spaceItems = [...spaceItems].sort((a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: 'base',
        }),
      );
    }

    // Always show folders that have any membership
    const visibleFolders = folders.filter(
      (f) => f.conversationIds.length > 0 || f.spaceIds.length > 0,
    );
    const favFolders = visibleFolders.filter((f) => f.favorited);
    const restFolders = visibleFolders.filter((f) => !f.favorited);

    // Split conversations into favorites and the rest (only when no active filters)
    if (!isFiltered && includeConversations) {
      const favs = filtered.filter((x) => x.pref?.favorited);
      const rest = filtered.filter((x) => !x.pref?.favorited);
      return {
        favoritesList: favs,
        mainList: rest,
        spaceList: spaceItems,
        favoritedFolders: favFolders,
        mainFolders: restFolders,
      };
    }

    return {
      favoritesList: [],
      mainList: filtered,
      spaceList: spaceItems,
      favoritedFolders: isFiltered ? [] : favFolders,
      mainFolders: isFiltered ? visibleFolders : restFolders,
    };
  }, [
    conversations,
    spaces,
    resolveSpaceDisplayName,
    identityId,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    isFiltered,
    folderedConversationIds,
    folderedSpaceIds,
    folders,
    listView,
  ]);

  return { isFiltered, favoritesList, mainList, spaceList, favoritedFolders, mainFolders };
}
