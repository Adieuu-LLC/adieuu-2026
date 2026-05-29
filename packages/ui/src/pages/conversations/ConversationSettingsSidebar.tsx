import { useTranslation } from 'react-i18next';
import { SegmentGroup, Tabs } from '@ark-ui/react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../icons/Icon';
import { InfoTip } from '../../components/InfoTip';
import { setMemberColorDisplay, type MemberColorDisplay } from '../../hooks/useMemberColorPreference';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { GifContentFilter } from '@adieuu/shared';

const GIF_CONTENT_FILTER_OPTIONS: GifContentFilter[] = ['off', 'low', 'medium', 'high'];

const CONTENT_FILTER_LABEL_KEYS: Record<GifContentFilter, string> = {
  off: 'gif.contentFilterOff',
  low: 'gif.contentFilterLow',
  medium: 'gif.contentFilterMedium',
  high: 'gif.contentFilterHigh',
};

const CONTENT_FILTER_TOOLTIP_KEYS: Record<GifContentFilter, string> = {
  off: 'gif.contentFilterOffTooltip',
  low: 'gif.contentFilterLowTooltip',
  medium: 'gif.contentFilterMediumTooltip',
  high: 'gif.contentFilterHighTooltip',
};

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
  gifContentFilter,
  onGifContentFilterChange,
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
  audioCallsDisabled,
  onAudioCallsDisabledToggle,
  videoCallsDisabled,
  onVideoCallsDisabledToggle,
  screenshareDisabled,
  onScreenshareDisabledToggle,
  onClose,
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
  gifContentFilter?: GifContentFilter;
  onGifContentFilterChange?: (filter: GifContentFilter) => void;
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
  audioCallsDisabled?: boolean;
  onAudioCallsDisabledToggle?: (disabled: boolean) => void;
  videoCallsDisabled?: boolean;
  onVideoCallsDisabledToggle?: (disabled: boolean) => void;
  screenshareDisabled?: boolean;
  onScreenshareDisabledToggle?: (disabled: boolean) => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

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

      {(isAdmin || !isGroup) && !gifsDisabledByAdmin && onGifContentFilterChange && (
        <div className="conversation-settings-content-filter">
          <span className="app-settings-toggle-title">
            {t('gif.contentFilterTitle', 'GIF/Sticker content filter')}
            <InfoTip
              content={
                <ul className="content-filter-info-list">
                  {GIF_CONTENT_FILTER_OPTIONS.map((level) => (
                    <li key={level}>
                      <strong>{t(CONTENT_FILTER_LABEL_KEYS[level] as never)}</strong>
                      {': '}
                      {t(CONTENT_FILTER_TOOLTIP_KEYS[level] as never)}
                    </li>
                  ))}
                </ul>
              }
              position="bottom"
              className="content-filter-info-tooltip"
            >
              <span className="content-filter-info-icon" aria-label={t('gif.contentFilterInfoLabel', 'Filter level details')}>
                <Icon name="info" size="sm" />
              </span>
            </InfoTip>
          </span>
          <span className="app-settings-toggle-hint">
            {t(
              'gif.contentFilterHint',
              'Controls the content safety level for GIF and sticker search results in this conversation. Higher levels are more restrictive.',
            )}
          </span>
          <SegmentGroup.Root
            className="content-filter-segment-group"
            value={gifContentFilter ?? 'off'}
            onValueChange={(e) => onGifContentFilterChange(e.value as GifContentFilter)}
          >
            <SegmentGroup.Indicator className="content-filter-segment-indicator" />
            {GIF_CONTENT_FILTER_OPTIONS.map((level) => (
              <SegmentGroup.Item
                key={level}
                className="content-filter-segment-item"
                value={level}
              >
                <SegmentGroup.ItemText>{t(CONTENT_FILTER_LABEL_KEYS[level] as never)}</SegmentGroup.ItemText>
                <SegmentGroup.ItemControl />
                <SegmentGroup.ItemHiddenInput />
              </SegmentGroup.Item>
            ))}
          </SegmentGroup.Root>
        </div>
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

      {(isAdmin || !isGroup) && onAudioCallsDisabledToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={!(audioCallsDisabled ?? false)}
            onChange={(e) => onAudioCallsDisabledToggle(!e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.audioCallsEnabled', 'Allow audio calls')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('conversations.audioCallsEnabledHint', 'When disabled, participants cannot start or join audio calls.')}
            </span>
          </span>
        </label>
      )}

      {(isAdmin || !isGroup) && onVideoCallsDisabledToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={!(videoCallsDisabled ?? false)}
            onChange={(e) => onVideoCallsDisabledToggle(!e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.videoCallsEnabled', 'Allow video calls')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('conversations.videoCallsEnabledHint', 'When disabled, participants cannot enable video in calls.')}
            </span>
          </span>
        </label>
      )}

      {(isAdmin || !isGroup) && onScreenshareDisabledToggle && (
        <label className="app-settings-toggle">
          <input
            type="checkbox"
            checked={!(screenshareDisabled ?? false)}
            onChange={(e) => onScreenshareDisabledToggle(!e.target.checked)}
          />
          <span className="app-settings-toggle-label">
            <span className="app-settings-toggle-title">
              {t('conversations.screenshareEnabled', 'Allow screen sharing')}
            </span>
            <span className="app-settings-toggle-hint">
              {t('conversations.screenshareEnabledHint', 'When disabled, participants cannot share their screen during calls.')}
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
      {isMobile && onClose && (
        <div className="conversation-pane-mobile-footer">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            {t('conversations.closePane', 'Close')}
          </Button>
        </div>
      )}
    </div>
  );
}
