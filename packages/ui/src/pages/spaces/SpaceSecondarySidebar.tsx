/**
 * Discord-style secondary sidebar for a Space.
 *
 * On desktop: persistent channel rail. On mobile: off-canvas drawer inside
 * `.space-page` (opened from SpaceMobileChrome). Supports nested categories,
 * context menus on the whole rail, and manageChannels-gated drag/drop.
 */

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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
  SPACE_CATEGORY_MAX_DEPTH,
  createApiClient,
  type CreateSpaceChannelCategoryParams,
  type PublicSpaceChannel,
  type PublicSpaceChannelCategory,
} from '@adieuu/shared';
import { useSpaces } from '../../hooks/useSpaces';
import { useHorizontalPanelResize } from '../../hooks/useHorizontalPanelResize';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import { useAppConfig } from '../../config';
import {
  SPACE_SIDEBAR_MIN_WIDTH_PX,
  getSpaceSidebarMaxWidthPx,
  resolveInitialSpaceSidebarWidth,
  setSpaceSidebarWidthCssVar,
  writeStoredSpaceSidebarWidth,
} from '../../services/spaceSidebarWidthPreferences';
import { useSpaceCipher } from './useSpaceCipher';
import {
  encryptSpaceMetadataField,
  resolveChannelDisplayName,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';
import { SpaceSidebarSettingsModals } from './SpaceSidebarSettingsModals';
import {
  DraggableSpaceItem,
  DroppableSpaceTarget,
  SpaceDropHighlightProvider,
  type DropHighlight,
} from './spaceSidebarDnd';
import {
  applySpaceSidebarDrag,
  buildSpaceSidebarTree,
  getCategoryDepth,
  layoutAfterCreateCategoryFromChannels,
  type SpaceSidebarTreeItem,
} from './spaceSidebarLayout';
import '../../styles/_spaces-sidebar.scss';

interface SpaceSecondarySidebarProps {
  mobileOpen?: boolean;
  onNavigate?: () => void;
  /** When false (narrow / off-canvas), width resize is disabled. */
  resizable?: boolean;
}

function ContextMenu({
  onSelect,
  items,
  children,
  isolate = false,
  fill = false,
}: {
  onSelect: (value: string) => void;
  items: ReadonlyArray<{ value: string; label: string }>;
  children: ReactNode;
  /** Stop contextmenu bubbling so a parent rail menu does not also open. */
  isolate?: boolean;
  /** Grow to fill remaining sidebar space (empty-area create menu). */
  fill?: boolean;
}) {
  if (items.length === 0) return <>{children}</>;
  const surface = (
    // biome-ignore lint/a11y/noStaticElementInteractions: optional stopPropagation boundary for nested menus
    <div
      className={
        fill
          ? 'space-sidebar-context-surface space-sidebar-context-surface--fill'
          : 'space-sidebar-context-surface'
      }
      data-skip-app-plain-context
      onContextMenu={isolate ? (e) => e.stopPropagation() : undefined}
    >
      {children}
    </div>
  );

  const menu = (
    <Menu.Root onSelect={(details) => onSelect(details.value)}>
      <Menu.ContextTrigger asChild>{surface}</Menu.ContextTrigger>
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

  if (!fill) return menu;
  return <div className="space-sidebar-context-fill">{menu}</div>;
}

function SpaceSidebarDndShell({
  sensors,
  onDragEnd,
  zoneRef,
  children,
}: {
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  zoneRef: MutableRefObject<DropHighlight>;
  children: ReactNode;
}) {
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SpaceDropHighlightProvider zoneRef={zoneRef}>{children}</SpaceDropHighlightProvider>
    </DndContext>
  );
}

export function SpaceSecondarySidebar({
  mobileOpen = false,
  onNavigate,
  resizable = true,
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
  const dropZoneRef = useRef<DropHighlight>(null);
  const { resizeHandleProps } = useHorizontalPanelResize({
    disabled: !resizable,
    minPx: SPACE_SIDEBAR_MIN_WIDTH_PX,
    getMaxPx: getSpaceSidebarMaxWidthPx,
    resolveInitial: resolveInitialSpaceSidebarWidth,
    writeStored: writeStoredSpaceSidebarWidth,
    setCssVar: setSpaceSidebarWidthCssVar,
    edge: 'end',
  });
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | null>(null);
  const [editingChannel, setEditingChannel] = useState<PublicSpaceChannel | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [createCategoryParentId, setCreateCategoryParentId] = useState<string | null>(null);
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

  const tree = useMemo(
    () => buildSpaceSidebarTree(categories, channels),
    [categories, channels],
  );

  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
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
          } catch {
            /* quota */
          }
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

  const createChannelCategory = createChannelCategoryId
    ? categoryById.get(createChannelCategoryId) ?? null
    : null;

  const inheritRoleIds = createChannelCategory?.allowedRoleIds ?? null;
  const inheritChannelCipherCheck = createChannelCategory?.cipherCheck ?? null;

  const openCreateCategory = useCallback((parentCategoryId: string | null = null) => {
    setCreateCategoryParentId(parentCategoryId);
    setCreateCategoryOpen(true);
  }, []);

  const createCategoryParent = createCategoryParentId
    ? categoryById.get(createCategoryParentId) ?? null
    : null;

  const handleRailMenu = useCallback(
    (value: string) => {
      if (value === 'create-channel') openCreateChannel(null);
      else if (value === 'create-category') openCreateCategory(null);
    },
    [openCreateChannel, openCreateCategory],
  );

  const handleCategoryMenu = useCallback(
    (category: PublicSpaceChannelCategory, value: string) => {
      if (value === 'edit-category') setEditingCategory(category);
      else if (value === 'create-channel') openCreateChannel(category.id);
      else if (value === 'create-child-category') openCreateCategory(category.id);
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
    [openCreateChannel, openCreateCategory, activeSpace, api, removeCategoryLocally, toast, t],
  );

  const handleChannelMenu = useCallback(
    (channel: PublicSpaceChannel, value: string) => {
      if (value === 'edit-channel') setEditingChannel(channel);
      else if (value === 'create-channel') openCreateChannel(channel.categoryId);
      else if (value === 'create-category') openCreateCategory(channel.categoryId);
    },
    [openCreateChannel, openCreateCategory],
  );

  const createCategoryFromChannels = useCallback(
    async (intent: {
      parentCategoryId: string | null;
      channelIds: [string, string];
      insertIndex: number;
    }) => {
      if (!activeSpace) return;
      const parent =
        intent.parentCategoryId != null
          ? categoryById.get(intent.parentCategoryId)
          : null;
      const name = t('spaces.sidebar.newCategoryName');
      const body: CreateSpaceChannelCategoryParams = {
        parentCategoryId: intent.parentCategoryId,
        allowedRoleIds: parent?.allowedRoleIds?.length
          ? [...parent.allowedRoleIds]
          : undefined,
      };

      if (activeSpace.e2ee) {
        if (!spaceCipher) {
          toast.error(t('spaces.sidebar.createCategoryError'));
          return;
        }
        const enc = encryptSpaceMetadataField(spaceCipher, name);
        body.encryptedName = enc.encryptedName;
        body.nameNonce = enc.nameNonce;
        body.cipherId = enc.cipherId;
      } else {
        body.name = name;
      }

      const res = await api.spaces.createCategory(activeSpace.id, body);
      if (!res.success || !res.data?.category) {
        toast.error(t('spaces.sidebar.createCategoryError'));
        return;
      }
      const newCategory = res.data.category;

      const layout = layoutAfterCreateCategoryFromChannels({
        categories,
        channels,
        newCategory,
        parentCategoryId: intent.parentCategoryId,
        channelIds: intent.channelIds,
        insertIndex: intent.insertIndex,
      });
      const ok = await applyChannelLayout(layout, {
        knownCategories: [newCategory],
      });
      if (!ok) {
        // Category was created; keep it visible even if layout failed.
        addCategoryLocally(newCategory);
        toast.error(t('spaces.sidebar.layoutError'));
      }
    },
    [
      activeSpace,
      api,
      categoryById,
      categories,
      channels,
      spaceCipher,
      addCategoryLocally,
      applyChannelLayout,
      toast,
      t,
    ],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canManageChannels) return;
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId) return;
      const highlight = dropZoneRef.current;
      const zone =
        highlight && highlight.overId === overId ? highlight.zone : 'on';
      dropZoneRef.current = null;

      const result = applySpaceSidebarDrag({
        categories,
        channels,
        activeId,
        overId,
        zone,
      });
      if (!result) return;

      if (result.type === 'createCategoryFromChannels') {
        void createCategoryFromChannels(result);
        return;
      }

      void applyChannelLayout(result.layout).then((ok) => {
        if (!ok) toast.error(t('spaces.sidebar.layoutError'));
      });
    },
    [
      canManageChannels,
      categories,
      channels,
      applyChannelLayout,
      createCategoryFromChannels,
      dropZoneRef,
      toast,
      t,
    ],
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
        isolate
      >
        {link}
      </ContextMenu>
    );

    if (!canManageChannels) {
      return <div key={ch.id}>{wrapped}</div>;
    }

    return (
      <DraggableSpaceItem key={ch.id} id={`channel:${ch.id}`}>
        <DroppableSpaceTarget
          id={`channel:${ch.id}`}
          data={{ kind: 'channel', id: ch.id }}
        >
          {wrapped}
        </DroppableSpaceTarget>
      </DraggableSpaceItem>
    );
  };

  const renderTreeItems = (items: readonly SpaceSidebarTreeItem[], depth: number): ReactNode => (
    <div
      className={
        depth > 0
          ? 'space-sidebar-tree-level space-sidebar-tree-level--nested'
          : 'space-sidebar-tree-level'
      }
    >
      {items.map((item) => {
        if (item.type === 'channel') {
          return renderChannel(item.channel);
        }

        const { category, children } = item;
        const collapsed = collapsedCategoryIds.has(category.id);
        const categoryName = resolveChannelDisplayName(category, spaceCipher, {
          encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
        });

        const canCreateChild =
          getCategoryDepth(category.id, categories) < SPACE_CATEGORY_MAX_DEPTH;
        const categoryMenuItems = canManageChannels
          ? [
              { value: 'edit-category', label: t('spaces.sidebar.editCategory') },
              { value: 'create-channel', label: t('spaces.sidebar.createChannel') },
              ...(canCreateChild
                ? [
                    {
                      value: 'create-child-category',
                      label: t('spaces.sidebar.createChildCategory'),
                    },
                  ]
                : []),
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

        const headerWrapped = (
          <ContextMenu
            onSelect={(value) => handleCategoryMenu(category, value)}
            items={categoryMenuItems}
            isolate
          >
            {header}
          </ContextMenu>
        );

        const headerNode = canManageChannels ? (
          <DraggableSpaceItem id={`category:${category.id}`}>
            <DroppableSpaceTarget
              id={`category:${category.id}`}
              data={{ kind: 'category', id: category.id }}
            >
              {headerWrapped}
            </DroppableSpaceTarget>
          </DraggableSpaceItem>
        ) : (
          headerWrapped
        );

        return (
          <div key={category.id} className="space-sidebar-group">
            {headerNode}
            {!collapsed && children.length > 0 && (
              <nav className="space-sidebar-channels" aria-label={categoryName}>
                {renderTreeItems(children, depth + 1)}
              </nav>
            )}
          </div>
        );
      })}
    </div>
  );

  // Rail create menu covers chrome + the tree region (empty space). Channel /
  // category menus use `isolate` so their contextmenu does not bubble up.
  const sidebarInner = (
    <>
      <ContextMenu onSelect={handleRailMenu} items={railMenuItems}>
        <div className="space-sidebar-rail-chrome">
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
        </div>
      </ContextMenu>

      {railMenuItems.length > 0 ? (
        <ContextMenu onSelect={handleRailMenu} items={railMenuItems} fill>
          <div className="space-sidebar-tree-region">
            <div className="space-sidebar-tree">{renderTreeItems(tree, 0)}</div>
            <div className="space-sidebar-rail-filler" />
          </div>
        </ContextMenu>
      ) : (
        <div className="space-sidebar-context-fill">
          <div className="space-sidebar-tree-region">
            <div className="space-sidebar-tree">{renderTreeItems(tree, 0)}</div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <aside
        className={`space-secondary-sidebar${mobileOpen ? ' space-secondary-sidebar--mobile-open' : ''}`}
        aria-label={spaceName}
      >
        <div className="space-sidebar-rail-body">
          {canManageChannels ? (
            <SpaceSidebarDndShell
              sensors={sensors}
              onDragEnd={handleDragEnd}
              zoneRef={dropZoneRef}
            >
              {sidebarInner}
            </SpaceSidebarDndShell>
          ) : (
            sidebarInner
          )}
        </div>
        {resizable && (
          <hr
            className="panel-resize-handle panel-resize-handle--end"
            aria-orientation="vertical"
            aria-label={t('spaces.sidebar.resizeSidebar')}
            {...resizeHandleProps}
          />
        )}
      </aside>

      <SpaceSidebarSettingsModals
        space={activeSpace}
        heldRoleIds={activeSpaceRoleIds}
        canManageChannels={canManageChannels}
        canManageEncryption={canManageEncryption}
        categories={categories}
        createChannelOpen={createChannelOpen}
        onCreateChannelOpenChange={setCreateChannelOpen}
        createChannelCategoryId={createChannelCategoryId}
        inheritRoleIds={inheritRoleIds}
        inheritChannelCipherCheck={inheritChannelCipherCheck}
        onChannelCreated={addChannelLocally}
        editingChannel={editingChannel}
        onEditingChannelChange={setEditingChannel}
        onChannelUpdated={addChannelLocally}
        createCategoryOpen={createCategoryOpen}
        onCreateCategoryOpenChange={(open) => {
          setCreateCategoryOpen(open);
          if (!open) setCreateCategoryParentId(null);
        }}
        createCategoryParentId={createCategoryParentId}
        createCategoryParent={createCategoryParent}
        onCategoryCreated={addCategoryLocally}
        editingCategory={editingCategory}
        onEditingCategoryChange={setEditingCategory}
        onCategoryUpdated={addCategoryLocally}
      />
    </>
  );
}
