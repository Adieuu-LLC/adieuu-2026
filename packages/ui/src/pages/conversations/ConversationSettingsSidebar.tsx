import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { setMemberColorDisplay, type MemberColorDisplay } from '../../hooks/useMemberColorPreference';

export function ConversationSettingsSidebar({
  isGroup,
  isAdmin,
  renameValue,
  onRenameValueChange,
  currentGroupName,
  renaming,
  onRename,
  fsEnabled,
  onFsToggle,
  memberColorDisplay,
  gifsDisabledByAdmin,
  onGifsDisabledByAdminToggle,
  gifsHiddenForMe,
  onGifsHiddenForMeToggle,
}: {
  isGroup: boolean;
  isAdmin: boolean;
  renameValue: string;
  onRenameValueChange: (value: string) => void;
  currentGroupName: string | undefined;
  renaming: boolean;
  onRename: () => void;
  fsEnabled: boolean;
  onFsToggle: (enabled: boolean) => void;
  memberColorDisplay: MemberColorDisplay;
  gifsDisabledByAdmin?: boolean;
  onGifsDisabledByAdminToggle?: (disabled: boolean) => void;
  gifsHiddenForMe?: boolean;
  onGifsHiddenForMeToggle?: (hidden: boolean) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="conversation-settings-sidebar">
      <div className="conversation-settings-header">
        <h3>{t('conversations.settings', 'Settings')}</h3>
      </div>
      <div className="conversation-settings-body">
        {isGroup && isAdmin && (
          <div className="conversation-settings-rename">
            <span className="app-settings-toggle-title">
              {t('conversations.settingsRenameTitle', 'Group Name')}
            </span>
            <div className="conversation-settings-rename-row">
              <Input
                value={renameValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                placeholder={currentGroupName ?? t('conversations.settingsRenamePlaceholder', 'Enter new name...')}
                disabled={renaming}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={onRename}
                disabled={!renameValue.trim() || renaming}
              >
                {renaming
                  ? <span className="spinner spinner-sm" />
                  : t('conversations.settingsRenameSave', 'Save')}
              </Button>
            </div>
          </div>
        )}

        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={fsEnabled}
            onChange={(e) => onFsToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.settingsFs', 'Forward Secrecy')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('conversations.settingsFsHint', 'Default messages in this conversation to use forward secrecy. Messages without FS remain end-to-end encrypted but persist in history.')}
            </span>
          </span>
        </label>

        <div className="conversation-settings-color-display">
          <span className="app-settings-toggle-title">
            {t('conversations.colorDisplayMode', 'Member colour display')}
          </span>
          <div className="conversation-settings-color-options">
            {(['name-only', 'name-and-accent', 'name-and-bubble'] as const).map((mode) => (
              <label key={mode} className="conversation-settings-color-option">
                <input
                  type="radio"
                  name="memberColorDisplay"
                  checked={memberColorDisplay === mode}
                  onChange={() => setMemberColorDisplay(mode)}
                />
                <span>
                  {mode === 'name-only' && t('conversations.colorDisplayNameOnly', 'Name only')}
                  {mode === 'name-and-accent' && t('conversations.colorDisplayNameAccent', 'Name + avatar accent')}
                  {mode === 'name-and-bubble' && t('conversations.colorDisplayNameBubble', 'Name + bubble tint')}
                </span>
              </label>
            ))}
          </div>
        </div>

        {(isAdmin || !isGroup) && onGifsDisabledByAdminToggle && (
          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={gifsDisabledByAdmin ?? false}
              onChange={(e) => onGifsDisabledByAdminToggle(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('gif.conversationDisabledByAdmin')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('gif.conversationDisabledByAdminHint', 'This disables GIF and sticker content for all members')}
              </span>
            </span>
          </label>
        )}

        {!gifsDisabledByAdmin && onGifsHiddenForMeToggle && (
          <label className="app-settings-toggle">
            <input
              type="checkbox"
              checked={gifsHiddenForMe ?? false}
              onChange={(e) => onGifsHiddenForMeToggle(e.target.checked)}
            />
            <span className="app-settings-toggle-label">
              <span className="app-settings-toggle-title">
                {t('gif.conversationHideForMe')}
              </span>
              <span className="app-settings-toggle-hint">
                {t('gif.conversationHideForMeHint', 'Only affects your view')}
              </span>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}
