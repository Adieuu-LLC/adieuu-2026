import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu, Portal } from '@ark-ui/react';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';

export function ConversationToolbar({
  displayName,
  subtitle,
  pinsSlot,
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
}: {
  displayName: string;
  subtitle: string;
  /** Pinned messages popover control (toolbar icon). */
  pinsSlot?: ReactNode;
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
}) {
  const { t } = useTranslation();
  const showMoreMenu = canDeleteConversation || isGroup;

  return (
    <div className="conversation-toolbar">
      <div className="conversation-toolbar-left">
        <div className="conversation-toolbar-avatar">
          <span className="conversation-toolbar-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="conversation-toolbar-info">
          <span className="conversation-toolbar-title">{displayName}</span>
          <span className="conversation-toolbar-subtitle">{subtitle}</span>
        </div>
      </div>
      <div className="conversation-toolbar-right">
        {pinsSlot}
        {mediaJobsSlot}
        {deviceSignaturesSlot}
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
        {showMoreMenu && (
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
