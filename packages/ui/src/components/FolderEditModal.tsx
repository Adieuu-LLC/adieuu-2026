/**
 * FolderEditModal — modal for editing a folder's name, icon, and colour.
 *
 * Shows a name input, a grid of icon choices (Dynamic + 12 FA icons),
 * and a colour picker (visible only when an FA icon is selected).
 */

import { useState, useCallback, useEffect } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Input } from './Input';
import { ProfileColorPicker } from './ProfileColorPicker';
import { Icon } from '../icons/Icon';
import type { AppIconName } from '../icons/appIcons';
import type { FolderIconType, FolderIconName } from '@adieuu/shared';

const FOLDER_ICON_OPTIONS: { name: FolderIconName; appIcon: AppIconName }[] = [
  { name: 'folder', appIcon: 'folder' },
  { name: 'folders', appIcon: 'folders' },
  { name: 'layer-group', appIcon: 'layerGroup' },
  { name: 'ball-pile', appIcon: 'ballPile' },
  { name: 'building', appIcon: 'building' },
  { name: 'family', appIcon: 'family' },
  { name: 'sportsball', appIcon: 'sportsball' },
  { name: 'dice', appIcon: 'dice' },
  { name: 'dice-d10', appIcon: 'diceD10' },
  { name: 'dice-d12', appIcon: 'diceD12' },
  { name: 'game-board', appIcon: 'gameboard' },
  { name: 'game-console-handheld', appIcon: 'gameConsoleHandheld' },
];

export interface FolderEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  initialIconType: FolderIconType;
  initialIconName?: string;
  initialIconColor?: string;
  onSave: (data: {
    name: string;
    iconType: FolderIconType;
    iconName?: FolderIconName;
    iconColor?: string | null;
  }) => void;
  loading?: boolean;
}

export function FolderEditModal({
  open,
  onOpenChange,
  initialName,
  initialIconType,
  initialIconName,
  initialIconColor,
  onSave,
  loading,
}: FolderEditModalProps) {
  const { t } = useTranslation();

  const [name, setName] = useState(initialName);
  const [iconType, setIconType] = useState<FolderIconType>(initialIconType);
  const [iconName, setIconName] = useState<FolderIconName | undefined>(
    initialIconName as FolderIconName | undefined,
  );
  const [iconColor, setIconColor] = useState<string | null>(
    initialIconColor ?? null,
  );

  useEffect(() => {
    if (open) {
      setName(initialName);
      setIconType(initialIconType);
      setIconName(initialIconName as FolderIconName | undefined);
      setIconColor(initialIconColor ?? null);
    }
  }, [open, initialName, initialIconType, initialIconName, initialIconColor]);

  const handleSave = useCallback(() => {
    onSave({
      name: name.trim() || initialName,
      iconType,
      iconName: iconType === 'icon' ? iconName : undefined,
      iconColor: iconType === 'icon' ? iconColor : null,
    });
  }, [name, iconType, iconName, iconColor, initialName, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) handleSave();
    },
    [handleSave, loading],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content folder-edit-modal">
            <Dialog.Title className="confirm-dialog-title">
              {t('conversations.folders.rename')}
            </Dialog.Title>

            <div className="folder-edit-modal-body">
              <Input
                inputSize="sm"
                placeholder={t('conversations.folders.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                autoFocus
              />

              <div className="folder-edit-icon-section">
                <button
                  type="button"
                  className={`folder-edit-icon-option folder-edit-icon-option--dynamic ${iconType === 'dynamic' ? 'folder-edit-icon-option--selected' : ''}`}
                  onClick={() => setIconType('dynamic')}
                  disabled={loading}
                >
                  <span className="folder-edit-icon-option-preview folder-edit-icon-dynamic-preview">
                    <span className="folder-edit-icon-dynamic-dot" />
                    <span className="folder-edit-icon-dynamic-dot" />
                    <span className="folder-edit-icon-dynamic-dot" />
                  </span>
                  <span className="folder-edit-icon-option-label">
                    {t('conversations.folders.iconDynamic')}
                  </span>
                </button>

                {FOLDER_ICON_OPTIONS.map((opt) => {
                  const isSelected = iconType === 'icon' && iconName === opt.name;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      className={`folder-edit-icon-option ${isSelected ? 'folder-edit-icon-option--selected' : ''}`}
                      onClick={() => {
                        setIconType('icon');
                        setIconName(opt.name);
                      }}
                      disabled={loading}
                    >
                      <span
                        className="folder-edit-icon-option-preview"
                        style={isSelected && iconColor ? { color: iconColor } : undefined}
                      >
                        <Icon name={opt.appIcon} />
                      </span>
                    </button>
                  );
                })}
              </div>

              {iconType === 'icon' && (
                <ProfileColorPicker
                  label={t('conversations.folders.colorLabel')}
                  value={iconColor}
                  onChange={setIconColor}
                  disabled={loading}
                />
              )}
            </div>

            <div className="confirm-dialog-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                {t('conversations.folders.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={loading || !name.trim()}
              >
                {t('conversations.folders.save')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
