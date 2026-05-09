import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { useIsMobile } from '../../hooks/useIsMobile';

export type ConversationToolbarAvatarMember = {
  id: string;
  displayName: string;
  avatarUrl?: string;
};

function ToolbarAvatarOrStack({ members, titleFallbackLetter }: { members: ConversationToolbarAvatarMember[]; titleFallbackLetter: string }) {
  if (members.length === 0) {
    return (
      <span className="conversation-toolbar-avatar-placeholder">
        {titleFallbackLetter}
      </span>
    );
  }
  if (members.length === 1) {
    const m = members[0]!;
    return m.avatarUrl ? (
      <img src={m.avatarUrl} alt="" className="conversation-toolbar-avatar-img" />
    ) : (
      <span className="conversation-toolbar-avatar-placeholder">
        {m.displayName.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <div className="conversation-toolbar-avatar-stack">
      {members.map((m) => (
        <span key={m.id} className="conversation-toolbar-avatar-stack-item">
          {m.avatarUrl ? (
            <img src={m.avatarUrl} alt="" className="conversation-toolbar-avatar-stack-item-img" />
          ) : (
            <span className="conversation-toolbar-avatar-stack-item-placeholder">
              {m.displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

export function ConversationToolbar({
  displayName,
  avatarMembers,
  subtitle,
  pinsSlot,
  searchSlot,
  mediaJobsSlot,
  deviceSignaturesSlot,
  showSettings,
  onToggleSettings,
  showMembers,
  onToggleMembers,
  isGroup,
  canDeleteConversation,
  onDeleteGroup,
  onLeave,
  onToggleSearch,
  isSearchActive,
  onToggleMediaOutbox,
  hasMediaOutboxJobs,
  onOpenDeviceSignatures,
  hasDeviceSignatures,
}: {
  displayName: string;
  /** Resolved participant avatars for the left chip (1 image or a stack for groups / multi-DM). */
  avatarMembers?: ConversationToolbarAvatarMember[];
  /** Plain fallback (members / "Direct message") or rich node (e.g. latest pin control). */
  subtitle: ReactNode;
  /** Pinned messages popover control (toolbar icon). */
  pinsSlot?: ReactNode;
  /** E2E message search (opens local plaintext search). */
  searchSlot?: ReactNode;
  /** Background moderation scan upload status (toolbar icon + panel). */
  mediaJobsSlot?: ReactNode;
  /** Quick access to the viewer's own device signatures (e.g. key icon). */
  deviceSignaturesSlot?: ReactNode;
  showSettings: boolean;
  onToggleSettings: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  isGroup: boolean;
  /** Group: admin only. Topical DM: either participant. */
  canDeleteConversation: boolean;
  onDeleteGroup: () => void;
  onLeave: () => void;
  /** Mobile menu: toggle message search. */
  onToggleSearch?: () => void;
  /** Mobile menu: whether search is currently active. */
  isSearchActive?: boolean;
  /** Mobile menu: open the media outbox panel. */
  onToggleMediaOutbox?: () => void;
  /** Mobile menu: whether there are pending media outbox jobs. */
  hasMediaOutboxJobs?: boolean;
  /** Mobile menu: open device signatures. */
  onOpenDeviceSignatures?: () => void;
  /** Mobile menu: whether device signatures action is available. */
  hasDeviceSignatures?: boolean;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const showMoreMenu = canDeleteConversation || isGroup;

  const mobileMenuItems = isMobile ? (
    <>
      {onToggleSearch && (
        <Menu.Item
          value="search"
          className={`dm-context-menu-item${isSearchActive ? ' dm-context-menu-item--active' : ''}`}
          onClick={onToggleSearch}
        >
          <Icon name="search" className="dm-context-menu-item-icon" />
          {isSearchActive
            ? t('conversations.messageSearch.endSearch', 'End search')
            : t('conversations.messageSearch.title', 'Search messages')}
        </Menu.Item>
      )}
      {onToggleMediaOutbox && hasMediaOutboxJobs && (
        <Menu.Item value="mediaOutbox" className="dm-context-menu-item" onClick={onToggleMediaOutbox}>
          <Icon name="fileArrowUp" className="dm-context-menu-item-icon" />
          {t('conversations.mediaOutbox.toolbarTitle', 'Pending uploads')}
        </Menu.Item>
      )}
      {hasDeviceSignatures && onOpenDeviceSignatures && (
        <Menu.Item value="deviceSigs" className="dm-context-menu-item" onClick={onOpenDeviceSignatures}>
          <Icon name="key" className="dm-context-menu-item-icon" />
          {t('conversations.memberSecurity.toolbarAria', 'Device signatures')}
        </Menu.Item>
      )}
      <Menu.Item
        value="settings"
        className={`dm-context-menu-item${showSettings ? ' dm-context-menu-item--active' : ''}`}
        onClick={onToggleSettings}
      >
        <Icon name="settings" className="dm-context-menu-item-icon" />
        {t('conversations.settings', 'Settings')}
      </Menu.Item>
      <Menu.Item
        value="members"
        className={`dm-context-menu-item${showMembers ? ' dm-context-menu-item--active' : ''}`}
        onClick={onToggleMembers}
      >
        <Icon name="users" className="dm-context-menu-item-icon" />
        {t('conversations.members', 'Members')}
      </Menu.Item>
    </>
  ) : null;

  const hasAnyMoreItems = showMoreMenu || isMobile;

  return (
    <div className="conversation-toolbar">
      <div className="conversation-toolbar-left">
        <div
          className={
            avatarMembers && avatarMembers.length > 1
              ? 'conversation-toolbar-avatar-group'
              : 'conversation-toolbar-avatar'
          }
          aria-hidden
        >
          <ToolbarAvatarOrStack
            members={avatarMembers ?? []}
            titleFallbackLetter={displayName.charAt(0).toUpperCase()}
          />
        </div>
        <div className="conversation-toolbar-info">
          <span className="conversation-toolbar-title">{displayName}</span>
          {typeof subtitle === 'string' ? (
            <span className="conversation-toolbar-subtitle">{subtitle}</span>
          ) : (
            subtitle
          )}
        </div>
      </div>
      <div className="conversation-toolbar-right">
        {pinsSlot}
        {!isMobile && searchSlot}
        {!isMobile && mediaJobsSlot}
        {!isMobile && deviceSignaturesSlot}
        {!isMobile && (
          <Tooltip content={t('conversations.settings', 'Settings')} position="bottom">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${showSettings ? ' active' : ''}`}
              onClick={onToggleSettings}
              aria-label={t('conversations.settings', 'Settings')}
              aria-pressed={showSettings}
            >
              <span className="conversation-toolbar-btn-icon" aria-hidden>
                <Icon name="settings" size="sm" />
              </span>
            </Button>
          </Tooltip>
        )}
        {!isMobile && (
          <Tooltip content={t('conversations.members', 'Members')} position="bottom">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className={`conversation-toolbar-btn conversation-toolbar-btn--icon-only${showMembers ? ' active' : ''}`}
              onClick={onToggleMembers}
              aria-label={t('conversations.members', 'Members')}
              aria-pressed={showMembers}
            >
              <span className="conversation-toolbar-btn-icon" aria-hidden>
                <Icon name="users" size="sm" />
              </span>
            </Button>
          </Tooltip>
        )}
        {hasAnyMoreItems && (
          <Menu.Root positioning={{ placement: 'bottom-end', gutter: 8 }}>
            <Menu.Trigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className="conversation-toolbar-btn conversation-toolbar-btn--icon-only"
                aria-label={t('conversations.moreOptions', 'More options')}
                aria-haspopup="menu"
                title={t('conversations.moreOptions', 'More options')}
              >
                <span className="conversation-toolbar-btn-icon" aria-hidden>
                  <Icon name="ellipsisVertical" size="sm" />
                </span>
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content className="dm-context-menu conversation-toolbar-more-menu">
                  {mobileMenuItems}
                  {isMobile && showMoreMenu && (
                    <div className="dm-context-menu-separator" />
                  )}
                  {canDeleteConversation && (
                    <Menu.Item
                      value="delete"
                      className="dm-context-menu-item dm-context-menu-item--danger"
                      onClick={onDeleteGroup}
                    >
                      <Icon name="trash" className="dm-context-menu-item-icon" />
                      {isGroup
                        ? t('conversations.deleteGroup', 'Delete Group')
                        : t('conversations.deleteConversation', 'Delete conversation')}
                    </Menu.Item>
                  )}
                  {isGroup && (
                    <Menu.Item value="leave" className="dm-context-menu-item" onClick={onLeave}>
                      <Icon name="logout" className="dm-context-menu-item-icon" />
                      {t('conversations.leave', 'Leave')}
                    </Menu.Item>
                  )}
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        )}
      </div>
    </div>
  );
}
