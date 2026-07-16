import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Menu } from '@ark-ui/react';
import { Icon } from '../../icons/Icon';

export interface MessageContextMenuItemsProps {
  isOwn: boolean;
  isDeleted: boolean;
  canShowEditControl: boolean;
  canStartEdit: boolean;
  editMaxedReason: string;
  canManagePin: boolean;
  isPinned: boolean;
  hasReply: boolean;
}

export const MessageContextMenuItems = memo(function MessageContextMenuItems({
  isOwn,
  isDeleted,
  canShowEditControl,
  canStartEdit,
  editMaxedReason,
  canManagePin,
  isPinned,
  hasReply,
}: MessageContextMenuItemsProps) {
  const { t } = useTranslation();

  return (
    <>
      {hasReply && !isDeleted && (
        <Menu.Item value="reply" className="dm-context-menu-item">
          <Icon name="reply" className="dm-context-menu-item-icon" />
          {t('conversations.reply', 'Reply')}
        </Menu.Item>
      )}
      {canShowEditControl && (
        <Menu.Item value="edit" className="dm-context-menu-item" disabled={!canStartEdit} title={!canStartEdit ? editMaxedReason : undefined}>
          <Icon name="pen" className="dm-context-menu-item-icon" />
          {t('conversations.editMessage')}
        </Menu.Item>
      )}
      {canManagePin && !isDeleted && (
        isPinned ? (
          <Menu.Item value="unpin" className="dm-context-menu-item">
            <Icon name="locationPin" className="dm-context-menu-item-icon" />
            {t('conversations.unpinMessage', 'Unpin message')}
          </Menu.Item>
        ) : (
          <Menu.Item value="pin" className="dm-context-menu-item">
            <Icon name="locationPin" className="dm-context-menu-item-icon" />
            {t('conversations.pinMessage', 'Pin message')}
          </Menu.Item>
        )
      )}
      <Menu.Item value="react" className="dm-context-menu-item">
        <Icon name="smilePlus" className="dm-context-menu-item-icon" />
        React
      </Menu.Item>
      {!isOwn && !isDeleted && (
        <Menu.Item value="report" className="dm-context-menu-item dm-context-menu-item--danger">
          <Icon name="warning" className="dm-context-menu-item-icon" />
          {t('report.reportMessage', 'Report Message')}
        </Menu.Item>
      )}
      <Menu.Item value="delete-for-me" className="dm-context-menu-item">
        <Icon name="trash" className="dm-context-menu-item-icon" />
        Delete for me
      </Menu.Item>
      {isOwn && (
        <Menu.Item value="delete-for-everyone" className="dm-context-menu-item dm-context-menu-item--danger">
          <Icon name="trash" className="dm-context-menu-item-icon" />
          Delete for everyone
        </Menu.Item>
      )}
    </>
  );
});
