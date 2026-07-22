import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Tooltip } from '../../components/Tooltip';
import { Icon } from '../../icons/Icon';
import { ChannelPinsMenu } from '../../components/messaging/ChannelPinsMenu';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';

export interface SpaceChannelToolbarProps {
  channelName: string;
  isEncrypted: boolean;
  memberCount: number;
  latestPinInfo: { preview: string; messageId: string } | null;
  scrollToMessageId: (id: string) => void;

  channelId: string;
  pinnedCount: number;
  pinnedMessageIdsKey: string;
  loadPinnedMessagesPage: (
    channelId: string,
    cursor?: string | null,
  ) => Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null>;
  onUnpin: (messageId: string) => Promise<void>;
  canManagePins: boolean;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  identity: { id: string; avatarUrl?: string; displayName?: string } | null | undefined;

  showMembers: boolean;
  onToggleMembers: () => void;
  /** Voice-channel join/leave (only when channel.type === 'voice'). */
  isVoiceChannel?: boolean;
  isInVoice?: boolean;
  onToggleVoice?: () => void;
  t: TFunction;
}

export function SpaceChannelToolbar(props: SpaceChannelToolbarProps): ReactNode {
  const {
    channelName,
    isEncrypted,
    memberCount,
    latestPinInfo,
    scrollToMessageId,
    channelId,
    pinnedCount,
    pinnedMessageIdsKey,
    loadPinnedMessagesPage,
    onUnpin,
    canManagePins,
    participantProfiles,
    memberSettings,
    identity,
    showMembers,
    onToggleMembers,
    isVoiceChannel = false,
    isInVoice = false,
    onToggleVoice,
    t,
  } = props;

  return (
    <div className="space-channel-toolbar">
      <div className="space-channel-toolbar-left">
        <span className="space-channel-toolbar-hash">{isVoiceChannel ? '♪' : '#'}</span>
        <div className="space-channel-toolbar-info">
          <span className="space-channel-toolbar-name">
            {channelName}
            {isEncrypted && (
              <span className="spaces-badge spaces-badge--encrypted spaces-badge--toolbar">
                {t('spaces.encrypted')}
              </span>
            )}
          </span>
          {latestPinInfo ? (
            <button
              type="button"
              className="space-channel-toolbar-subtitle space-channel-toolbar-subtitle--clickable"
              onClick={() => scrollToMessageId(latestPinInfo.messageId)}
            >
              {latestPinInfo.preview}
            </button>
          ) : (
            <span className="space-channel-toolbar-subtitle">
              {`${memberCount} ${t('conversations.members', 'members')}`}
            </span>
          )}
        </div>
      </div>
      <div className="space-channel-toolbar-actions">
        {isVoiceChannel && onToggleVoice && (
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={onToggleVoice}
          >
            {isInVoice ? t('spaces.voice.leave') : t('spaces.voice.join')}
          </Button>
        )}
        <ChannelPinsMenu
          channelId={channelId}
          pinnedCount={pinnedCount}
          pinnedMessageIdsKey={pinnedMessageIdsKey}
          loadPinnedMessagesPage={loadPinnedMessagesPage}
          scrollToMessageId={scrollToMessageId}
          onUnpin={async (msgId) => { await onUnpin(msgId); }}
          canUnpin={canManagePins}
          participantProfiles={participantProfiles}
          memberSettings={memberSettings}
          identity={identity}
        />
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
      </div>
    </div>
  );
}
