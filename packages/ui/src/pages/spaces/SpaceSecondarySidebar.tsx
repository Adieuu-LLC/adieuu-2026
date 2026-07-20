/**
 * Discord-style secondary sidebar for a Space.
 *
 * On desktop: persistent channel rail. On mobile: off-canvas drawer inside
 * `.space-page` (opened from SpaceMobileChrome).
 */

import { useCallback, useState, type ReactNode } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import type { PublicSpaceChannel } from '@adieuu/shared';
import { useSpaces } from '../../hooks/useSpaces';
import { Icon } from '../../icons/Icon';
import { useSpaceCipher } from './useSpaceCipher';
import {
  resolveChannelDisplayName,
  resolveSpaceDisplayName,
} from './spaceMetadataCipher';
import { ChannelSettingsModal } from './ChannelSettingsModal';

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
  const {
    activeSpace,
    channels,
    unreadByChannel,
    canAccessSpaceManage,
    hasActiveSpacePermission,
    activeSpaceRoleIds,
    addChannelLocally,
  } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<PublicSpaceChannel | null>(null);

  const canManageChannels = hasActiveSpacePermission('manageChannels');
  const canManageEncryption = hasActiveSpacePermission('manageEncryption');
  const canEditChannel = canManageChannels || canManageEncryption;

  const openCreate = useCallback(() => setCreateOpen(true), []);

  const handleChannelMenu = useCallback((channel: PublicSpaceChannel, value: string) => {
    if (value === 'edit-channel') setEditingChannel(channel);
    else if (value === 'create-channel') setCreateOpen(true);
  }, []);

  if (!activeSpace) return null;

  const spaceName = resolveSpaceDisplayName(activeSpace, spaceCipher, {
    encryptedSpace: t('spaces.encryptedSpacePlaceholder'),
  });

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `space-sidebar-link${isActive ? ' space-sidebar-link-active' : ''}`;

  const handleNav = () => {
    onNavigate?.();
  };

  const createMenuItems = [
    { value: 'create-channel', label: t('spaces.sidebar.createChannel') },
  ] as const;

  const channelMenuItems = [
    ...(canEditChannel
      ? [{ value: 'edit-channel', label: t('spaces.sidebar.editChannel') }]
      : []),
    ...(canManageChannels
      ? [{ value: 'create-channel', label: t('spaces.sidebar.createChannel') }]
      : []),
  ];

  const channelsNav = (
    <nav
      className="space-sidebar-channels"
      aria-label={t('spaces.sidebar.textChannels')}
    >
      {channels.map((ch) => {
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

        if (channelMenuItems.length === 0) {
          return <div key={ch.id}>{link}</div>;
        }

        return (
          <ContextMenu
            key={ch.id}
            onSelect={(value) => handleChannelMenu(ch, value)}
            items={channelMenuItems}
          >
            {link}
          </ContextMenu>
        );
      })}
    </nav>
  );

  const textChannelsHeader = (
    <div className="space-sidebar-group-header">
      {t('spaces.sidebar.textChannels')}
    </div>
  );

  return (
    <>
      <aside
        className={`space-secondary-sidebar${mobileOpen ? ' space-secondary-sidebar--mobile-open' : ''}`}
        aria-label={spaceName}
      >
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

        <div className="space-sidebar-group">
          {canManageChannels ? (
            <ContextMenu
              onSelect={(value) => {
                if (value === 'create-channel') openCreate();
              }}
              items={createMenuItems}
            >
              {textChannelsHeader}
            </ContextMenu>
          ) : (
            textChannelsHeader
          )}
          {channelsNav}
        </div>
      </aside>

      {createOpen && (
        <ChannelSettingsModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          space={activeSpace}
          heldRoleIds={activeSpaceRoleIds}
          canManageChannels={canManageChannels}
          canManageEncryption={canManageEncryption}
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
    </>
  );
}
