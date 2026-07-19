/**
 * Conversations sidebar section — composition root.
 *
 * Presentational rows, filter popover, DnD wrappers, and list/badge hooks live
 * in sibling modules. Public API: {@link SidebarLogo}, {@link ConversationsSidebarSection}.
 */

import { useState, useCallback, useRef } from 'react';
import type { ConversationFolder, FolderIconName, FolderIconType } from '@adieuu/shared';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SidebarItem, useSidebar } from '../../components/Sidebar';
import { SidebarTabs, type SidebarTab } from '../../components/SidebarTabs';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FolderEditModal } from '../../components/FolderEditModal';
import { Icon } from '../../icons/Icon';
import { ChatConnectionBanner } from '../../components/ChatConnectionBanner';
import { useConversations } from '../../hooks/useConversations';
import { useConversationPreferences } from '../../hooks/useConversationPreferences';
import { useConversationFolders } from '../../hooks/useConversationFolders';
import { useIdentity } from '../../hooks/useIdentity';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useCallSession } from '../../hooks/useCallSession';
import { ChatInvitationsSidebarButton } from './invitations';
import { SpacesSidebarSection } from './spaces';
import { useSpaces } from '../../hooks/useSpaces';
import { resolveConversationDisplayName } from './resolveConversationDisplayName';
import type { SortMode, TypeFilter } from './conversationSidebarTypes';
import { ConversationFilterPopover } from './ConversationFilterPopover';
import { ConversationListItem } from './ConversationListItem';
import { FolderListItem } from './FolderListItem';
import { DraggableConversation, DroppableTarget } from './conversationSidebarDnd';
import { useConversationSidebarBadge } from './useConversationSidebarBadge';
import { useConversationSidebarList } from './useConversationSidebarList';

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
    folders,
    folderedConversationIds,
    createFolder,
    deleteFolder,
    updateFolder,
    addConversationToFolder,
    toggleFolderFavorite,
  } = useConversationFolders();
  const { identity, status: identityStatus } = useIdentity();
  const isIdentityLoggedIn = identityStatus === 'logged_in' && !!identity;
  const { activeCallConversationIds } = useGlobalCallEvents();
  const { activeSession } = useCallSession();
  const { closeMobile } = useSidebar();
  const [activeTab, setActiveTab] = useState('conversations');

  const selfId = identity?.id;

  // Filter state
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [showArchived, setShowArchived] = useState(false);

  // Leave dialog state
  const [leaveTargetId, setLeaveTargetId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Drag-and-drop state
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);

  // Folder edit modal state
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const editFolder = editFolderId
    ? folders.find((f) => f.id === editFolderId) ?? null
    : null;

  const { unreadBySpace } = useSpaces();
  const { totalUnread, totalSpacesUnread } = useConversationSidebarBadge(
    conversations,
    unreadBySpace,
  );

  const { favoritesList, mainList, favoritedFolders, mainFolders } = useConversationSidebarList({
    conversations,
    identityId: identity?.id,
    participantProfiles,
    preferences,
    typeFilter,
    sortMode,
    showArchived,
    folderedConversationIds,
    folders,
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

  const handleLeaveConfirm = useCallback(async () => {
    if (!leaveTargetId) return;
    setLeaving(true);
    try {
      await leaveGroup(leaveTargetId);
    } finally {
      setLeaving(false);
      setLeaveTargetId(null);
    }
  }, [leaveTargetId, leaveGroup]);

  const leaveTargetConversation = leaveTargetId
    ? conversations.find((c) => c.id === leaveTargetId)
    : undefined;
  const isSoleMember =
    leaveTargetConversation?.participants.length === 1;

  // --- Drag-and-drop ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDragActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const draggedId = String(active.id);
      const overId = String(over.id);

      if (draggedId === overId) return;

      // If dropped onto a folder, add to that folder
      if (overId.startsWith('folder:')) {
        const folderId = overId.slice(7);
        if (!folderedConversationIds.has(draggedId)) {
          void addConversationToFolder(folderId, draggedId);
        }
        return;
      }

      // If dropped onto another conversation, create a new folder
      if (!folderedConversationIds.has(draggedId) && !folderedConversationIds.has(overId)) {
        void createFolder({
          name: t('conversations.folders.newFolder'),
          conversationIds: [overId, draggedId],
        });
      }
    },
    [folderedConversationIds, addConversationToFolder, createFolder, t],
  );

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

  const draggedConversation = dragActiveId
    ? conversations.find((c) => c.id === dragActiveId)
    : null;
  const draggedDisplayName = draggedConversation
    ? resolveConversationDisplayName(draggedConversation, selfId, participantProfiles)
    : '';

  const renderItem = (item: (typeof mainList)[number]) => (
    <DraggableConversation key={item.conversation.id} id={item.conversation.id}>
      <DroppableTarget id={item.conversation.id}>
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
        />
      </DroppableTarget>
    </DraggableConversation>
  );

  const renderFolderItem = (folder: ConversationFolder) => (
    <DroppableTarget key={folder.id} id={`folder:${folder.id}`}>
      <FolderListItem
        folder={folder}
        conversations={conversations}
        participantProfiles={participantProfiles}
        selfId={selfId}
        onOpen={handleFolderOpen}
        onRename={handleFolderRename}
        onDelete={handleFolderDelete}
        onToggleFavorite={handleFolderToggleFavorite}
      />
    </DroppableTarget>
  );

  return (
    <div className="sidebar-tabs-section">
      <SidebarTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <ChatConnectionBanner />

      <div className="sidebar-tab-content">
        {activeTab === 'conversations' && (
          <>
            <ChatInvitationsSidebarButton
              isOpen={isChatInvitesPanelOpen}
              onToggle={onToggleChatInvitesPanel}
            />

            <div className="sidebar-conversations-actions">
              <ConversationFilterPopover
                typeFilter={typeFilter}
                onTypeFilter={setTypeFilter}
                sortMode={sortMode}
                onSortMode={setSortMode}
                showArchived={showArchived}
                onShowArchived={setShowArchived}
              />
              {isIdentityLoggedIn && (
                <SidebarItem
                  icon={<Icon name="plus" />}
                  label={t('sidebar.newConversation', 'New')}
                  onClick={handleNewConversation}
                />
              )}
            </div>

            {loading && conversations.length === 0 && (
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

                {favoritesList.length > 0 && (
                  <>
                    {favoritesList.map(renderItem)}
                  </>
                )}

                {mainFolders.map(renderFolderItem)}

                {mainList.map(renderItem)}

                {!loading &&
                  favoritesList.length === 0 &&
                  mainList.length === 0 &&
                  folders.length === 0 && (
                    <div className="sidebar-conversations-empty">
                      {isIdentityLoggedIn
                        ? t('sidebar.noConversations', 'No conversations yet')
                        : t('sidebar.signInForConversations', 'Sign into an Alias to see Conversations')}
                    </div>
                  )}
              </div>

              <DragOverlay>
                {draggedConversation ? (
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
          </>
        )}

        {activeTab === 'spaces' && <SpacesSidebarSection />}
      </div>
    </div>
  );
}
