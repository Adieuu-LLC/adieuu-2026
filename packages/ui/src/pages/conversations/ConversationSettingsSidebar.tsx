import { useTranslation } from 'react-i18next';
import { Tabs } from '@ark-ui/react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
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
  customEmojisDisabledByAdmin,
  onCustomEmojisDisabledByAdminToggle,
  disallowPersistentMessageSearchCache,
  onMessageSearchCachePolicyToggle,
  allowSkipModeration,
  onAllowSkipModerationToggle,
  gifsHiddenForMe,
  onGifsHiddenForMeToggle,
  gifAnimateOnHoverOnly,
  onGifAnimateOnHoverOnlyToggle,
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
  customEmojisDisabledByAdmin?: boolean;
  onCustomEmojisDisabledByAdminToggle?: (disabled: boolean) => void;
  disallowPersistentMessageSearchCache?: boolean;
  onMessageSearchCachePolicyToggle?: (disallow: boolean) => void;
  allowSkipModeration?: boolean;
  onAllowSkipModerationToggle?: (allow: boolean) => void;
  gifsHiddenForMe?: boolean;
  onGifsHiddenForMeToggle?: (hidden: boolean) => void;
  gifAnimateOnHoverOnly?: boolean;
  onGifAnimateOnHoverOnlyToggle?: (value: boolean) => void;
}) {
  const { t } = useTranslation();

  const hasConversationTab =
    (isGroup && isAdmin) || (!isGroup && (!!onGifsDisabledByAdminToggle || !!onCustomEmojisDisabledByAdminToggle));

  const personalControls = (
    <>
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
            {t(
              'conversations.settingsFsHint',
              'Default messages in this conversation to use forward secrecy. Messages without FS remain end-to-end encrypted but persist in history.',
            )}
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

      {!gifsDisabledByAdmin && onGifAnimateOnHoverOnlyToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={gifAnimateOnHoverOnly ?? false}
            onChange={(e) => onGifAnimateOnHoverOnlyToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">{t('gif.animateOnHoverOnly')}</span>
            <span className="app-settings-toggle-hint">{t('gif.animateOnHoverOnlyHint')}</span>
          </span>
        </label>
      )}
    </>
  );

  const conversationControls = (
    <>
      {isGroup && isAdmin && (
        <div className="conversation-settings-rename">
          <span className="app-settings-toggle-title">
            {t('conversations.settingsRenameTitle', 'Conversation topic or name')}
          </span>
          <div className="conversation-settings-rename-row">
            <Input
              value={renameValue}
              onChange={(e) => onRenameValueChange(e.target.value)}
              placeholder={
                currentGroupName ?? t('conversations.settingsRenamePlaceholder', 'Enter new name...')
              }
              disabled={renaming}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={onRename}
              disabled={!renameValue.trim() || renaming}
            >
              {renaming ? (
                <span className="spinner spinner-sm" />
              ) : (
                t('conversations.settingsRenameSave', 'Save')
              )}
            </Button>
          </div>
        </div>
      )}

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
              {t(
                'gif.conversationDisabledByAdminHint',
                'This disables GIF and sticker content for all members',
              )}
            </span>
          </span>
        </label>
      )}

      {(isAdmin || !isGroup) && onCustomEmojisDisabledByAdminToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={customEmojisDisabledByAdmin ?? false}
            onChange={(e) => onCustomEmojisDisabledByAdminToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('customEmoji.conversationDisabledByAdmin', 'Disable custom emojis')}
            </span>
            <span className="app-settings-toggle-hint">
              {t(
                'customEmoji.conversationDisabledByAdminHint',
                'This disables custom emoji usage for all members',
              )}
            </span>
          </span>
        </label>
      )}

      {(isAdmin || !isGroup) && onMessageSearchCachePolicyToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={disallowPersistentMessageSearchCache ?? false}
            onChange={(e) => onMessageSearchCachePolicyToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.messageSearch.settingsDisallowTitle')}
            </span>
            <span className="app-settings-toggle-hint">{t('conversations.messageSearch.settingsDisallowHint')}</span>
          </span>
        </label>
      )}

      {(isAdmin || !isGroup) && onAllowSkipModerationToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={allowSkipModeration ?? false}
            onChange={(e) => onAllowSkipModerationToggle(e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.allowSkipModeration', 'Allow members to skip moderation')}
            </span>
            <span className="app-settings-toggle-hint">
              {t(
                'conversations.allowSkipModerationHint',
                'Members can choose to skip content moderation scanning when sending media. Recipients may hide unmoderated content.',
              )}
            </span>
          </span>
        </label>
      )}
    </>
  );

  return (
    <div className="conversation-settings-sidebar">
      <div className="conversation-settings-header">
        <h3>{t('conversations.settings', 'Settings')}</h3>
      </div>

      {hasConversationTab ? (
        <Tabs.Root className="conversation-settings-tabs" defaultValue="personal">
          <Tabs.List className="conversation-settings-tabs-list">
            <Tabs.Trigger className="conversation-settings-tab" value="personal">
              <span className="conversation-settings-tab-icon" aria-hidden>
                <Icon name="user" />
              </span>
              <span className="conversation-settings-tab-label">
                {t('conversations.settingsTabPersonal', 'For you')}
              </span>
            </Tabs.Trigger>
            <Tabs.Trigger className="conversation-settings-tab" value="conversation">
              <span className="conversation-settings-tab-icon" aria-hidden>
                <Icon name="users" />
              </span>
              <span className="conversation-settings-tab-label">
                {t('conversations.settingsTabConversation', 'Conversation')}
              </span>
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content className="conversation-settings-tab-panel" value="personal">
            {personalControls}
          </Tabs.Content>
          <Tabs.Content className="conversation-settings-tab-panel" value="conversation">
            {conversationControls}
          </Tabs.Content>
        </Tabs.Root>
      ) : (
        <div className="conversation-settings-body">{personalControls}</div>
      )}
    </div>
  );
}
