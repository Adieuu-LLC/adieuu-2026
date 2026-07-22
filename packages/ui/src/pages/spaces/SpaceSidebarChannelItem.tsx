/**
 * One channel row in the Space secondary sidebar (text or voice).
 */

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicSpaceChannel, PublicSpaceVoiceSession } from '@adieuu/shared';
import type { SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';
import { resolveChannelDisplayName } from './spaceMetadataCipher';
import { DraggableSpaceItem, DroppableSpaceTarget } from './spaceSidebarDnd';

export interface SpaceSidebarChannelItemProps {
  channel: PublicSpaceChannel;
  slug: string;
  spaceId: string | undefined;
  spaceCipher: CommunityCipher | null;
  unread: SpaceChannelUnreadState | undefined;
  voiceSession: PublicSpaceVoiceSession | undefined;
  canManageChannels: boolean;
  navLinkClass: (args: { isActive: boolean }) => string;
  onNavigate: () => void;
  onJoinVoice?: (spaceId: string, channelId: string) => void;
  wrapWithMenu: (node: ReactNode) => ReactNode;
}

export function SpaceSidebarChannelItem({
  channel: ch,
  slug,
  spaceId,
  spaceCipher,
  unread,
  voiceSession,
  canManageChannels,
  navLinkClass,
  onNavigate,
  onJoinVoice,
  wrapWithMenu,
}: SpaceSidebarChannelItemProps) {
  const { t } = useTranslation();
  const channelName = resolveChannelDisplayName(ch, spaceCipher, {
    encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
  });
  const isVoice = ch.type === 'voice';
  const presentPeople =
    voiceSession?.participants.filter((p) => !p.leftAt).map((p) => p.identityId) ?? [];

  const link = (
    <NavLink
      to={`/s/${slug}/c/${ch.id}`}
      className={navLinkClass}
      onClick={() => {
        onNavigate();
        if (isVoice && spaceId && onJoinVoice) {
          onJoinVoice(spaceId, ch.id);
        }
      }}
    >
      <span
        className={`space-sidebar-channel-hash${isVoice ? ' space-sidebar-channel-hash--voice' : ''}`}
      >
        {isVoice ? '♪' : '#'}
      </span>
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

  const channelBlock = (
    <>
      {link}
      {isVoice && presentPeople.length > 0 && (
        <ul className="space-sidebar-voice-presence">
          {presentPeople.map((id) => (
            <li key={id}>{id.slice(-6)}</li>
          ))}
        </ul>
      )}
    </>
  );

  const wrapped = wrapWithMenu(channelBlock);

  if (!canManageChannels) {
    return <div key={ch.id}>{wrapped}</div>;
  }

  return (
    <DraggableSpaceItem key={ch.id} id={`channel:${ch.id}`}>
      <DroppableSpaceTarget id={`channel:${ch.id}`} data={{ kind: 'channel', id: ch.id }}>
        {wrapped}
      </DroppableSpaceTarget>
    </DraggableSpaceItem>
  );
}
