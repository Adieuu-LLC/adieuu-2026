import { Fragment, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { HoverCard } from '../../components/HoverCard';
import { Icon } from '../../icons/Icon';
import { IdentityHoverCardContent } from '../../components/IdentityHoverCard';
import { useConversations, type DecryptedConversation } from '../../hooks/useConversations';
import { ConversationSidebarHoverMeta } from './ConversationSidebarHoverMeta';

/**
 * Sidebar DM row: resolve the other participant on hover, then show the standard identity hover panel.
 * Pass the context-menu trigger (ContextTrigger asChild around the row button) as `children`.
 */
export function SidebarConversationDmHoverCard({
  conversation,
  otherUserId,
  hasActiveCall,
  children,
}: {
  conversation: DecryptedConversation;
  otherUserId: string;
  hasActiveCall?: boolean;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { participantProfiles, prefetchParticipantProfiles, fetchConversationById } = useConversations();
  const profile = participantProfiles[otherUserId];

  return (
    <HoverCard
      trigger={children}
      positioning={{ placement: 'right-start', gutter: 12 }}
      className="identity-hover-card"
      openDelay={300}
      closeDelay={200}
      onOpenChange={(details: { open: boolean }) => {
        if (details.open) {
          void prefetchParticipantProfiles([otherUserId]);
          void fetchConversationById(conversation.id);
        }
      }}
    >
      <Fragment>
        {profile ? (
          <IdentityHoverCardContent identity={profile} />
        ) : (
          <div className="invite-group-hover-card-loading">
            <span className="spinner spinner-sm" />
          </div>
        )}
        {hasActiveCall && (
          <div className="invite-group-hover-card-active-call">
            <Icon name="phone" className="invite-group-hover-card-active-call-icon" />
            <span className="invite-group-hover-card-active-call-text">
              {t('call.hoverActiveCallDm', 'Active call')}
            </span>
          </div>
        )}
        <div className="identity-hover-card-dm-conversation-meta">
          <ConversationSidebarHoverMeta conversation={conversation} />
        </div>
      </Fragment>
    </HoverCard>
  );
}
