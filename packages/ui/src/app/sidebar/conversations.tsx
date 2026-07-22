/**
 * Conversations sidebar section — composition root.
 *
 * Three views (Conversations / Spaces / All) share folders, filters, and DnD.
 * Presentational rows and list hooks live in sibling modules.
 * Public API: {@link SidebarLogo}, {@link ConversationsSidebarSection}.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  createApiClient,
  type ConversationFolder,
  type FolderIconName,
  type FolderIconType,
} from '@adieuu/shared';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { SidebarTabs, type SidebarTab } from '../../components/SidebarTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FolderEditModal } from '../../components/FolderEditModal';
import { Icon } from '../../icons/Icon';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useConversations } from '../../hooks/useConversations';
import { useConversationPreferences } from '../../hooks/useConversationPreferences';
import { useSpacePreferences } from '../../hooks/useSpacePreferences';
import { useConversationFolders } from '../../hooks/useConversationFolders';
import { useIdentity } from '../../hooks/useIdentity';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useCallSession } from '../../hooks/useCallSession';
import { ChatInvitationsSidebarButton } from './invitations';
import {
  DiscoverSpacesSidebarItem,
  SpaceListItem,
  useSpaceSidebarDisplayName,
  getLastChannelId,
} from './spaces';
import { useSpaces } from '../../hooks/useSpaces';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';
import type { SortMode, TypeFilter } from './conversationSidebarTypes';
import { ConversationFilterPopover } from './ConversationFilterPopover';
import { ConversationListItem } from './ConversationListItem';
import { FolderListItem } from './FolderListItem';
import { DraggableConversation, DroppableTarget } from './conversationSidebarDnd';
import { useConversationSidebarBadge } from './useConversationSidebarBadge';
import { useConversationSidebarList } from './useConversationSidebarList';
import {
  useSidebarListView,
  isConversationMutedInView,
  isSpaceMutedInView,
  showConversationsInList,
  showSpacesInList,
  type SidebarListView,
} from './sidebarListView';
import {
  useSidebarFolderDnd,
  folderableDndId,
} from './useSidebarFolderDnd';

export { SidebarLogo } from './sidebarLogo';

export function ConversationsSidebarSection({
  isChatInvitesPanelOpen,
  onToggleChatInvitesPanel,
  onOpenFolder,
}: {
  isChatInvitesPanelOpen: boolean;
  onToggleChatInvitesPanel: () => void;
  onOpenFolder?: (folderId: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const {
    conversations,
    loading,
    leaveGroup,
    participantProfiles,
    activeConversationId,
    setActiveConversation,
  } = useConversations();
  const { preferences, toggleArchive, toggleFavorite } = useConversationPreferences();
  const {
    preferences: spacePreferences,
    toggleFavorite: toggleSpaceFavorite,
  } = useSpacePreferences();
  const {
    folders,
    folderedConversationIds,
    folderedSpaceIds,
    createFolder,
    deleteFolder,
    updateFolder,
    addConversationToFolder,
    addSpaceToFolder,
    toggleFolderFavorite,
  } = useConversationFolders();
  const { identity, status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in' && !!identity;
  const { activeCallConversationIds } = useGlobalCallEvents();
  const { activeSession } = useCallSession();
  const { closeMobile } = useSidebar();
  const { listView, setListView } = useSidebarListView();

  const selfId = identity?.id;

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  // Leave dialog state (group conversations)
  const [leaveTargetId, setLeaveTargetId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Leave dialog state (spaces)
  const [leaveSpaceTargetId, setLeaveSpaceTargetId] = useState<string | null>(null);
  const [leavingSpace, setLeavingSpace] = useState(false);

  // Folder edit modal state
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const editFolder = editFolderId
    ? folders.find((f) => f.id === editFolderId) ?? null
    : null;

  const { spaces, spacesLoading, unreadBySpace, markSpaceRead, removeSpaceLocally } = useSpaces();
  const resolveSpaceDisplayName = useSpaceSidebarDisplayName();
  const { totalUnread, totalSpacesUnread } = useConversationSidebarBadge(
    conversations,
    unreadBySpace,
  );

  const {
    favoritesList,
    mainList,
    favoriteSpaceList,
    spaceList,
    favoritedFolders,
    mainFolders,
  } = useConversationSidebarList({
    conversations,
    spaces,
    resolveSpaceDisplayName,
    identityId: identity?.id,
    participantProfiles,
    preferences,
    spacePreferences,
    typeFilter,
    sortMode,
    showArchived,
    folderedConversationIds,
    folderedSpaceIds,
    folders,
    listView,
  });

  const tabs: SidebarTab[] = [
    {
      id: 'conversations',
      icon: <Icon name="message" />,
      label: t('sidebar.conversationsTab', 'Conversations'),
      badge: totalUnread > 0 ? totalUnread : undefined,
    },
    {
      id: 'spaces',
      icon: <Icon name="spaces" />,
      label: t('sidebar.spacesTab', 'Spaces'),
      badge: totalSpacesUnread > 0 ? totalSpacesUnread : undefined,
      iconPosition: 'end',
    },
    {
      id: 'all',
      icon: <Icon name="swap" />,
      label: t('sidebar.allTab', 'All'),
    },
  ];

  const handleNewConversation = () => {
    navigate('/conversations/new');
    closeMobile();
  };

  const handleLeaveRequest = useCallback((conversationId: string) => {
    setLeaveTargetId(conversationId);
  }, []);

  // Stable callback identities for the memoized rows.
  const setActiveConversationRef = useRef(setActiveConversation);
  setActiveConversationRef.current = setActiveConversation;
  const closeMobileRef = useRef(closeMobile);
  closeMobileRef.current = closeMobile;
  const toggleArchiveRef = useRef(toggleArchive);
  toggleArchiveRef.current = toggleArchive;
  const toggleFavoriteRef = useRef(toggleFavorite);
  toggleFavoriteRef.current = toggleFavorite;
  const toggleSpaceFavoriteRef = useRef(toggleSpaceFavorite);
  toggleSpaceFavoriteRef.current = toggleSpaceFavorite;
  const markSpaceReadRef = useRef(markSpaceRead);
  markSpaceReadRef.current = markSpaceRead;

  const handleSelect = useCallback(
    (conversationId: string) => {
      setActiveConversationRef.current(conversationId);
      navigate(`/conversations/${conversationId}`);
      closeMobileRef.current();
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (conversationId: string) => {
      setActiveConversationRef.current(conversationId);
      navigate(`/conversations/${conversationId}?showSettings=true`);
      closeMobileRef.current();
    },
    [navigate],
  );

  const handleArchive = useCallback(
    (conversationId: string, archived: boolean, keepArchived?: boolean) => {
      void toggleArchiveRef.current(conversationId, archived, keepArchived);
    },
    [],
  );

  const handleFavorite = useCallback(
    (conversationId: string, favorited: boolean) => {
      void toggleFavoriteRef.current(conversationId, favorited);
    },
    [],
  );

  const handleSpaceFavorite = useCallback((spaceId: string, favorited: boolean) => {
    void toggleSpaceFavoriteRef.current(spaceId, favorited);
  }, []);

  const handleSpaceMarkAllRead = useCallback((spaceId: string) => {
    markSpaceReadRef.current(spaceId);
  }, []);

  const handleSpaceLeaveRequest = useCallback((spaceId: string) => {
    setLeaveSpaceTargetId(spaceId);
  }, []);

  const handleLeaveConfirm = useCallback(async () => {
    if (!leaveTargetId) return;
    setLeaving(true);
    try {
      await leaveGroup(leaveTargetId);
      setLeaveTargetId(null);
    } finally {
      setLeaving(false);
    }
  }, [leaveTargetId, leaveGroup]);

  const handleSpaceLeaveConfirm = useCallback(async () => {
    if (!leaveSpaceTargetId) return;
    setLeavingSpace(true);
    try {
      const res = await api.spaces.leave(leaveSpaceTargetId);
      if (!res.success) {
        toast.error(res.error?.message ?? t('spaces.leaveSpace.error', 'Could not leave Space.'));
        return;
      }
      const left = spaces.find((s) => s.id === leaveSpaceTargetId);
      removeSpaceLocally(leaveSpaceTargetId);
      setLeaveSpaceTargetId(null);
      if (left && location.pathname.startsWith(`/s/${left.slug}`)) {
        navigate('/');
      }
    } catch {
      toast.error(t('spaces.leaveSpace.error', 'Could not leave Space.'));
    } finally {
      setLeavingSpace(false);
    }
  }, [
    leaveSpaceTargetId,
    api,
    toast,
    t,
    spaces,
    removeSpaceLocally,
    location.pathname,
    navigate,
  ]);

  const leaveTargetConversation = leaveTargetId
    ? conversations.find((c) => c.id === leaveTargetId)
    : undefined;
  const isSoleMember =
    leaveTargetConversation?.participants.length === 1;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const { dragActiveId, handleDragStart, handleDragEnd, draggedRef } =
    useSidebarFolderDnd({
      folderedConversationIds,
      folderedSpaceIds,
      createFolder,
      addConversationToFolder,
      addSpaceToFolder,
      newFolderName: t('conversations.folders.newFolder'),
    });

  const handleFolderRename = useCallback((folderId: string) => {
    setEditFolderId(folderId);
  }, []);

  const handleFolderEditSave = useCallback(
    (data: {
      name: string;
      iconType: FolderIconType;
      iconName?: FolderIconName;
      iconColor?: string | null;
    }) => {
      if (!editFolderId) return;
      void updateFolder(editFolderId, data);
      setEditFolderId(null);
    },
    [editFolderId, updateFolder],
  );

  const handleFolderDelete = useCallback(
    (folderId: string) => {
      void deleteFolder(folderId);
    },
    [deleteFolder],
  );

  const handleFolderToggleFavorite = useCallback(
    (folderId: string, favorited: boolean) => {
      void toggleFolderFavorite(folderId, favorited);
    },
    [toggleFolderFavorite],
  );

  const handleFolderOpen = useCallback(
    (folderId: string) => {
      onOpenFolder?.(folderId);
    },
    [onOpenFolder],
  );

  const handleOpenSpace = useCallback(
    (space: { id: string; slug: string }) => {
      const lastChannelId = getLastChannelId(space.id);
      navigate(lastChannelId ? `/s/${space.slug}/c/${lastChannelId}` : `/s/${space.slug}`);
      closeMobile();
    },
    [navigate, closeMobile],
  );

  const conversationMuted = isConversationMutedInView(listView);
  const spaceMuted = isSpaceMutedInView(listView);
  const showConversations = showConversationsInList(listView);
  const showSpaces = showSpacesInList(listView);

  const draggedConversation =
    draggedRef?.kind === 'conversation'
      ? conversations.find((c) => c.id === draggedRef.id)
      : null;
  const draggedSpace =
    draggedRef?.kind === 'space'
      ? spaces.find((s) => s.id === draggedRef.id)
      : null;
  const draggedDisplayName = draggedConversation
    ? resolveConversationDisplayName(draggedConversation, selfId, participantProfiles)
    : draggedSpace
      ? resolveSpaceDisplayName(draggedSpace)
      : '';

  const renderConversationItem = (item: (typeof mainList)[number]) => {
    const dndId = folderableDndId('conversation', item.conversation.id);
    return (
      <DraggableConversation key={item.conversation.id} id={dndId}>
        <DroppableTarget id={dndId}>
          <ConversationListItem
            conversation={item.conversation}
            displayName={item.displayName}
            isActive={activeConversationId === item.conversation.id}
            isArchived={!!item.pref?.archived}
            isFavorited={!!item.pref?.favorited}
            hasActiveCall={activeCallConversationIds.has(item.conversation.id)}
            isUserInCall={activeSession?.conversationId === item.conversation.id}
            selfId={selfId}
            participantProfiles={participantProfiles}
            onSelect={handleSelect}
            onEdit={handleEdit}
            onArchive={handleArchive}
            onFavorite={handleFavorite}
            onLeave={handleLeaveRequest}
            muted={conversationMuted}
          />
        </DroppableTarget>
      </DraggableConversation>
    );
  };

  const renderSpaceItem = (item: (typeof spaceList)[number] | (typeof favoriteSpaceList)[number]) => {
    const dndId = folderableDndId('space', item.space.id);
    return (
      <DraggableConversation key={item.space.id} id={dndId}>
        <DroppableTarget id={dndId}>
          <SpaceListItem
            space={item.space}
            displayName={item.displayName}
            unread={unreadBySpace[item.space.id] ?? 0}
            muted={spaceMuted}
            isFavorited={!!item.pref?.favorited}
            onOpen={handleOpenSpace}
            onFavorite={handleSpaceFavorite}
            onMarkAllRead={handleSpaceMarkAllRead}
            onLeave={handleSpaceLeaveRequest}
          />
        </DroppableTarget>
      </DraggableConversation>
    );
  };

  const renderFolderItem = (folder: ConversationFolder) => (
    <DroppableTarget key={folder.id} id={`folder:${folder.id}`}>
      <FolderListItem
        folder={folder}
        conversations={conversations}
        spaces={spaces}
        unreadBySpace={unreadBySpace}
        resolveSpaceDisplayName={resolveSpaceDisplayName}
        participantProfiles={participantProfiles}
        selfId={selfId}
        onOpen={handleFolderOpen}
        onRename={handleFolderRename}
        onDelete={handleFolderDelete}
        onToggleFavorite={handleFolderToggleFavorite}
      />
    </DroppableTarget>
  );

  const listLoading =
    (showConversations && loading && conversations.length === 0) ||
    (showSpaces && spacesLoading && spaces.length === 0);

  const listEmpty =
    !listLoading &&
    favoritesList.length === 0 &&
    favoriteSpaceList.length === 0 &&
    mainList.length === 0 &&
    spaceList.length === 0 &&
    favoritedFolders.length === 0 &&
    mainFolders.length === 0;

  return (
    <div className="sidebar-tabs-section">
      <SidebarTabs
        tabs={tabs}
        activeTab={listView}
        onTabChange={(id) => setListView(id as SidebarListView)}
      />
      <ChatConnectionBanner />

      <div className="sidebar-tab-content">
        {showConversations && (
          <ChatInvitationsSidebarButton
            isOpen={isChatInvitesPanelOpen}
            onToggle={onToggleChatInvitesPanel}
          />
        )}

        <div className="sidebar-conversations-actions">
          <ConversationFilterPopover
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            sortMode={sortMode}
            onSortMode={setSortMode}
            showArchived={showArchived}
            onShowArchived={setShowArchived}
          />
          {(listView === 'spaces' || listView === 'all') && <DiscoverSpacesSidebarItem />}
          {listView === 'conversations' && isIdentityLoggedIn && (
            <SidebarItem
              icon={<Icon name="plus" />}
              label={t('sidebar.newConversation', 'New')}
              onClick={handleNewConversation}
            />
          )}
        </div>

        {listLoading && (
          <div className="sidebar-conversations-loading">
            <span className="spinner spinner-sm" />
          </div>
        )}

        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="sidebar-conversations-list">
            {favoritedFolders.map(renderFolderItem)}
            {favoritesList.map(renderConversationItem)}
            {favoriteSpaceList.map(renderSpaceItem)}
            {mainFolders.map(renderFolderItem)}
            {mainList.map(renderConversationItem)}
            {spaceList.map(renderSpaceItem)}

            {listEmpty && (
              <div className="sidebar-conversations-empty">
                {!isIdentityLoggedIn
                  ? t('sidebar.signInForConversations', 'Sign into an Alias to see Conversations')
                  : listView === 'spaces'
                    ? t('sidebar.noSpaces', "You haven't joined any Spaces yet")
                    : listView === 'all'
                      ? t('sidebar.noConversationsOrSpaces', 'No conversations or spaces yet')
                      : t('sidebar.noConversations', 'No conversations yet')}
              </div>
            )}
          </div>

          <DragOverlay>
            {dragActiveId && draggedDisplayName ? (
              <div className="conversation-drag-overlay">
                <span className="conversation-drag-overlay-name">
                  {draggedDisplayName}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <ConfirmDialog
          open={!!leaveTargetId}
          onOpenChange={(open) => {
            if (!open) setLeaveTargetId(null);
          }}
          title={t('conversations.leaveGroup.title', 'Leave group?')}
          description={
            isSoleMember
              ? t(
                  'conversations.leaveGroup.lastMember',
                  'You are the last member. The group and all messages will be permanently deleted.',
                )
              : t(
                  'conversations.leaveGroup.confirm',
                  "You won't be able to rejoin without a new invite.",
                )
          }
          confirmLabel={t('conversations.leaveGroup.confirmBtn', 'Leave')}
          variant={isSoleMember ? 'danger' : 'warning'}
          loading={leaving}
          onConfirm={handleLeaveConfirm}
        />

        <ConfirmDialog
          open={!!leaveSpaceTargetId}
          onOpenChange={(open) => {
            if (!open) setLeaveSpaceTargetId(null);
          }}
          title={t('spaces.leaveSpace.title', 'Leave Space?')}
          description={t(
            'spaces.leaveSpace.confirm',
            'You will need a new invite to rejoin this Space.',
          )}
          confirmLabel={t('spaces.leaveSpace.confirmBtn', 'Leave')}
          variant="warning"
          loading={leavingSpace}
          onConfirm={handleSpaceLeaveConfirm}
        />

        <FolderEditModal
          open={!!editFolderId}
          onOpenChange={(open) => {
            if (!open) setEditFolderId(null);
          }}
          initialName={editFolder?.name ?? ''}
          initialIconType={editFolder?.iconType ?? 'dynamic'}
          initialIconName={editFolder?.iconName}
          initialIconColor={editFolder?.iconColor}
          onSave={handleFolderEditSave}
        />
      </div>
    </div>
  );
}
