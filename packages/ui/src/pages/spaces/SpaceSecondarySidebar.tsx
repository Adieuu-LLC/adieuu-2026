/**
 * Discord-style secondary sidebar for a Space.
 *
 * On desktop: persistent channel rail. On mobile: off-canvas drawer inside
 * `.space-page` (opened from SpaceMobileChrome). Supports categories, context
 * menus on the whole rail, and manageChannels-gated drag/drop.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Menu, Portal } from '@ark-ui/react';
import {
  createApiClient,
  type PublicSpaceChannel,
  type PublicSpaceChannelCategory,
} from '@adieuu/shared';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import { useSpaceCipher } from './useSpaceCipher';
import {
  resolveChannelDisplayName,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { CategorySettingsModal } from './CategorySettingsModal';
import { DraggableSpaceItem, DroppableSpaceTarget } from './spaceSidebarDnd';
import {
  applySpaceSidebarDrag,
  buildSpaceSidebarBuckets,
  sortByPosition,
} from './spaceSidebarLayout';

interface SpaceSecondarySidebarProps {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}

function ContextMenu({
  onSelect,
  items,
  children,
}: {
  onSelect: (value: string) => void;
  items: ReadonlyArray<{ value: string; label: string }>;
  children: ReactNode;
}) {
  if (items.length === 0) return <>{children}</>;
  return (
    <Menu.Root onSelect={(details) => onSelect(details.value)}>
      <Menu.ContextTrigger asChild>
        <div className="space-sidebar-context-surface" data-skip-app-plain-context>
          {children}
        </div>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="conversation-context-menu">
            {items.map((item) => (
              <Menu.Item
                key={item.value}
                value={item.value}
                className="conversation-context-menu-item"
              >
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

export function SpaceSecondarySidebar({
  mobileOpen = false,
  onNavigate,
}: SpaceSecondarySidebarProps) {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();
  const {
    activeSpace,
    channels,
    categories,
    unreadByChannel,
    canAccessSpaceManage,
    hasActiveSpacePermission,
    activeSpaceRoleIds,
    addChannelLocally,
    addCategoryLocally,
    removeCategoryLocally,
    applyChannelLayout,
  } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<PublicSpaceChannel | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PublicSpaceChannelCategory | null>(null);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<string>>(() => {
    try {
      const raw = activeSpace
        ? localStorage.getItem(`adieuu:spaceCollapsedCats:${activeSpace.id}`)
        : null;
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const canManageChannels = hasActiveSpacePermission('manageChannels');
  const canManageEncryption = hasActiveSpacePermission('manageEncryption');
  const canEditChannel = canManageChannels || canManageEncryption;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const sortedCategories = useMemo(() => sortByPosition(categories), [categories]);
  const buckets = useMemo(
    () => buildSpaceSidebarBuckets(categories, channels),
    [categories, channels],
  );

  const categoryById = useMemo(
    () => new Map(sortedCategories.map((c) => [c.id, c])),
    [sortedCategories],
  );

  const toggleCollapsed = useCallback(
    (categoryId: string) => {
      setCollapsedCategoryIds((prev) => {
        const next = new Set(prev);
        if (next.has(categoryId)) next.delete(categoryId);
        else next.add(categoryId);
        if (activeSpace) {
          try {
            localStorage.setItem(
              `adieuu:spaceCollapsedCats:${activeSpace.id}`,
              JSON.stringify([...next]),
            );
          } catch { /* quota */ }
        }
        return next;
      });
    },
    [activeSpace],
  );

  const openCreateChannel = useCallback((categoryId: string | null = null) => {
    setCreateChannelCategoryId(categoryId);
    setCreateChannelOpen(true);
  }, []);

  const inheritRoleIds = useMemo(() => {
    if (!createChannelCategoryId) return null;
    return categoryById.get(createChannelCategoryId)?.allowedRoleIds ?? null;
  }, [createChannelCategoryId, categoryById]);

  const handleRailMenu = useCallback((value: string) => {
    if (value === 'create-channel') openCreateChannel(null);
    else if (value === 'create-category') setCreateCategoryOpen(true);
  }, [openCreateChannel]);

  const handleCategoryMenu = useCallback(
    (category: PublicSpaceChannelCategory, value: string) => {
      if (value === 'edit-category') setEditingCategory(category);
      else if (value === 'create-channel') openCreateChannel(category.id);
      else if (value === 'delete-category' && activeSpace) {
        void (async () => {
          const res = await api.spaces.deleteCategory(activeSpace.id, category.id);
          if (res.success) {
            removeCategoryLocally(category.id);
          } else {
            toast.error(t('spaces.editCategory.deleteError'));
          }
        })();
      }
    },
    [openCreateChannel, activeSpace, api, removeCategoryLocally, toast, t],
  );

  const handleChannelMenu = useCallback(
    (channel: PublicSpaceChannel, value: string) => {
      if (value === 'edit-channel') setEditingChannel(channel);
      else if (value === 'create-channel') openCreateChannel(channel.categoryId);
      else if (value === 'create-category') setCreateCategoryOpen(true);
    },
    [openCreateChannel],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canManageChannels) return;
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId) return;
      const layout = applySpaceSidebarDrag({
        categories,
        channels,
        activeId,
        overId,
      });
      if (!layout) return;
      void applyChannelLayout(layout).then((ok) => {
        if (!ok) toast.error(t('spaces.sidebar.layoutError'));
      });
    },
    [canManageChannels, categories, channels, applyChannelLayout, toast, t],
  );

  if (!activeSpace) return null;

  const spaceName = resolveSpaceDisplayName(activeSpace, spaceCipher, {
    encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
  });

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `space-sidebar-link${isActive ? ' space-sidebar-link-active' : ''}`;

  const handleNav = () => {
    onNavigate?.();
  };

  const railMenuItems = canManageChannels
    ? [
        { value: 'create-channel', label: t('spaces.sidebar.createChannel') },
        { value: 'create-category', label: t('spaces.sidebar.createCategory') },
      ]
    : [];

  const channelMenuItems = [
    ...(canEditChannel
      ? [{ value: 'edit-channel', label: t('spaces.sidebar.editChannel') }]
      : []),
    ...(canManageChannels
      ? [
          { value: 'create-channel', label: t('spaces.sidebar.createChannel') },
          { value: 'create-category', label: t('spaces.sidebar.createCategory') },
        ]
      : []),
  ];

  const renderChannel = (ch: PublicSpaceChannel) => {
    const unread = unreadByChannel[ch.id];
    const channelName = resolveChannelDisplayName(ch, spaceCipher, {
      encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
    });
    const link = (
      <NavLink
        to={`/s/${slug}/c/${ch.id}`}
        className={navLinkClass}
        onClick={handleNav}
      >
        <span className="space-sidebar-channel-hash">#</span>
        <span className="space-sidebar-channel-name">{channelName}</span>
        {unread && unread.unread > 0 && (
          <span
            role="status"
            className={`space-sidebar-unread-badge${unread.mention ? ' space-sidebar-unread-badge--mention' : ''}`}
            aria-label={
              unread.mention
                ? t('spaces.sidebar.mentionBadge', { count: unread.unread })
                : t('spaces.sidebar.unreadBadge', { count: unread.unread })
            }
          >
            {unread.unread}
          </span>
        )}
      </NavLink>
    );

    const wrapped = (
      <ContextMenu
        onSelect={(value) => handleChannelMenu(ch, value)}
        items={channelMenuItems}
      >
        {link}
      </ContextMenu>
    );

    if (!canManageChannels) {
      return <div key={ch.id}>{wrapped}</div>;
    }

    return (
      <DraggableSpaceItem key={ch.id} id={`channel:${ch.id}`}>
        <DroppableSpaceTarget id={`channel:${ch.id}`}>
          {wrapped}
        </DroppableSpaceTarget>
      </DraggableSpaceItem>
    );
  };

  const renderBucket = (bucket: { categoryId: string | null; channels: PublicSpaceChannel[] }) => {
    if (bucket.categoryId === null) {
      const header = (
        <div className="space-sidebar-group-header">
          {t('spaces.sidebar.textChannels')}
        </div>
      );
      return (
        <DroppableSpaceTarget
          key="uncategorized"
          id="uncategorized"
          disabled={!canManageChannels}
        >
          <div className="space-sidebar-group">
            {header}
            <nav
              className="space-sidebar-channels"
              aria-label={t('spaces.sidebar.textChannels')}
            >
              {bucket.channels.map(renderChannel)}
            </nav>
          </div>
        </DroppableSpaceTarget>
      );
    }

    const category = categoryById.get(bucket.categoryId);
    if (!category) return null;
    const collapsed = collapsedCategoryIds.has(category.id);
    const categoryName = resolveChannelDisplayName(category, spaceCipher, {
      encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
    });

    const categoryMenuItems = canManageChannels
      ? [
          { value: 'edit-category', label: t('spaces.sidebar.editCategory') },
          { value: 'create-channel', label: t('spaces.sidebar.createChannel') },
          { value: 'delete-category', label: t('spaces.sidebar.deleteCategory') },
        ]
      : [];

    const header = (
      <button
        type="button"
        className="space-sidebar-group-header space-sidebar-group-header--toggle"
        onClick={() => toggleCollapsed(category.id)}
        aria-expanded={!collapsed}
      >
        <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size="sm" />
        <span>{categoryName}</span>
      </button>
    );

    const body = (
      <div className="space-sidebar-group">
        <ContextMenu
          onSelect={(value) => handleCategoryMenu(category, value)}
          items={categoryMenuItems}
        >
          {header}
        </ContextMenu>
        {!collapsed && (
          <nav
            className="space-sidebar-channels"
            aria-label={categoryName}
          >
            {bucket.channels.map(renderChannel)}
          </nav>
        )}
      </div>
    );

    if (!canManageChannels) {
      return <div key={category.id}>{body}</div>;
    }

    return (
      <DraggableSpaceItem key={category.id} id={`category:${category.id}`}>
        <DroppableSpaceTarget id={`category:${category.id}`}>
          {body}
        </DroppableSpaceTarget>
      </DraggableSpaceItem>
    );
  };

  const sidebarInner = (
    <>
      <div className="space-sidebar-banner">
        <span className="space-sidebar-banner-name">{spaceName}</span>
        {activeSpace.e2ee && (
          <span className="spaces-badge spaces-badge--encrypted">
            {t('spaces.encrypted')}
          </span>
        )}
      </div>

      {canAccessSpaceManage && (
        <NavLink
          to={`/s/${slug}/manage`}
          className={navLinkClass}
          onClick={handleNav}
        >
          <Icon name="settings" size="sm" />
          <span>{t('spaces.sidebar.manage')}</span>
        </NavLink>
      )}

      <NavLink
        to={`/s/${slug}`}
        end
        className={navLinkClass}
        onClick={handleNav}
      >
        <Icon name="home" size="sm" />
        <span>{t('spaces.sidebar.home')}</span>
      </NavLink>

      <div className="space-sidebar-buckets">
        {buckets.map(renderBucket)}
      </div>
    </>
  );

  return (
    <>
      <aside
        className={`space-secondary-sidebar${mobileOpen ? ' space-secondary-sidebar--mobile-open' : ''}`}
        aria-label={spaceName}
      >
        <ContextMenu onSelect={handleRailMenu} items={railMenuItems}>
          <div className="space-sidebar-rail-body">
            {canManageChannels ? (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                {sidebarInner}
              </DndContext>
            ) : (
              sidebarInner
            )}
          </div>
        </ContextMenu>
      </aside>

      {createChannelOpen && (
        <ChannelSettingsModal
          open={createChannelOpen}
          onOpenChange={setCreateChannelOpen}
          space={activeSpace}
          heldRoleIds={activeSpaceRoleIds}
          canManageChannels={canManageChannels}
          canManageEncryption={canManageEncryption}
          categoryId={createChannelCategoryId}
          initialAllowedRoleIds={inheritRoleIds}
          onCreated={addChannelLocally}
        />
      )}

      {editingChannel && (
        <ChannelSettingsModal
          open={!!editingChannel}
          onOpenChange={(open) => {
            if (!open) setEditingChannel(null);
          }}
          space={activeSpace}
          heldRoleIds={activeSpaceRoleIds}
          canManageChannels={canManageChannels}
          canManageEncryption={canManageEncryption}
          channel={editingChannel}
          onUpdated={addChannelLocally}
        />
      )}

      {createCategoryOpen && (
        <CategorySettingsModal
          open={createCategoryOpen}
          onOpenChange={setCreateCategoryOpen}
          space={activeSpace}
          heldRoleIds={activeSpaceRoleIds}
          onCreated={addCategoryLocally}
        />
      )}

      {editingCategory && (
        <CategorySettingsModal
          open={!!editingCategory}
          onOpenChange={(open) => {
            if (!open) setEditingCategory(null);
          }}
          space={activeSpace}
          heldRoleIds={activeSpaceRoleIds}
          category={editingCategory}
          onUpdated={addCategoryLocally}
        />
      )}
    </>
  );
}
