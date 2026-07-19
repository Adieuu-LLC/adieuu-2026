import { Menu } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../icons/Icon';

export interface ComposerContextMenuProps {
  disabled?: boolean;
  sending: boolean;
}

/** Right-click context menu items for the composer field (copy / copy-all / select-all / paste). */
export function ComposerContextMenu({ disabled, sending }: ComposerContextMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu.Content className="dm-context-menu">
      <Menu.Item value="copy" className="dm-context-menu-item" disabled={disabled || sending}>
        <Icon name="copy" className="dm-context-menu-item-icon" />
        {t('conversations.contextMenu.copy', 'Copy')}
      </Menu.Item>
      <Menu.Item value="copy-all" className="dm-context-menu-item" disabled={disabled || sending}>
        <Icon name="copyAll" className="dm-context-menu-item-icon" />
        {t('conversations.contextMenu.copyAll', 'Copy all')}
      </Menu.Item>
      <Menu.Item value="select-all" className="dm-context-menu-item" disabled={disabled || sending}>
        <Icon name="selectAll" className="dm-context-menu-item-icon" />
        {t('conversations.contextMenu.selectAll', 'Select all')}
      </Menu.Item>
      <Menu.Item value="paste" className="dm-context-menu-item" disabled={disabled || sending}>
        <Icon name="fileImport" className="dm-context-menu-item-icon" />
        {t('conversations.contextMenu.paste', 'Paste')}
      </Menu.Item>
    </Menu.Content>
  );
}
