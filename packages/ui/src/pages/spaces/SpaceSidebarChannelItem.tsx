/**
 * One channel row in the Space secondary sidebar (text or voice).
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CommunityCipher } from '@adieuu/crypto';
import type { PublicSpaceChannel, PublicSpaceVoiceSession } from '@adieuu/shared';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { useIdentity } from '../../hooks/useIdentity';
import { useSpaces } from '../../hooks/useSpaces';
import type { SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';
import { resolveDisplayName } from '../conversations/conversationUtils';
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
  const { identity } = useIdentity();
  const { participantProfiles, resolveProfiles } = useSpaces();
  const channelName = resolveChannelDisplayName(ch, spaceCipher, {
    encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
  });
  const isVoice = ch.type === 'voice';
  const presentPeople = useMemo(
    () => voiceSession?.participants.filter((p) => !p.leftAt).map((p) => p.identityId) ?? [],
    [voiceSession?.participants],
  );
  const presentPeopleKey = presentPeople.join(',');

  useEffect(() => {
    if (!isVoice || presentPeople.length === 0) return;
    const missing = presentPeople.filter((id) => !participantProfiles[id]);
    if (missing.length > 0) resolveProfiles(missing);
    // presentPeopleKey tracks identity-set changes without array identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional key + profiles
  }, [isVoice, presentPeopleKey, participantProfiles, resolveProfiles]);

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
          {presentPeople.map((id) => {
            const profile = participantProfiles[id];
            const displayName = resolveDisplayName(
              id,
              participantProfiles,
              {},
              identity?.id,
              t,
            );
            const row = (
              <div className="space-sidebar-voice-presence-row">
                <span className="space-sidebar-voice-presence-avatar" aria-hidden>
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt="" />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="space-sidebar-voice-presence-name">{displayName}</span>
              </div>
            );
            return (
              <li key={id}>
                {profile ? (
                  <IdentityHoverCard
                    identity={profile}
                    positioning={{ placement: 'right-start', gutter: 8 }}
                  >
                    {row}
                  </IdentityHoverCard>
                ) : (
                  row
                )}
              </li>
            );
          })}
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
